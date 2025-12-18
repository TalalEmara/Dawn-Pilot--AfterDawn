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

# Keepalive settings
KEEPALIVE_INTERVAL = 5.0  # Send ping every 5 seconds (must be longer than max processing time)


def set_websocket_services(detector, translator):
    """Set service instances (called from main.py)"""
    global detector_service, translator_service
    detector_service = detector
    translator_service = translator


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
            print(f"[Processor] Processing {frame_id}: {w}x{h}, params=(t_min={t_min}, k_min={k_min}, k_max={k_max})")
            
            # Step 1: Detection
            detect_start = time.time()
            print(f"[Processor] Starting detection for {frame_id}...")
            detections = detector_service.detect(frame)
            detection_time = (time.time() - detect_start) * 1000
            print(f"[Processor] ✅ Detection complete: {len(detections)} objects in {detection_time:.2f}ms")
            
            # Step 2: Translation
            translate_start = time.time()
            print(f"[Processor] Starting translation for {frame_id}...")
            phosphene_base64, selected_objects, metadata = translator_service.translate(
                objects=detections,
                image_width=w,
                image_height=h,
                t_min=t_min,
                k_min=k_min,
                k_max=k_max
            )
            translation_time = (time.time() - translate_start) * 1000
            print(f"[Processor] ✅ Translation complete: {len(selected_objects)} selected in {translation_time:.2f}ms")
            
            total_time = (time.time() - start_time) * 1000
            print(f"[Processor] ✅ Total processing: {total_time:.2f}ms")
            
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
            print(f"[Processor] ❌ Error processing {frame_id}: {type(e).__name__}: {e}")
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
                print(f"[KeepAlive] ⚠️ Connection not CONNECTED (state: {websocket.client_state.name}), stopping keepalive")
                break
            
            try:
                await websocket.send_json({
                    "type": "ping",
                    "timestamp": time.time(),
                    "ping_count": ping_count
                })
                print(f"[KeepAlive] 📍 Sent ping #{ping_count}, connection state: {websocket.client_state.name}")
            except Exception as e:
                print(f"[KeepAlive] ❌ Failed to send ping #{ping_count}: {type(e).__name__}: {e}")
                print(f"[KeepAlive] Connection state when ping failed: {websocket.client_state.name}")
                break
    except asyncio.CancelledError:
        print(f"[KeepAlive] 🛑 Keepalive task cancelled (sent {ping_count} pings total)")
        raise
    except Exception as e:
        print(f"[KeepAlive] ❌ Keepalive task error: {type(e).__name__}: {e}")
    finally:
        print(f"[KeepAlive] 👋 Keepalive task ending (sent {ping_count} pings total)")


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
    print(f"\n[WS-HANDLER] 🔌 New WebSocket connection attempt from {websocket.client}")
    await websocket.accept()
    print(f"[WS-HANDLER] ✅ WebSocket accepted, state: {websocket.client_state.name}")
    
    # Start keepalive task AFTER accepting connection
    keepalive = asyncio.create_task(keepalive_task(websocket))
    print(f"[WebSocket] ✅ Started keepalive task (interval: {KEEPALIVE_INTERVAL}s)")
    
    processor = FrameProcessor()
    
    print(f"\n{'='*70}")
    print(f"[WebSocket] New connection established: {websocket.client}")
    print(f"{'='*70}")
    logger.info(f"WebSocket connection established: {websocket.client}")
    
    try:
        # Send initial connection success message
        try:
            await websocket.send_json({
                "type": "connected",
                "message": "WebSocket connected successfully",
                "server_ready": True
            })
            print("[WebSocket] ✅ Sent connection success message to client")
            logger.info("Sent connection success message")
        except Exception as e:
            print(f"[WebSocket] ❌ Error sending connection message: {e}")
            logger.error(f"Error sending connection message: {e}", exc_info=True)
            raise
        
        print("[WebSocket] 🔄 Waiting for frames from client...")
        
        while True:
            # Receive frame from client
            try:
                print(f"\n[WS-LOOP] 🔄 Waiting to receive data... (state: {websocket.client_state.name}, processed: {processor.frames_processed}, skipped: {processor.frames_skipped})")
                data = await websocket.receive_json()
                print(f"[WS-LOOP] ✅ Received JSON data, keys: {list(data.keys())}")
                print(f"[WS-LOOP] Data type: {data.get('type', 'NO_TYPE')}, has 'frame': {('frame' in data)}")
                logger.info(f"Received frame data from client")
            except Exception as e:
                print(f"[WS-LOOP] ❌ Error receiving data: {type(e).__name__}: {e}")
                print(f"[WS-LOOP] WebSocket state: {websocket.client_state.name}")
                logger.error(f"Error receiving data: {e}", exc_info=True)
                # Don't break - try to send error and continue
                try:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Error receiving data: {str(e)}",
                        "message": "Connection issue, attempting to recover..."
                    })
                    print(f"[WS-LOOP] ⚠️ Sent error message, continuing loop...")
                except Exception as send_err:
                    print(f"[WS-LOOP] ❌ Cannot send error (connection likely closed): {type(send_err).__name__}")
                    print(f"[WS-LOOP] Breaking loop due to send failure")
                    break
                continue
            
            processor.frames_received += 1
            print(f"[WebSocket] Frame #{processor.frames_received} received")
            
            # Extract message type and handle control messages
            msg_type = data.get("type")
            print(f"[WS-LOOP] Message type: '{msg_type}'")
            
            # Handle client heartbeat and pong messages
            if msg_type == "heartbeat":
                print("[WS-LOOP] 💓 Received heartbeat from client (skipping processing)")
                continue
            
            if msg_type == "pong":
                print("[WS-LOOP] 🏓 Received pong from client (skipping processing)")
                continue
            
            # Extract parameters
            frame_base64 = data.get("frame")
            frame_id = data.get("frame_id", f"frame_{processor.frames_received}")
            params = data.get("params", {})
            
            print(f"[WS-LOOP] Extracted - frame_id: {frame_id}, has frame data: {frame_base64 is not None}, frame size: {len(frame_base64) if frame_base64 else 0} bytes")
            
            t_min = params.get("t_min", 0.3)
            k_min = params.get("k_min", 1)
            k_max = params.get("k_max", 5)
            
            print(f"[WebSocket] Frame {frame_id}: params=(t_min={t_min}, k_min={k_min}, k_max={k_max})")
            
            # Decode frame
            try:
                if not frame_base64:
                    print(f"[WebSocket] ⚠️  Empty frame received: {frame_id}")
                    logger.warning(f"Empty frame received: {frame_id}")
                    try:
                        await websocket.send_json({
                            "frame_id": frame_id,
                            "type": "warning",
                            "message": "Empty frame received"
                        })
                    except:
                        pass
                    continue
                
                print(f"[WebSocket] Decoding frame {frame_id}... (size: {len(frame_base64)} bytes)")
                frame = decode_base64_image(frame_base64)
                print(f"[WebSocket] ✅ Frame decoded successfully: shape={frame.shape}, dtype={frame.dtype}")
                logger.debug(f"Decoded frame {frame_id}: shape={frame.shape}")
            except Exception as e:
                print(f"[WebSocket] ❌ Failed to decode frame {frame_id}: {type(e).__name__}: {e}")
                logger.error(f"Failed to decode frame {frame_id}: {e}", exc_info=True)
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
                
                print(f"[WebSocket] 🔄 Processing frame {frame_id} (#{processor.frames_processed})")
                logger.info(f"Processing frame {frame_id}")
                
                # Process frame
                try:
                    result = await processor.process_frame(
                        frame, frame_id, t_min, k_min, k_max
                    )
                    print(f"[WebSocket] ✅ Frame processing complete: {result.get('timing', {}).get('total_ms', 'N/A')}ms")
                except Exception as process_err:
                    print(f"[WebSocket] ❌ Error during frame processing: {type(process_err).__name__}: {process_err}")
                    logger.error(f"Error during frame processing: {process_err}", exc_info=True)
                    result = {
                        "frame_id": frame_id,
                        "type": "error",
                        "error": f"Processing error: {str(process_err)}"
                    }
                
                # Send result
                result["type"] = "frame_result"
                
                # Check if connection is still alive before sending
                print(f"[WS-SEND] 📤 About to send result for {frame_id}, current state: {websocket.client_state.name}")
                if websocket.client_state.name == 'CONNECTED':
                    try:
                        await websocket.send_json(result)
                        print(f"[WS-SEND] ✅ Successfully sent result for frame {frame_id}")
                        print(f"[WS-SEND] Connection state after send: {websocket.client_state.name}")
                        logger.info(f"Sent result for frame {frame_id}")
                    except Exception as e:
                        print(f"[WS-SEND] ❌ Exception during send: {type(e).__name__}: {e}")
                        print(f"[WS-SEND] Connection state: {websocket.client_state.name}")
                        print(f"[WS-SEND] BREAKING LOOP due to send exception")
                        logger.error(f"Connection closed: {e}")
                        break
                else:
                    print(f"[WS-SEND] ⚠️ Connection not in CONNECTED state: {websocket.client_state.name}")
                    print(f"[WS-SEND] NOT BREAKING - will try to continue and wait for next message")
                    # Don't break immediately - the client might still be able to reconnect
                    # Just skip this result and continue the loop
                
                processor.processing = False
                processor.last_process_time = time.time()
            else:
                # Already processing, skip this frame
                processor.frames_skipped += 1
                
                print(f"[WebSocket] ⏭️  Skipping frame {frame_id} (#{processor.frames_skipped} skipped) - still processing")
                logger.debug(f"Skipping frame {frame_id}, still processing")
                
                # Send skip notification
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
                    print(f"[WebSocket] ❌ Error sending skip notification: {type(e).__name__}: {e}")
                    logger.error(f"Error sending skip notification: {e}")
                    # Try to continue
                    continue
        # Cancel keepalive task
        try:
            keepalive.cancel()
            print(f"[WebSocket] Cancelled keepalive task")
        except:
            pass
        
                
    except WebSocketDisconnect:
        print(f"\n[WebSocket] Client disconnected: {websocket.client}")
        print(f"[WebSocket] Session stats - Received: {processor.frames_received}, Processed: {processor.frames_processed}, Skipped: {processor.frames_skipped}")
        print(f"{'='*70}\n")
        logger.info(f"WebSocket disconnected: {websocket.client}")
        logger.info(f"Session stats - Received: {processor.frames_received}, "
                   f"Processed: {processor.frames_processed}, "
                   f"Skipped: {processor.frames_skipped}")
    except Exception as e:
        print(f"\n[WebSocket] ❌ Fatal error: {type(e).__name__}: {e}")
        print(f"{'='*70}\n")
        logger.error(f"WebSocket fatal error: {e}", exc_info=True)
        try:
            await websocket.send_json({
                "type": "error",
                "error": str(e),
                "message": "Fatal error occurred"
            })
        except:
            pass
    finally:
        print(f"[WS-HANDLER] 🔚 Entering finally block, state: {websocket.client_state.name}")
        try:
            await websocket.close()
            print(f"[WS-HANDLER] ✅ Connection closed gracefully")
        except Exception as close_err:
            print(f"[WS-HANDLER] ⚠️ Connection already closed or error closing: {type(close_err).__name__}")
        logger.info(f"WebSocket connection closed: {websocket.client}")
        print(f"[WS-HANDLER] 👋 Handler cleanup complete\n")
