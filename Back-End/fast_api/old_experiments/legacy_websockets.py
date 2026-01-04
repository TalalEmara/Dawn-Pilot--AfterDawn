"""
Legacy WebSocket Handlers

This module contains WebSocket handlers for experimental/testing endpoints.
These are NOT part of the main production navigation-phosphene pipeline.

Main production endpoint is in nav_phosphene_ws.py: /ws/navigation-phosphene
"""

import asyncio
import time
import logging
import base64
from typing import Dict
from concurrent.futures import ThreadPoolExecutor
import cv2
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from models import DetectionObject
from core import decode_base64_image

# Thread pool for running synchronous processing
executor = ThreadPoolExecutor(max_workers=2)

logger = logging.getLogger(__name__)

# Global services (injected from main)
detector_service = None
translator_service = None
navigation_detector_service = None

# Keepalive settings
KEEPALIVE_INTERVAL = 5.0


def set_legacy_websocket_services(detector, translator, navigation_detector=None):
    """Set service instances (called from main.py)"""
    global detector_service, translator_service, navigation_detector_service
    detector_service = detector
    translator_service = translator
    navigation_detector_service = navigation_detector


class FrameProcessor:
    """Handles frame processing with queue management"""
    
    def __init__(self):
        self.processing = False
        self.latest_frame = None
        self.latest_frame_id = None
        self.frames_received = 0
        self.frames_processed = 0
        self.frames_skipped = 0
        self.last_process_time = 0
        
    async def process_frame(self, frame: np.ndarray, frame_id: str, t_min: float, k_min: int, k_max: int) -> Dict:
        """Process frame in thread pool"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            executor, self._process_frame_sync, frame, frame_id, t_min, k_min, k_max
        )
        
    def _process_frame_sync(self, frame: np.ndarray, frame_id: str, t_min: float, k_min: int, k_max: int) -> Dict:
        """Synchronous frame processing"""
        start_time = time.time()
        
        try:
            h, w = frame.shape[:2]
            
            # Detection
            detect_start = time.time()
            detections = detector_service.detect(frame)
            detection_time = (time.time() - detect_start) * 1000
            
            # Translation
            translate_start = time.time()
            phosphene_base64, selected_objects, metadata = translator_service.translate(
                objects=detections, image_width=w, image_height=h, t_min=t_min, k_min=k_min, k_max=k_max
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
                "selected_objects": selected_objects,
                "metadata": metadata,
                "timing": {
                    "detection_ms": detection_time,
                    "translation_ms": translation_time,
                    "total_ms": total_time
                }
            }
        except Exception as e:
            logger.error(f"Frame processing error: {e}", exc_info=True)
            return {
                "frame_id": frame_id,
                "error": str(e),
                "timing": {"total_ms": (time.time() - start_time) * 1000}
            }


async def keepalive_task(websocket: WebSocket):
    """Send periodic ping messages"""
    ping_count = 0
    try:
        while True:
            await asyncio.sleep(KEEPALIVE_INTERVAL)
            ping_count += 1
            
            if websocket.client_state.name != 'CONNECTED':
                break
            
            try:
                await websocket.send_json({"type": "ping", "timestamp": time.time(), "ping_count": ping_count})
            except Exception as e:
                logger.error(f"Keepalive ping failed: {e}")
                break
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.error(f"Keepalive task error: {e}")


async def handle_websocket(websocket: WebSocket):
    """
    WebSocket handler for standard phosphene processing (detection + translation only)
    
    Protocol:
    - Client sends: {"frame": "base64_image", "frame_id": "...", "params": {...}}
    - Server responds: {"frame_id": "...", "phosphene_image": "base64", "detections": [...]}
    
    NOTE: This is a legacy/testing endpoint. Use /ws/navigation-phosphene for production.
    """
    await websocket.accept()
    keepalive = asyncio.create_task(keepalive_task(websocket))
    processor = FrameProcessor()
    
    logger.info(f"[LEGACY] WebSocket connected: {websocket.client}")
    
    try:
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket connected (Legacy endpoint - use /ws/navigation-phosphene for production)",
            "server_ready": True
        })
        
        while True:
            try:
                data = await websocket.receive_json()
            except Exception as e:
                logger.error(f"Error receiving data: {e}")
                break
            
            processor.frames_received += 1
            msg_type = data.get("type")
            
            if msg_type == "heartbeat" or msg_type == "pong":
                continue
            
            frame_base64 = data.get("frame")
            frame_id = data.get("frame_id", f"frame_{processor.frames_received}")
            params = data.get("params", {})
            
            t_min = params.get("t_min", 0.3)
            k_min = params.get("k_min", 1)
            k_max = params.get("k_max", 5)
            
            try:
                if not frame_base64:
                    await websocket.send_json({"frame_id": frame_id, "type": "warning", "message": "Empty frame"})
                    continue
                
                frame = decode_base64_image(frame_base64)
            except Exception as e:
                logger.error(f"Failed to decode frame {frame_id}: {e}")
                await websocket.send_json({"frame_id": frame_id, "type": "error", "error": str(e)})
                continue
            
            if not processor.processing:
                processor.processing = True
                processor.frames_processed += 1
                
                try:
                    result = await processor.process_frame(frame, frame_id, t_min, k_min, k_max)
                except Exception as process_err:
                    logger.error(f"Frame processing error: {process_err}")
                    result = {"frame_id": frame_id, "type": "error", "error": str(process_err)}
                
                result["type"] = "frame_result"
                
                if websocket.client_state.name == 'CONNECTED':
                    try:
                        await websocket.send_json(result)
                    except Exception as e:
                        logger.error(f"Send error: {e}")
                        break
                
                processor.processing = False
            else:
                processor.frames_skipped += 1
                await websocket.send_json({
                    "type": "frame_skipped",
                    "frame_id": frame_id,
                    "message": "Processing previous frame, skipped"
                })
        
        keepalive.cancel()
                
    except WebSocketDisconnect:
        logger.info(f"[LEGACY] WebSocket disconnected (Processed: {processor.frames_processed})")
    except Exception as e:
        logger.error(f"[LEGACY] WebSocket error: {e}", exc_info=True)
    finally:
        try:
            await websocket.close()
        except:
            pass


def convert_to_json_serializable(obj):
    """Convert numpy types to Python native types"""
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


async def handle_navigation_websocket(websocket: WebSocket):
    """
    WebSocket handler for navigation pipeline (detection + freepath, NO phosphene rendering)
    
    Protocol:
    - Client sends: {"type": "frame", "data": {"frame_id": int, "rgb": "base64", "depth": "base64"}}
    - Server responds: {"type": "result", "data": {"frame_id": int, "detections": [...], "freepath": [...]}}
    
    NOTE: This is a testing endpoint. Use /ws/navigation-phosphene for full pipeline with phosphene.
    """
    await websocket.accept()
    logger.info(f"[LEGACY] Navigation WebSocket connected: {websocket.client}")
    
    if navigation_detector_service is None or not navigation_detector_service.is_ready():
        await websocket.send_json({
            "type": "error",
            "error": "Navigation detector service not available"
        })
        await websocket.close()
        return
    
    frames_processed = 0
    
    try:
        await websocket.send_json({
            "type": "connected",
            "message": "Navigation WebSocket connected (Legacy - use /ws/navigation-phosphene for full pipeline)",
            "server_ready": True
        })
        
        while True:
            try:
                message = await websocket.receive_json()
            except Exception as e:
                logger.error(f"Error receiving data: {e}")
                break
            
            msg_type = message.get("type")
            
            if msg_type == "heartbeat" or msg_type == "pong":
                continue
            
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
                    # Decode images
                    rgb_bytes = base64.b64decode(rgb_base64)
                    depth_bytes = base64.b64decode(depth_base64)
                    
                    rgb_arr = np.frombuffer(rgb_bytes, dtype=np.uint8)
                    depth_arr = np.frombuffer(depth_bytes, dtype=np.uint8)
                    
                    rgb = cv2.imdecode(rgb_arr, cv2.IMREAD_COLOR)
                    depth = cv2.imdecode(depth_arr, cv2.IMREAD_GRAYSCALE)
                    
                    if rgb is None or depth is None:
                        raise ValueError("Failed to decode images")
                    
                    # Convert BGR to RGB
                    rgb = cv2.cvtColor(rgb, cv2.COLOR_BGR2RGB)
                    
                    # Process (no debug images for speed)
                    result = navigation_detector_service.process_frame(
                        rgb=rgb, depth=depth, frame_id=frame_id, debug_mode=False
                    )
                    
                    response = {
                        "type": "result",
                        "data": convert_to_json_serializable({
                            "frame_id": frame_id,
                            "success": result.get("success", False),
                            "detections": result.get("detections", []),
                            "freepath_coordinates": result.get("freepath_coordinates", []),
                            "freepath_circle": result.get("freepath_circle"),
                            "processing_time_ms": result.get("processing_time_ms", 0),
                            "stats": result.get("stats", {})
                        })
                    }
                    
                    await websocket.send_json(response)
                    frames_processed += 1
                    
                    logger.info(f"[LEGACY] Processed frame {frame_id} in {result.get('processing_time_ms', 0):.2f}ms")
                    
                except Exception as e:
                    logger.error(f"Error processing frame {frame_id}: {e}", exc_info=True)
                    await websocket.send_json({"type": "error", "frame_id": frame_id, "error": str(e)})
            
    except WebSocketDisconnect:
        logger.info(f"[LEGACY] Navigation WebSocket disconnected (Processed: {frames_processed})")
    except Exception as e:
        logger.error(f"[LEGACY] Navigation WebSocket error: {e}", exc_info=True)
    finally:
        try:
            await websocket.close()
        except:
            pass
