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

FRAME BUFFER: Implements latest-frame strategy to prevent backlog
- Producer thread: Receives frames from frontend
- Consumer thread: Processes latest frame only
- Automatic frame dropping when backend is slower than frontend
"""

import logging
import base64
import cv2
import numpy as np
import os
import asyncio
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect
from core import decode_base64_to_rgb, encode_ndarray_to_base64
from core.frame_buffer import LatestFrameBuffer, FrameData, FrameBufferConfig

logger = logging.getLogger(__name__)

# Global service (injected from websocket_routes)
navigation_detector_service = None

# Global frame buffer config (loaded from navigation_config.json)
frame_buffer_config = FrameBufferConfig(enabled=True)

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
    
    Modes:
    - Buffered (frame_buffer.enabled=true): Producer-consumer pattern with automatic frame dropping
    - Synchronous (frame_buffer.enabled=false): Traditional blocking processing
    
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
        "service_ready": navigation_detector_service.is_loaded,
        "frame_buffer_enabled": frame_buffer_config.enabled
    })
    
    # Choose processing mode based on configuration
    if frame_buffer_config.enabled:
        logger.info("🔄 Using BUFFERED mode (latest-frame strategy)")
        await _handle_buffered_processing(websocket)
    else:
        logger.info("🔄 Using SYNCHRONOUS mode (traditional blocking)")
        await _handle_synchronous_processing(websocket)


async def _handle_buffered_processing(websocket: WebSocket):
    """
    Buffered processing mode with producer-consumer pattern
    
    - Producer: Receives frames from WebSocket, puts in buffer
    - Consumer: Takes latest frame from buffer, processes, sends result
    - Automatic frame dropping when backend can't keep up
    """
    frame_buffer = LatestFrameBuffer(max_frame_age_ms=frame_buffer_config.max_frame_age_ms)
    frame_buffer._metrics_interval = frame_buffer_config.metrics_interval_seconds
    
    processing_active = asyncio.Event()
    processing_active.set()
    
    # CRITICAL: Flag to indicate consumer is busy processing
    consumer_is_busy = asyncio.Event()
    consumer_is_busy.clear()  # Not busy initially
    
    # Additional metrics for frame skipping
    websocket_drained_frames = [0]  # Use list to allow modification in nested function
    
    # Producer task: Receive frames from WebSocket
    async def producer():
        """Receive frames and ALWAYS drain to get latest only"""
        nonlocal websocket_drained_frames
        frames_received = 0
        try:
            while processing_active.is_set():
                # STRATEGY: Always drain all pending messages, keep only the LATEST
                # This ensures we never process stale frames
                received_messages = []
                
                # Get first message (blocking with timeout)
                try:
                    message = await asyncio.wait_for(websocket.receive_json(), timeout=0.1)
                    received_messages.append(message)
                except asyncio.TimeoutError:
                    continue
                
                # AGGRESSIVE DRAIN: Keep receiving until no more messages (max 50ms window)
                # This catches ALL rapid clicks
                drain_start = asyncio.get_event_loop().time()
                while asyncio.get_event_loop().time() - drain_start < 0.05:  # 50ms drain window
                    try:
                        next_message = await asyncio.wait_for(websocket.receive_json(), timeout=0.001)
                        received_messages.append(next_message)
                    except asyncio.TimeoutError:
                        # No more messages waiting
                        break
                    except Exception:
                        break
                
                # Count drained frames (all except the latest)
                if len(received_messages) > 1:
                    drained = len(received_messages) - 1
                    websocket_drained_frames[0] += drained
                    logger.info(f"🚰 Drained {drained} frames (total drained: {websocket_drained_frames[0]}), processing latest only")
                
                # Process ONLY the latest message
                message = received_messages[-1]
                
                if message.get("type") == "frame":
                    frame_id = message.get("frame_id", f"frame_{frames_received}")
                    stage = message.get("stage", "phosphene")
                    debug_mode = message.get("debug", False)
                    cropping_config = message.get("cropping_config")
                    
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
                        rgb = decode_base64_to_rgb(rgb_b64)
                        
                        # Depth: decode and convert to grayscale if needed
                        depth_bytes = base64.b64decode(depth_b64.split(',')[1] if ',' in depth_b64 else depth_b64)
                        depth_arr = np.frombuffer(depth_bytes, dtype=np.uint8)
                        depth = cv2.imdecode(depth_arr, cv2.IMREAD_GRAYSCALE)
                        
                        if rgb is None or depth is None:
                            raise ValueError("Failed to decode images")
                        
                        # Create frame data and put in buffer
                        frame_data = FrameData(
                            frame_id=frame_id,
                            rgb=rgb,
                            depth=depth,
                            stage=stage,
                            debug_mode=debug_mode,
                            cropping_config=cropping_config
                        )
                        
                        await frame_buffer.put(frame_data)
                        frames_received += 1
                        
                        logger.debug(f"📥 Received frame {frame_id} (total: {frames_received})")
                        
                    except Exception as e:
                        logger.error(f"Error receiving frame {frame_id}: {e}", exc_info=True)
                        await websocket.send_json({
                            "type": "error",
                            "frame_id": frame_id,
                            "error": str(e)
                        })
                        
        except WebSocketDisconnect:
            logger.info("Producer: WebSocket disconnected")
        except Exception as e:
            logger.error(f"Producer error: {e}", exc_info=True)
        finally:
            processing_active.clear()
    
    # Consumer task: Process frames from buffer
    async def consumer():
        """Process latest frames from buffer"""
        frames_processed = 0
        try:
            while processing_active.is_set():
                # Get latest frame (blocks until available)
                frame_data = await frame_buffer.get_latest()
                
                if frame_data is None:
                    # Frame was stale, skip it
                    continue
                
                try:
                    # CRITICAL: Set busy flag BEFORE processing
                    consumer_is_busy.set()
                    
                    logger.info(f"🔄 Processing frame {frame_data.frame_id} (age: {frame_data.age_ms():.1f}ms)")
                    
                    # Process frame
                    result = navigation_detector_service.process_full_pipeline(
                        rgb=frame_data.rgb,
                        depth=frame_data.depth,
                        frame_id=int(frame_data.frame_id) if frame_data.frame_id.isdigit() else frames_processed,
                        stop_at=frame_data.stage,
                        debug_mode=frame_data.debug_mode,
                        cropping_config=frame_data.cropping_config
                    )
                    
                    # Send response
                    response = {
                        "type": "result",
                        "data": convert_to_json_serializable({
                            "frame_id": frame_data.frame_id,
                            "stage": frame_data.stage,
                            "success": result.get("success", False),
                            "output_image": result.get("output_image"),
                            "detections": result.get("detections", []),
                            "freepath_coordinates": result.get("freepath_coordinates", []),
                            "freepath_circle": result.get("freepath_circle"),
                            "stats": result.get("stats", {}),
                            "error": result.get("error"),
                            "buffer_metrics": {
                                **frame_buffer.get_current_metrics(),
                                "websocket_drained": websocket_drained_frames[0]
                            }
                        })
                    }
                    
                    await websocket.send_json(response)
                    frames_processed += 1
                    
                    total_time = sum(result.get("stats", {}).values())
                    logger.info(f"✅ Processed frame {frame_data.frame_id} in {total_time:.2f}ms")
                    
                except Exception as e:
                    logger.error(f"Error processing frame {frame_data.frame_id}: {e}", exc_info=True)
                    try:
                        await websocket.send_json({
                            "type": "error",
                            "frame_id": frame_data.frame_id,
                            "error": str(e)
                        })
                    except:
                        pass
                finally:
                    # CRITICAL: Clear busy flag AFTER processing complete
                    consumer_is_busy.clear()
                        
        except Exception as e:
            logger.error(f"Consumer error: {e}", exc_info=True)
        finally:
            processing_active.clear()
    
    # Run producer and consumer concurrently
    try:
        producer_task = asyncio.create_task(producer())
        consumer_task = asyncio.create_task(consumer())
        
        # Wait for either task to complete (or both)
        await asyncio.gather(producer_task, consumer_task, return_exceptions=True)
        
    except Exception as e:
        logger.error(f"Buffered processing error: {e}", exc_info=True)
    finally:
        processing_active.clear()
        await frame_buffer.clear()
        try:
            await websocket.close()
        except:
            pass
        logger.info("Navigation-Phosphene WebSocket closed (buffered mode)")


async def _handle_synchronous_processing(websocket: WebSocket):
    """
    Synchronous processing mode (traditional blocking)
    
    - Receives frame
    - Processes frame (blocks)
    - Sends result
    - Repeat
    
    Use this mode for debugging or when frame ordering is critical.
    """
    frames_processed = 0
    
    try:
        while True:
            message = await websocket.receive_json()
            
            if message.get("type") == "frame":
                frame_id = message.get("frame_id", "unknown")
                stage = message.get("stage", "phosphene")
                debug_mode = message.get("debug", False)
                cropping_config = message.get("cropping_config")
                
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
                    rgb = decode_base64_to_rgb(rgb_b64)
                    
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
                        debug_mode=debug_mode,
                        cropping_config=cropping_config
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
        logger.info(f"Navigation-Phosphene WebSocket closed (synchronous mode)")
