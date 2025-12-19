"""
WebSocket Routes

Real-time frame processing via WebSocket for low-latency streaming.
"""

import asyncio
import time
import logging
import base64
from typing import Dict, Optional
from concurrent.futures import ThreadPoolExecutor
import cv2
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime

from models import DetectionObject
from core import decode_base64_image, save_debug_images

# Thread pool for running synchronous processing
executor = ThreadPoolExecutor(max_workers=2)

logger = logging.getLogger(__name__)

# Global services (injected from main)
detector_service = None
translator_service = None
navigation_detector_service = None

# Keepalive settings
KEEPALIVE_INTERVAL = 5.0  # Send ping every 5 seconds (must be longer than max processing time)


def set_websocket_services(detector, translator, navigation_detector=None):
    """Set service instances (called from main.py)"""
    global detector_service, translator_service, navigation_detector_service
    detector_service = detector
    translator_service = translator
    navigation_detector_service = navigation_detector


class FrameProcessor:
    """Handles frame processing with queue management to handle timing mismatches"""
    
    def __init__(self):
        self.processing = False
        self.latest_frame = None
        self.latest_frame_id = None
        self.frames_received = 0
        self.frames_processed = 0
        self.frames_skipped = 0
        self.last_process_time = 0
        
    def _process_frame_sync(
        self,
        frame: np.ndarray,
        frame_id: str,
        t_min: float,
        k_min: int,
        k_max: int
    ) -> Dict:
        """Synchronous frame processing (runs in thread pool)"""
        start_time = time.time()
        
        try:
            h, w = frame.shape[:2]
            
            # Step 1: Detection
            detect_start = time.time()
            detections = detector_service.detect(frame)
            detection_time = (time.time() - detect_start) * 1000
            
            # Step 2: Translation
            translate_start = time.time()
            phosphene_base64, selected_objects, metadata = translator_service.translate(
                objects=detections,
                image_width=w,
                image_height=h,
                t_min=t_min,
                k_min=k_min,
                k_max=k_max
            )
            translation_time = (time.time() - translate_start) * 1000
            
            total_time = (time.time() - start_time) * 1000
            
            return {
                "frame_id": frame_id,
                "phosphene_image": phosphene_base64,
                "detections": [
                    {
                        "class": det.get("class", "unknown"),
                        "confidence": det.get("confidence", 0.0),
                        "bbox": det.get("bbox", [0, 0, 0, 0]),
                        "centroid_px": det.get("centroid_px", [0, 0]),
                        "distance_m": det.get("distance_m")
                    }
                    for det in detections
                ],
                "selected_count": len(selected_objects),
                "total_detections": len(detections),
                "timing": {
                    "detection_ms": round(detection_time, 2),
                    "translation_ms": round(translation_time, 2),
                    "total_ms": round(total_time, 2)
                },
                "stats": {
                    "frames_received": self.frames_received,
                    "frames_processed": self.frames_processed,
                    "frames_skipped": self.frames_skipped,
                    "fps": round(1000 / total_time, 2) if total_time > 0 else 0
                }
            }
            
        except Exception as e:
            logger.error(f"Frame processing error: {e}", exc_info=True)
            return {
                "frame_id": frame_id,
                "error": str(e),
                "timing": {
                    "total_ms": (time.time() - start_time) * 1000
                }
            }
    
    async def process_frame(
        self,
        frame: np.ndarray,
        frame_id: str,
        t_min: float = 0.3,
        k_min: int = 1,
        k_max: int = 5
    ) -> Dict:
        """Process frame asynchronously using thread pool"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            executor,
            self._process_frame_sync,
            frame, frame_id, t_min, k_min, k_max
        )


async def keepalive_task(websocket: WebSocket):
    """Background task to send keepalive pings to the client"""
    ping_count = 0
    try:
        while True:
            await asyncio.sleep(KEEPALIVE_INTERVAL)
            ping_count += 1
            
            # Check connection state before sending
            if websocket.client_state.name != 'CONNECTED':
                break
            
            try:
                await websocket.send_json({
                    "type": "ping",
                    "timestamp": time.time(),
                    "ping_count": ping_count
                })
            except Exception as e:
                logger.error(f"Keepalive ping failed: {e}")
                break
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.error(f"Keepalive task error: {e}")


async def handle_websocket(websocket: WebSocket):
    """
    WebSocket handler for real-time frame processing
    
    Protocol:
    - Client sends: {"frame": "base64_image", "frame_id": "...", "params": {...}}
    - Server responds: {"frame_id": "...", "phosphene_image": "base64", "detections": [...], "timing": {...}}
    
    Strategy for handling timing mismatch (10fps input, ~1-2fps processing):
    - Process frames as they come
    - If already processing, queue latest frame and skip intermediate frames
    - Always respond with frame_id so client knows which frame was processed
    """
    await websocket.accept()
    
    # Start keepalive task AFTER accepting connection
    keepalive = asyncio.create_task(keepalive_task(websocket))
    processor = FrameProcessor()
    
    logger.info(f"WebSocket connected: {websocket.client}")
    
    try:
        # Send initial connection success message
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket connected successfully",
            "server_ready": True
        })
        
        while True:
            # Receive frame from client
            try:
                data = await websocket.receive_json()
            except Exception as e:
                logger.error(f"Error receiving data: {e}")
                try:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Error receiving data: {str(e)}",
                        "message": "Connection issue, attempting to recover..."
                    })
                except:
                    break
                continue
            
            processor.frames_received += 1
            
            # Extract message type and handle control messages
            msg_type = data.get("type")
            
            # Handle client heartbeat and pong messages
            if msg_type == "heartbeat" or msg_type == "pong":
                continue
            
            # Extract parameters
            frame_base64 = data.get("frame")
            frame_id = data.get("frame_id", f"frame_{processor.frames_received}")
            params = data.get("params", {})
            
            t_min = params.get("t_min", 0.3)
            k_min = params.get("k_min", 1)
            k_max = params.get("k_max", 5)
            
            # Decode frame
            try:
                if not frame_base64:
                    await websocket.send_json({
                        "frame_id": frame_id,
                        "type": "warning",
                        "message": "Empty frame received"
                    })
                    continue
                
                frame = decode_base64_image(frame_base64)
            except Exception as e:
                logger.error(f"Failed to decode frame {frame_id}: {e}")
                try:
                    await websocket.send_json({
                        "frame_id": frame_id,
                        "type": "error",
                        "error": f"Failed to decode frame: {str(e)}"
                    })
                except Exception as send_err:
                    print(f"[WebSocket] ❌ Cannot send error response: {send_err}")
                continue
            
            # Strategy: Only process if not currently processing
            # This naturally handles the timing mismatch by skipping frames
            if not processor.processing:
                processor.processing = True
                processor.frames_processed += 1
                
                # Process frame
                try:
                    result = await processor.process_frame(
                        frame, frame_id, t_min, k_min, k_max
                    )
                except Exception as process_err:
                    logger.error(f"Frame processing error: {process_err}")
                    result = {
                        "frame_id": frame_id,
                        "type": "error",
                        "error": f"Processing error: {str(process_err)}"
                    }
                
                # Send result
                result["type"] = "frame_result"
                
                if websocket.client_state.name == 'CONNECTED':
                    try:
                        await websocket.send_json(result)
                    except Exception as e:
                        logger.error(f"Send error: {e}")
                        break
                
                processor.processing = False
                processor.last_process_time = time.time()
            else:
                # Already processing, skip this frame
                processor.frames_skipped += 1
                
                try:
                    await websocket.send_json({
                        "type": "frame_skipped",
                        "frame_id": frame_id,
                        "message": "Processing previous frame, skipped",
                        "stats": {
                            "frames_received": processor.frames_received,
                            "frames_processed": processor.frames_processed,
                            "frames_skipped": processor.frames_skipped
                        }
                    })
                except Exception as e:
                    logger.error(f"Skip notification error: {e}")
                    continue
        
        keepalive.cancel()
        
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {websocket.client} "
                   f"(Received: {processor.frames_received}, "
                   f"Processed: {processor.frames_processed}, "
                   f"Skipped: {processor.frames_skipped})")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        try:
            await websocket.send_json({
                "type": "error",
                "error": str(e),
                "message": "Fatal error occurred"
            })
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass
        logger.info(f"WebSocket closed: {websocket.client}")


# ============================================================================
# Navigation WebSocket Handler
# ============================================================================

async def handle_navigation_websocket(websocket: WebSocket):
    """
    WebSocket handler for navigation pipeline
    
    Protocol:
    - Client sends: {"type": "frame", "data": {"frame_id": int, "rgb": "base64_png", "depth": "base64_png"}}
    - Server responds: {"type": "result", "data": {"frame_id": int, "success": bool, "detections": [...], ...}}
    
    Processes RGB+Depth frames through the navigation pipeline with object detection,
    freepath detection, and occupancy mapping.
    """
    
    def convert_to_json_serializable(obj):
        """Convert numpy types to Python native types for JSON serialization"""
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, dict):
            return {key: convert_to_json_serializable(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [convert_to_json_serializable(item) for item in obj]
        else:
            return obj
    
    await websocket.accept()
    
    logger.info(f"Navigation WebSocket connected: {websocket.client}")
    
    # Check if navigation detector is ready
    if navigation_detector_service is None:
        logger.error("Navigation detector service is None")
        await websocket.send_json({
            "type": "error",
            "error": "Navigation detector service not initialized",
            "message": "Server is not in navigation mode"
        })
        await websocket.close()
        return
    
    if not navigation_detector_service.is_ready():
        logger.error(f"Navigation detector service not ready. is_loaded={navigation_detector_service.is_loaded}")
        await websocket.send_json({
            "type": "error",
            "error": "Navigation detector models not loaded",
            "message": "Please check server logs for model loading errors"
        })
        await websocket.close()
        return
    
    frames_processed = 0
    
    try:
        # Send initial connection success message
        await websocket.send_json({
            "type": "connected",
            "message": "Navigation WebSocket connected successfully",
            "server_ready": True
        })
        
        while True:
            # Receive message from client
            try:
                message = await websocket.receive_json()
            except Exception as e:
                logger.error(f"Error receiving data: {e}")
                break
            
            msg_type = message.get("type")
            
            # Handle heartbeat
            if msg_type == "heartbeat" or msg_type == "pong":
                continue
            
            # Handle frame processing
            if msg_type == "frame":
                data = message.get("data", {})
                frame_id = data.get("frame_id", frames_processed)
                rgb_base64 = data.get("rgb")
                depth_base64 = data.get("depth")
                
                if not rgb_base64 or not depth_base64:
                    await websocket.send_json({
                        "type": "error",
                        "frame_id": frame_id,
                        "error": "Missing RGB or Depth data"
                    })
                    continue
                
                try:
                    # Decode base64 images to numpy arrays
                    rgb_bytes = base64.b64decode(rgb_base64)
                    depth_bytes = base64.b64decode(depth_base64)
                    
                    rgb_arr = np.frombuffer(rgb_bytes, dtype=np.uint8)
                    depth_arr = np.frombuffer(depth_bytes, dtype=np.uint8)
                    
                    rgb = cv2.imdecode(rgb_arr, cv2.IMREAD_COLOR)
                    depth = cv2.imdecode(depth_arr, cv2.IMREAD_GRAYSCALE)
                    
                    if rgb is None or depth is None:
                        raise ValueError("Failed to decode images")
                    
                    # Convert BGR to RGB (OpenCV loads as BGR)
                    rgb = cv2.cvtColor(rgb, cv2.COLOR_BGR2RGB)
                    
                    logger.debug(f"Decoded frame {frame_id}: RGB {rgb.shape}, Depth {depth.shape}")
                    
                    # Process frame through navigation pipeline
                    result = navigation_detector_service.process_frame(
                        rgb=rgb,
                        depth=depth,
                        frame_id=frame_id,
                        debug_mode=False
                    )
                    
                    # Encode output images to base64
                    freepath_base64 = None
                    if result.get("freepath_mask") is not None:
                        freepath_visual = (result["freepath_mask"] > 0).astype(np.uint8) * 255
                        _, freepath_encoded = cv2.imencode('.png', freepath_visual)
                        freepath_base64 = base64.b64encode(freepath_encoded.tobytes()).decode('utf-8')
                    
                    occupancy_base64 = None
                    if result.get("occupancy_map") is not None:
                        occupancy = result["occupancy_map"]
                        # Convert to visual format
                        occupancy_visual = np.zeros_like(occupancy, dtype=np.uint8)
                        occupancy_visual[occupancy == -1] = 128  # Unknown
                        occupancy_visual[occupancy == 0] = 255   # Free
                        occupancy_visual[occupancy == 1] = 0     # Occupied
                        _, occupancy_encoded = cv2.imencode('.png', occupancy_visual)
                        occupancy_base64 = base64.b64encode(occupancy_encoded.tobytes()).decode('utf-8')
                    
                    # Build response with JSON-safe types
                    response = {
                        "type": "result",
                        "data": convert_to_json_serializable({
                            "frame_id": frame_id,
                            "success": result.get("success", False),
                            "detections": result.get("detections", []),
                            "freepath_mask": freepath_base64,
                            "freepath_coordinates": result.get("freepath_coordinates", []),
                            "freepath_circle": result.get("freepath_circle"),
                            "occupancy_map": occupancy_base64,
                            "processing_time_ms": result.get("processing_time_ms", 0),
                            "stats": result.get("stats", {})
                        })
                    }
                    
                    # Send response
                    await websocket.send_json(response)
                    frames_processed += 1
                    
                    logger.info(f"Processed frame {frame_id} in {result.get('processing_time_ms', 0):.2f}ms")
                    
                except Exception as e:
                    logger.error(f"Error processing frame {frame_id}: {e}", exc_info=True)
                    await websocket.send_json({
                        "type": "error",
                        "frame_id": frame_id,
                        "error": str(e)
                    })
            
    except WebSocketDisconnect:
        logger.info(f"Navigation WebSocket disconnected: {websocket.client} "
                   f"(Processed: {frames_processed} frames)")
    except Exception as e:
        logger.error(f"Navigation WebSocket error: {e}", exc_info=True)
        try:
            await websocket.send_json({
                "type": "error",
                "error": str(e),
                "message": "Fatal error occurred"
            })
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass
        logger.info(f"Navigation WebSocket closed: {websocket.client}")
