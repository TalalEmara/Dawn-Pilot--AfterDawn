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
"""

import logging
import base64
import cv2
import numpy as np
import os
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect
from core import decode_base64_to_rgb, encode_ndarray_to_base64

logger = logging.getLogger(__name__)

# Global service (injected from websocket_routes)
navigation_detector_service = None

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
    WebSocket handler for full navigation pipeline with phosphene rendering
    
    Protocol:
    - Client sends: {"type": "frame", "frame_id": str, "rgb": base64, "depth": base64, "stage": str, "debug": bool}
    - Server responds: {"type": "result", "data": {...}}
    
    Optimizations:
    - RGB color space throughout (no BGR conversions except final encode)
    - Minimal base64 encode/decode operations
    - Debug images only saved when debug=True flag is set
    """
    await websocket.accept()
    logger.info(f"Navigation-Phosphene WebSocket connected: {websocket.client}")
    
    if navigation_detector_service is None:
        await websocket.send_json({"type": "error", "error": "Navigation detector service not available"})
        await websocket.close()
        return
    
    # Send welcome message to confirm connection is ready
    await websocket.send_json({
        "type": "connected",
        "message": "Navigation-Phosphene WebSocket ready",
        "service_ready": navigation_detector_service.is_loaded
    })
    
    frames_processed = 0
    
    try:
        while True:
            message = await websocket.receive_json()
            
            if message.get("type") == "frame":
                frame_id = message.get("frame_id", "unknown")
                stage = message.get("stage", "phosphene")
                debug_mode = message.get("debug", False)  # Get debug flag from client
                cropping_config = message.get("cropping_config")  # Optional cropping override
                
                valid_stages = ["detector", "translator", "pre_phosphene", "phosphene"]
                if stage not in valid_stages:
                    await websocket.send_json({
                        "type": "error",
                        "frame_id": frame_id,
                        "error": f"Invalid stage '{stage}'. Valid: {valid_stages}"
                    })
                    continue
                
                try:
                    rgb_b64 = message.get("rgb")
                    depth_b64 = message.get("depth")
                    
                    if not rgb_b64 or not depth_b64:
                        await websocket.send_json({
                            "type": "error",
                            "frame_id": frame_id,
                            "error": "Missing rgb or depth image"
                        })
                        continue
                    
                    # Decode images ONCE to RGB (optimized)
                    rgb = decode_base64_to_rgb(rgb_b64)  # Returns RGB directly
                    
                    # Depth: decode and convert to grayscale if needed
                    depth_bytes = base64.b64decode(depth_b64.split(',')[1] if ',' in depth_b64 else depth_b64)
                    depth_arr = np.frombuffer(depth_bytes, dtype=np.uint8)
                    depth = cv2.imdecode(depth_arr, cv2.IMREAD_GRAYSCALE)
                    
                    if rgb is None or depth is None:
                        raise ValueError("Failed to decode images")
                    
                    logger.info(f"📊 Frame {frame_id}: RGB {rgb.shape}, Depth {depth.shape}, Debug: {debug_mode}")
                    
                    # Process frame with debug flag
                    result = navigation_detector_service.process_full_pipeline(
                        rgb=rgb,
                        depth=depth,
                        frame_id=int(frame_id) if frame_id.isdigit() else frames_processed,
                        stop_at=stage,
                        debug_mode=debug_mode,  # Pass debug flag to service
                        cropping_config=cropping_config  # Pass cropping config override
                    )
                    
                    response = {
                        "type": "result",
                        "data": convert_to_json_serializable({
                            "frame_id": frame_id,
                            "stage": stage,
                            "success": result.get("success", False),
                            "output_image": result.get("output_image"),
                            "detections": result.get("detections", []),
                            "freepath_coordinates": result.get("freepath_coordinates", []),
                            "freepath_circle": result.get("freepath_circle"),
                            "stats": result.get("stats", {}),
                            "error": result.get("error")
                        })
                    }
                    
                    await websocket.send_json(response)
                    frames_processed += 1
                    
                    total_time = sum(result.get("stats", {}).values())
                    logger.info(f"✅ Processed frame {frame_id} at stage '{stage}' in {total_time:.2f}ms")
                    
                except Exception as e:
                    logger.error(f"Error processing frame {frame_id}: {e}", exc_info=True)
                    await websocket.send_json({
                        "type": "error",
                        "frame_id": frame_id,
                        "error": str(e)
                    })
            
    except WebSocketDisconnect:
        logger.info(f"Navigation-Phosphene WebSocket disconnected (Processed: {frames_processed} frames)")
    except Exception as e:
        logger.error(f"Navigation-Phosphene WebSocket error: {e}", exc_info=True)
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
        logger.info(f"Navigation-Phosphene WebSocket closed")
