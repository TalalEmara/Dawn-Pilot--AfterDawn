import logging
import base64
import cv2
import numpy as np
import os
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect
from core import decode_base64_image

logger = logging.getLogger(__name__)

# Create debug output directory (absolute path)
DEBUG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "debug_websocket")
os.makedirs(DEBUG_DIR, exist_ok=True)
print(f"🔍 Debug output directory: {os.path.abspath(DEBUG_DIR)}")

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
    """WebSocket handler for full navigation pipeline with phosphene rendering"""
    await websocket.accept()
    logger.info(f"Navigation-Phosphene WebSocket connected: {websocket.client}")
    
    if navigation_detector_service is None:
        await websocket.send_json({"type": "error", "error": "Navigation detector service not available"})
        await websocket.close()
        return
    
    frames_processed = 0
    
    try:
        while True:
            message = await websocket.receive_json()
            
            if message.get("type") == "frame":
                frame_id = message.get("frame_id", "unknown")
                stage = message.get("stage", "phosphene")
                
                valid_stages = ["detector", "translator", "pre_phosphene", "phosphene"]
                if stage not in valid_stages:
                    await websocket.send_json({"type": "error", "frame_id": frame_id, "error": f"Invalid stage '{stage}'"})
                    continue
                
                try:
                    rgb_b64 = message.get("rgb")
                    depth_b64 = message.get("depth")
                    
                    if not rgb_b64 or not depth_b64:
                        await websocket.send_json({"type": "error", "frame_id": frame_id, "error": "Missing rgb or depth image"})
                        continue
                    
                    # Decode RGB image (returns BGR format)
                    rgb_bgr = decode_base64_image(rgb_b64)
                    rgb = cv2.cvtColor(rgb_bgr, cv2.COLOR_BGR2RGB)
                    
                    # Decode depth image (returns BGR format, convert to grayscale)
                    depth_bgr = decode_base64_image(depth_b64)
                    depth = cv2.cvtColor(depth_bgr, cv2.COLOR_BGR2GRAY)
                    
                    # 🔍 DEBUG: Save received images
                    timestamp = datetime.now().strftime("%H%M%S")
                    debug_prefix = f"{DEBUG_DIR}/frame_{frame_id}_{timestamp}"
                    cv2.imwrite(f"{debug_prefix}_received_rgb.jpg", rgb_bgr)
                    cv2.imwrite(f"{debug_prefix}_received_depth.jpg", depth_bgr)
                    logger.info(f"💾 Saved received images: {debug_prefix}_received_*.jpg")
                    logger.info(f"📊 RGB shape: {rgb.shape}, Depth shape: {depth.shape}")
                    
                    result = navigation_detector_service.process_full_pipeline(
                        rgb=rgb, depth=depth, frame_id=int(frame_id) if frame_id.isdigit() else frames_processed,
                        stop_at=stage, debug_mode=True  # Enable debug mode
                    )
                    
                    response = {
                        "type": "result",
                        "data": convert_to_json_serializable({
                            "frame_id": frame_id, "stage": stage, "success": result.get("success", False),
                            "output_image": result.get("output_image"), "detections": result.get("detections", []),
                            "freepath_circle": result.get("freepath_circle"), "stats": result.get("stats", {}),
                            "error": result.get("error")
                        })
                    }
                    
                    # 🔍 DEBUG: Save output phosphene image
                    if result.get("output_image"):
                        try:
                            output_b64 = result.get("output_image")
                            output_bytes = base64.b64decode(output_b64)
                            output_array = np.frombuffer(output_bytes, dtype=np.uint8)
                            output_img = cv2.imdecode(output_array, cv2.IMREAD_COLOR)
                            cv2.imwrite(f"{debug_prefix}_output_phosphene.png", output_img)
                            logger.info(f"💾 Saved output phosphene: {debug_prefix}_output_phosphene.png")
                        except Exception as e:
                            logger.error(f"Failed to save output image: {e}")
                    else:
                        logger.warning(f"⚠️ No output_image in result!")
                    
                    await websocket.send_json(response)
                    frames_processed += 1
                    
                    total_time = sum(result.get("stats", {}).values())
                    logger.info(f"✅ Processed frame {frame_id} at stage '{stage}' in {total_time:.2f}ms")
                    
                except Exception as e:
                    logger.error(f"Error processing frame {frame_id}: {e}", exc_info=True)
                    await websocket.send_json({"type": "error", "frame_id": frame_id, "error": str(e)})
            
    except WebSocketDisconnect:
        logger.info(f"Navigation-Phosphene WebSocket disconnected (Processed: {frames_processed} frames)")
    except Exception as e:
        logger.error(f"Navigation-Phosphene WebSocket error: {e}", exc_info=True)
        try:
            await websocket.send_json({"type": "error", "error": str(e), "message": "Fatal error occurred"})
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass
        logger.info(f"Navigation-Phosphene WebSocket closed")
