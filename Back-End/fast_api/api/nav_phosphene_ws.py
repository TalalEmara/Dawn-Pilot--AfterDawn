"""
Navigation-Phosphene WebSocket Handler

Optimized WebSocket endpoint for the full navigation pipeline with phosphene rendering.
This is the MAIN PRODUCTION endpoint.

Pipeline stages:
1. detector - Object detection with bounding boxes
2. translator - Simplified canonical shapes
3. pre_phosphene - Center cropped 128x128
4. phosphene - Final phosphene rendering (full pipeline)

COLOR SPACE: Works in RGB throughout (optimal for ML models)

ARCHITECTURE: Simple Producer-Consumer pattern with asyncio.to_thread + Broadcasting
- Producer: Receives frames from WebSocket (non-blocking)
- Consumer: Processes frames in background thread (no Event Loop blocking)
- Broadcaster: Sends results to ALL connected clients (Desktop + Mobile)
- Automatic frame dropping when processing is slower than input rate
"""

import logging
import base64
import cv2
import numpy as np
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from core import decode_base64_to_rgb
from typing import Set

logger = logging.getLogger(__name__)

# Global service (injected from websocket_routes)
navigation_detector_service = None


class ConnectionManager:
    """Manages multiple WebSocket connections for broadcasting"""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket):
        """Register a new connection"""
        async with self._lock:
            self.active_connections.add(websocket)
            logger.info(f"✅ Client connected: {websocket.client}. Total connections: {len(self.active_connections)}")
    
    async def disconnect(self, websocket: WebSocket):
        """Unregister a connection"""
        async with self._lock:
            self.active_connections.discard(websocket)
            logger.info(f"❌ Client disconnected: {websocket.client}. Total connections: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict):
        """
        Broadcast message to all connected clients.
        Automatically removes failed connections.
        """
        failed_connections = []
        
        async with self._lock:
            connections = list(self.active_connections)
        
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send to {connection.client}: {e}")
                failed_connections.append(connection)
        
        # Remove failed connections
        if failed_connections:
            async with self._lock:
                for conn in failed_connections:
                    self.active_connections.discard(conn)
                    logger.warning(f"Removed failed connection: {conn.client}")
    
    def get_connection_count(self) -> int:
        """Get current number of active connections"""
        return len(self.active_connections)


# Global connection manager
connection_manager = ConnectionManager()

def convert_to_json_serializable(obj):
    """Helper to convert numpy types to JSON-serializable types"""
    import numpy as np
    
    if isinstance(obj, dict):
        return {k: convert_to_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [convert_to_json_serializable(item) for item in obj]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    else:
        return obj

async def handle_navigation_phosphene_websocket(websocket: WebSocket):
    """
    WebSocket handler for full navigation pipeline with phosphene rendering + Broadcasting
    
    Protocol:
    - Client sends: {"type": "frame", "frame_id": str, "rgb": base64, "depth": base64, "stage": str, "debug": bool}
    - Server broadcasts: {"type": "result", "data": {...}} to ALL connected clients
    
    Architecture:
    - Simple Producer-Consumer pattern with shared state + Broadcasting
    - Heavy processing (decoding + inference) runs in background thread via asyncio.to_thread
    - Zero Event Loop blocking during 700ms GPU inference
    - Results broadcast to all clients (Desktop sends frames, Desktop + Mobile receive broadcasts)
    
    Optimizations:
    - RGB color space throughout (no BGR conversions except final encode)
    - Minimal base64 encode/decode operations
    - Debug images only saved when debug=True flag is set
    """
    await websocket.accept()
    await connection_manager.connect(websocket)
    logger.info(f"🌐 Navigation-Phosphene WebSocket connected: {websocket.client}")
    
    if navigation_detector_service is None:
        await websocket.send_json({"type": "error", "error": "Navigation detector service not available"})
        await connection_manager.disconnect(websocket)
        await websocket.close()
        return
    
    # Send welcome message to this client only
    await websocket.send_json({
        "type": "connected",
        "message": "Navigation-Phosphene WebSocket ready",
        "service_ready": navigation_detector_service.is_loaded,
        "total_connections": connection_manager.get_connection_count()
    })
    
    # Shared state for Producer-Consumer pattern
    shared_state = {
        "latest_payload": None,
        "new_data_event": asyncio.Event(),
        "is_running": True
    }
    
    frames_processed = 0
    
    def run_heavy_inference(payload: dict) -> dict:
        """
        Heavy blocking operations (decoding + inference) run in thread pool.
        This prevents Event Loop blocking during 700ms GPU inference.
        """
        try:
            # Decode RGB (always required)
            rgb_b64 = payload["rgb"]
            rgb = decode_base64_to_rgb(rgb_b64)
            
            if rgb is None:
                raise ValueError("Failed to decode RGB image")
            
            # Decode depth (optional)
            depth = None
            depth_b64 = payload.get("depth")
            if depth_b64:
                depth_bytes = base64.b64decode(depth_b64.split(',')[1] if ',' in depth_b64 else depth_b64)
                depth_arr = np.frombuffer(depth_bytes, dtype=np.uint8)
                depth = cv2.imdecode(depth_arr, cv2.IMREAD_GRAYSCALE)
                
                if depth is None:
                    raise ValueError("Failed to decode depth image")
            
            # Run inference (blocking GPU operation - varies by stage)
            result = navigation_detector_service.process_full_pipeline(
                rgb=rgb,
                frame_id=int(payload["frame_id"]) if payload["frame_id"].isdigit() else 0,
                depth=depth,  # Can be None for passthrough/edge_mode
                stop_at=payload["stage"],
                debug_mode=payload["debug_mode"],
                cropping_config=payload.get("cropping_config")
            )
            
            return {"success": True, "result": result}
            
        except Exception as e:
            logger.error(f"Inference error: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    # Producer Task: Receive frames and update shared state
    async def producer():
        """Continuously receive frames from WebSocket - NO blocking"""
        try:
            while shared_state["is_running"]:
                try:
                    message = await websocket.receive_json()
                    
                    # Ignore heartbeat/ping messages from Mobile viewer
                    if message.get("type") == "ping":
                        continue
                    
                    if message.get("type") == "frame":
                        frame_id = message.get("frame_id", "unknown")
                        stage = message.get("stage", "phosphene")
                        debug_mode = message.get("debug", True)
                        cropping_config = message.get("cropping_config")
                        
                        valid_stages = ["passthrough", "edge_mode", "detector", "translator", "pre_phosphene", "phosphene"]
                        if stage not in valid_stages:
                            await connection_manager.broadcast({
                                "type": "error",
                                "frame_id": frame_id,
                                "error": f"Invalid stage '{stage}'. Valid: {valid_stages}"
                            })
                            continue
                        
                        rgb_b64 = message.get("rgb")
                        depth_b64 = message.get("depth")  # Optional now
                        
                        # RGB is always required
                        if not rgb_b64:
                            await connection_manager.broadcast({
                                "type": "error",
                                "frame_id": frame_id,
                                "error": "Missing rgb image"
                            })
                            continue
                        
                        # Depth is only required for detector/translator/phosphene stages
                        depth_required_stages = ["detector", "translator", "pre_phosphene", "phosphene"]
                        if stage in depth_required_stages and not depth_b64:
                            await connection_manager.broadcast({
                                "type": "error",
                                "frame_id": frame_id,
                                "error": f"Depth image is required for stage '{stage}'. Use 'passthrough' or 'edge_mode' for RGB-only processing."
                            })
                            continue
                        
                        # Update shared state (overwrites previous frame - automatic frame dropping)
                        shared_state["latest_payload"] = {
                            "frame_id": frame_id,
                            "stage": stage,
                            "debug_mode": debug_mode,
                            "cropping_config": cropping_config,
                            "rgb": rgb_b64,
                            "depth": depth_b64
                        }
                        shared_state["new_data_event"].set()
                        logger.debug(f"📥 Received frame {frame_id}")
                        
                except Exception as e:
                    logger.error(f"Producer error: {e}", exc_info=True)
                    break
                    
        except WebSocketDisconnect:
            logger.info("Producer: WebSocket disconnected")
        finally:
            shared_state["is_running"] = False
    
    # Consumer Task: Process frames in background thread
    async def consumer():
        """Wait for frames and process them without blocking Event Loop, then broadcast results"""
        nonlocal frames_processed
        
        try:
            while shared_state["is_running"]:
                # Wait for new data
                await shared_state["new_data_event"].wait()
                
                # Get payload and clear event
                payload = shared_state["latest_payload"]
                shared_state["new_data_event"].clear()
                
                if payload is None:
                    continue
                
                frame_id = payload["frame_id"]
                # logger.info(f"🔄 Processing frame {frame_id}")
                print(f"⚡ Starting inference for frame {frame_id} [{payload['stage']} stage]")  # Essential inference marker
                
                # CRITICAL: Run heavy operations in thread pool (non-blocking)
                inference_result = await asyncio.to_thread(run_heavy_inference, payload)
                
                if not inference_result["success"]:
                    await connection_manager.broadcast({
                        "type": "error",
                        "frame_id": frame_id,
                        "error": inference_result.get("error", "Processing failed")
                    })
                    continue
                
                result = inference_result["result"]
                
                # Broadcast response to ALL connected clients (Desktop + Mobile)
                response = {
                    "type": "result",
                    "data": convert_to_json_serializable({
                        "frame_id": frame_id,
                        "stage": payload["stage"],
                        "success": result.get("success", False),
                        "output_image": result.get("output_image"),
                        "detections": result.get("detections", []),
                        "freepath_coordinates": result.get("freepath_coordinates", []),
                        "freepath_circle": result.get("freepath_circle"),
                        "stats": result.get("stats", {}),
                        "error": result.get("error")
                    })
                }
                
                await connection_manager.broadcast(response)
                frames_processed += 1
                
                total_time = sum(result.get("stats", {}).values())
                num_detections = len(result.get("detections", []))
                print(f"✅ Frame {frame_id} complete: {total_time:.0f}ms | {num_detections} objects | {connection_manager.get_connection_count()} clients")  # Essential completion marker
                # logger.info(f"📡 Broadcasted frame {frame_id} to {connection_manager.get_connection_count()} clients (processed in {total_time:.2f}ms)")  # Reduced logging
                
        except Exception as e:
            logger.error(f"Consumer error: {e}", exc_info=True)
        finally:
            shared_state["is_running"] = False
    
    # Run Producer and Consumer concurrently
    try:
        producer_task = asyncio.create_task(producer())
        consumer_task = asyncio.create_task(consumer())
        
        # Wait for either task to complete
        done, pending = await asyncio.wait(
            [producer_task, consumer_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel remaining tasks
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
    finally:
        shared_state["is_running"] = False
        await connection_manager.disconnect(websocket)
        try:
            await websocket.close()
        except:
            pass
        logger.info(f"🌐 Navigation-Phosphene WebSocket closed: {websocket.client} (Processed: {frames_processed} frames)")
