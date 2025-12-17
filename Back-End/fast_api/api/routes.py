"""
API Routes

All FastAPI endpoint definitions for the Phosphene Vision API.
"""

import time
import logging
import base64
from datetime import datetime
from typing import Dict
import cv2
import numpy as np
from fastapi import APIRouter, File, UploadFile, BackgroundTasks, HTTPException

from models import (
    DetectionRequest, DetectionResponse, DetectionObject,
    TranslationRequest, TranslationResponse,
    ProcessRequest, ProcessResponse,
    ConfigUpdateRequest, ProcessWithDepthRequest,
    HealthResponse
)
from core import (
    decode_base64_image, decode_depth_map, save_debug_images,
    assign_depth_to_detections, cleanup_old_files
)

logger = logging.getLogger(__name__)

# Router instance
router = APIRouter()

# These will be injected by main.py
detector_service = None
translator_service = None


def set_services(detector, translator):
    """Set service instances (called from main.py)"""
    global detector_service, translator_service
    detector_service = detector
    translator_service = translator


def _process_frame_internal(
    frame: np.ndarray,
    conf_threshold: float = 0.5,
    t_min: float = 0.3,
    k_min: int = 1,
    k_max: int = 5,
    include_timing: bool = False
) -> Dict:
    """
    Core image processing logic - shared by all endpoints
    
    This is the single source of truth for detection + translation.
    Works on decoded numpy array (no format coupling).
    """
    timings = {} if include_timing else None
    total_start = time.time()
    
    h, w = frame.shape[:2]
    
    # Step 1: Detection
    if include_timing:
        detect_start = time.time()
    
    detections = detector_service.detect(frame)
    
    if include_timing:
        timings["detection_ms"] = round((time.time() - detect_start) * 1000, 2)
    
    # Step 2: Translation
    if include_timing:
        translate_start = time.time()
    
    phosphene_base64, selected_objects, metadata = translator_service.translate(
        objects=detections,
        image_width=w,
        image_height=h,
        t_min=t_min,
        k_min=k_min,
        k_max=k_max
    )
    
    if include_timing:
        # Merge detection timing with translator's detailed timing breakdown
        if "timing_breakdown" in metadata:
            # Translator already provides detailed breakdown, add detection time
            metadata["timing_breakdown"]["detection_ms"] = timings["detection_ms"]
            # Update total to include detection time
            metadata["timing_breakdown"]["total_ms"] = round((time.time() - total_start) * 1000, 2)
        else:
            # Fallback if translator doesn't provide breakdown
            timings["translation_ms"] = round((time.time() - translate_start) * 1000, 2)
            timings["total_ms"] = round((time.time() - total_start) * 1000, 2)
            metadata["timing_breakdown"] = timings
    
    # Format detections for response
    detection_objects = [
        DetectionObject(
            class_name=det.get("class", "unknown"),
            confidence=det.get("confidence", 0.0),
            bbox=det.get("bbox", [0, 0, 0, 0]),
            centroid_px=det.get("centroid_px", [0, 0]),
            distance_m=det.get("distance_m")
        )
        for det in detections
    ]
    
    return {
        "detections": detection_objects,
        "phosphene_image_base64": phosphene_base64,
        "selected_objects": selected_objects,
        "metadata": metadata
    }


@router.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint"""
    return {
        "service": "Phosphene Vision API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


@router.get("/api/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint
    
    Returns service status and readiness information
    """
    return HealthResponse(
        status="healthy" if (detector_service.is_ready() and translator_service.is_ready()) else "degraded",
        detector_type=detector_service.detector_type,
        detector_loaded=detector_service.is_ready(),
        translator_ready=translator_service.is_ready(),
        timestamp=datetime.now().isoformat()
    )


@router.post("/api/detect", response_model=DetectionResponse)
async def detect_objects(request: DetectionRequest, background_tasks: BackgroundTasks):
    """
    Detect objects in an image
    
    Args:
        request: DetectionRequest with base64 encoded image
        
    Returns:
        DetectionResponse with detected objects
    """
    start_time = time.time()
    
    # Decode image
    frame = decode_base64_image(request.image_base64)
    h, w = frame.shape[:2]
    
    # Run detection
    detections = detector_service.detect(frame)
    
    # Format response
    detection_objects = []
    for det in detections:
        detection_objects.append(DetectionObject(
            class_name=det.get("class", "unknown"),
            confidence=det.get("confidence", 0.0),
            bbox=det.get("bbox", [0, 0, 0, 0]),
            centroid_px=det.get("centroid_px", [0, 0]),
            distance_m=det.get("distance_m")
        ))
    
    processing_time = (time.time() - start_time) * 1000
    
    # Schedule cleanup
    background_tasks.add_task(cleanup_old_files, translator_service.output_dir)
    
    return DetectionResponse(
        objects=detection_objects,
        count=len(detection_objects),
        image_size={"width": w, "height": h},
        processing_time_ms=round(processing_time, 2)
    )


@router.post("/api/translate", response_model=TranslationResponse)
async def translate_to_phosphene(request: TranslationRequest, background_tasks: BackgroundTasks):
    """
    Translate detected objects to phosphene representation
    
    Args:
        request: TranslationRequest with objects and parameters
        
    Returns:
        TranslationResponse with phosphene image and selected objects
    """
    phosphene_base64, selected_objects, metadata = translator_service.translate(
        objects=request.objects,
        image_width=request.image_width,
        image_height=request.image_height,
        t_min=request.t_min,
        k_min=request.k_min,
        k_max=request.k_max
    )
    
    # Schedule cleanup
    background_tasks.add_task(cleanup_old_files, translator_service.output_dir)
    
    return TranslationResponse(
        phosphene_image_base64=phosphene_base64,
        selected_objects=selected_objects,
        metadata=metadata
    )


@router.post("/api/process", response_model=ProcessResponse)
async def process_image(request: ProcessRequest, background_tasks: BackgroundTasks):
    """
    End-to-end processing: detect objects and translate to phosphene
    
    Accepts: JSON with base64 encoded image
    Best for: JSON-only clients, small images, simple integrations
    Note: Base64 encoding adds ~33% overhead compared to /api/upload-image
    """
    try:
        # Decode base64 to numpy array
        frame = decode_base64_image(request.image_base64)
        
        # Process using shared core logic
        result = _process_frame_internal(
            frame,
            conf_threshold=request.conf_threshold,
            t_min=request.t_min,
            k_min=request.k_min,
            k_max=request.k_max,
            include_timing=True
        )
        
        # Add total detection count to metadata
        result["metadata"]["detection_count"] = len(result["detections"])
        
        # Schedule cleanup
        background_tasks.add_task(cleanup_old_files, translator_service.output_dir)
        
        return ProcessResponse(**result)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Base64 processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@router.post("/api/configure")
async def update_configuration(request: ConfigUpdateRequest):
    """
    Update translator and detector configuration parameters
    
    Allows runtime configuration of:
    - Translation thresholds (t_min, k_min, k_max)
    - YOLO detection confidence threshold (conf_threshold)
    """
    if not translator_service.translator:
        raise HTTPException(status_code=503, detail="Translator not initialized")
    
    updates = {}
    warnings = []
    
    # Update translator parameters (directly modifying the active translator object)
    if request.t_min is not None:
        old_value = translator_service.translator.params.get('T_min')
        translator_service.translator.params['T_min'] = request.t_min
        new_value = translator_service.translator.params.get('T_min')
        updates['t_min'] = new_value
        logger.info(f"Updated translator T_min: {old_value} → {new_value}")
    
    if request.k_min is not None:
        old_value = translator_service.translator.params.get('K_min')
        translator_service.translator.params['K_min'] = request.k_min
        new_value = translator_service.translator.params.get('K_min')
        updates['k_min'] = new_value
        logger.info(f"Updated translator K_min: {old_value} → {new_value}")
    
    if request.k_max is not None:
        old_value = translator_service.translator.params.get('K_max')
        translator_service.translator.params['K_max'] = request.k_max
        new_value = translator_service.translator.params.get('K_max')
        updates['k_max'] = new_value
        logger.info(f"Updated translator K_max: {old_value} → {new_value}")
    
    # Update detector confidence threshold (directly modifying the active detector object)
    if request.conf_threshold is not None:
        success = detector_service.update_conf_threshold(request.conf_threshold)
        if success:
            # Verify the update was applied by reading back the actual value
            actual_value = detector_service.get_conf_threshold()
            updates['conf_threshold'] = actual_value
            logger.info(f"✓ Detector confidence threshold updated to: {actual_value}")
        else:
            warnings.append("Failed to update detector confidence threshold (detector may not support it)")
    
    # Get actual current values from the active objects to verify updates
    current_config = {
        "t_min": translator_service.translator.params.get('T_min'),
        "k_min": translator_service.translator.params.get('K_min'),
        "k_max": translator_service.translator.params.get('K_max'),
        "conf_threshold": detector_service.get_conf_threshold()
    }
    
    response = {
        "status": "updated" if updates else "no_changes",
        "changes": updates,
        "current_config": current_config,
        "verification": "All values are read directly from active detector and translator objects"
    }
    
    if warnings:
        response["warnings"] = warnings
    
    logger.info(f"Configuration update complete. Current config: {current_config}")
    
    return response


@router.post("/api/upload-image")
async def upload_image_file(
    file: UploadFile = File(...),
    conf_threshold: float = 0.5,
    t_min: float = 0.3,
    k_min: int = 1,
    k_max: int = 5,
    background_tasks: BackgroundTasks = None
):
    """
    Upload image file for processing (RECOMMENDED - most efficient)
    
    Accepts: multipart/form-data with 'file' field
    Best for: Production use, large images, mobile apps, real-time processing
    Advantage: No base64 overhead (~33% smaller payload than /api/process)
    """
    try:
        total_start = time.time()
        
        # Read file
        read_start = time.time()
        contents = await file.read()
        read_time = (time.time() - read_start) * 1000
        
        # Convert to OpenCV format
        decode_start = time.time()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        decode_time = (time.time() - decode_start) * 1000
        
        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid image file")
        
        # Process using shared core logic
        result = _process_frame_internal(
            frame,
            conf_threshold=conf_threshold,
            t_min=t_min,
            k_min=k_min,
            k_max=k_max,
            include_timing=True
        )
        
        # Add file-specific timings to existing breakdown
        if "timing_breakdown" in result["metadata"]:
            result["metadata"]["timing_breakdown"]["file_read_ms"] = round(read_time, 2)
            result["metadata"]["timing_breakdown"]["file_decode_ms"] = round(decode_time, 2)
            
            # Recalculate total to include file I/O
            result["metadata"]["timing_breakdown"]["total_ms"] = round((time.time() - total_start) * 1000, 2)
        
        # Add detection count
        result["metadata"]["detection_count"] = len(result["detections"])
        
        # Schedule cleanup
        if background_tasks:
            background_tasks.add_task(cleanup_old_files, translator_service.output_dir)
        
        # Build timing summary for logging
        timing = result["metadata"]["timing_breakdown"]
        logger.info(
            f"Upload processing: total={timing['total_ms']:.2f}ms "
            f"(read={read_time:.2f}ms, decode={decode_time:.2f}ms, "
            f"detect={timing['detection_ms']:.2f}ms, "
            f"translator={timing.get('translator_ms', 0):.2f}ms, "
            f"phosphene={timing.get('phosphene_simulation_ms', 0):.2f}ms)"
        )
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload processing failed: {str(e)}")


@router.post("/api/process-url")
async def process_from_url(
    image_url: str,
    conf_threshold: float = 0.5,
    t_min: float = 0.3,
    k_min: int = 1,
    k_max: int = 5,
    background_tasks: BackgroundTasks = None
):
    """
    Fetch and process image from URL (useful for testing and webhooks)
    
    Accepts: URL as query parameter
    Best for: Testing with public images, automated pipelines, webhooks
    """
    try:
        import requests
        
        fetch_start = time.time()
        
        # Fetch image from URL
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
        fetch_time = (time.time() - fetch_start) * 1000
        
        # Decode image
        decode_start = time.time()
        nparr = np.frombuffer(response.content, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        decode_time = (time.time() - decode_start) * 1000
        
        if frame is None:
            raise HTTPException(status_code=400, detail="Could not decode image from URL")
        
        # Process using shared core logic
        result = _process_frame_internal(
            frame,
            conf_threshold=conf_threshold,
            t_min=t_min,
            k_min=k_min,
            k_max=k_max,
            include_timing=True
        )
        
        # Add URL-specific timings
        if "timing_breakdown" in result["metadata"]:
            result["metadata"]["timing_breakdown"]["url_fetch_ms"] = round(fetch_time, 2)
            result["metadata"]["timing_breakdown"]["decode_ms"] = round(decode_time, 2)
        
        # Add detection count and source URL
        result["metadata"]["detection_count"] = len(result["detections"])
        result["metadata"]["source_url"] = image_url
        
        # Schedule cleanup
        if background_tasks:
            background_tasks.add_task(cleanup_old_files, translator_service.output_dir)
        
        logger.info(f"URL processing: {image_url} - {result['metadata']['timing_breakdown']['total_ms']:.2f}ms")
        
        return result
    
    except Exception as e:
        logger.error(f"Failed to fetch image from URL: {image_url} - {e}")
        raise HTTPException(status_code=400, detail=f"Failed to fetch image: {str(e)}")


@router.post("/api/upload-with-depth")
async def upload_with_depth(
    image_file: UploadFile = File(..., description="RGB image file"),
    depth_file: UploadFile = File(..., description="Depth map image file"),
    depth_sampling: str = "median",
    conf_threshold: float = 0.5,
    t_min: float = 0.3,
    k_min: int = 1,
    k_max: int = 5,
    background_tasks: BackgroundTasks = None
):
    """
    Upload RGB image and depth map files for depth-aware processing (RECOMMENDED)
    
    Accepts: multipart/form-data with 'image_file' and 'depth_file' fields
    Best for: Production use, large images, mobile apps, real-time VR processing
    Advantage: No base64 overhead (~33% smaller payload than /api/process-with-depth)
    """
    try:
        total_start = time.time()
        
        logger.info(f"🎬 [START] Processing uploaded files with depth integration")
        logger.info(f"📊 [REQUEST PARAMS] depth_sampling={depth_sampling}, conf_threshold={conf_threshold}, t_min={t_min}, k_min={k_min}, k_max={k_max}")
        
        # Read and decode RGB image file
        read_start = time.time()
        image_contents = await image_file.read()
        image_nparr = np.frombuffer(image_contents, np.uint8)
        frame = cv2.imdecode(image_nparr, cv2.IMREAD_COLOR)
        image_read_time = (time.time() - read_start) * 1000
        
        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid RGB image file")
        
        logger.info(f"📥 [IMAGE] RGB file decoded: {frame.shape}, dtype: {frame.dtype}")
        
        # Read and decode depth map file
        depth_read_start = time.time()
        depth_contents = await depth_file.read()
        depth_nparr = np.frombuffer(depth_contents, np.uint8)
        depth_map = cv2.imdecode(depth_nparr, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_GRAYSCALE)
        depth_read_time = (time.time() - depth_read_start) * 1000
        
        if depth_map is None:
            raise HTTPException(status_code=400, detail="Invalid depth map file")
        
        logger.info(f"📥 [IMAGE] Depth file decoded: {depth_map.shape}, dtype: {depth_map.dtype}")
        
        # Convert depth to float32 and normalize if needed
        depth_map = depth_map.astype(np.float32)
        if depth_map.max() > 100:
            depth_map = depth_map / depth_map.max() * 10.0
        
        # Generate timestamp for this frame
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        
        # Ensure depth map matches image dimensions
        if depth_map.shape[:2] != frame.shape[:2]:
            logger.warning(f"Depth map size {depth_map.shape} != image size {frame.shape[:2]}, resizing...")
            depth_map = cv2.resize(depth_map, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_LINEAR)
        
        # Run YOLO detection
        detect_start = time.time()
        if not detector_service.is_ready():
            raise HTTPException(status_code=503, detail="Detector not initialized")
        
        detections = detector_service.detect(frame)
        detection_time = (time.time() - detect_start) * 1000
        
        logger.info(f"🔍 YOLO Detection: Found {len(detections)} objects")
        
        # Assign depth to detections
        depth_assign_start = time.time()
        detections_with_depth = assign_depth_to_detections(detections, depth_map, method=depth_sampling)
        depth_assign_time = (time.time() - depth_assign_start) * 1000
        
        logger.info(f"Depth assignment: {len(detections_with_depth)} detections, method={depth_sampling}, time={depth_assign_time:.2f}ms")
        
        # Translate to phosphene representation
        translate_start = time.time()
        if not translator_service.is_ready():
            raise HTTPException(status_code=503, detail="Translator not initialized")
        
        h, w = frame.shape[:2]
        phosphene_b64, selected_objects, translate_metadata = translator_service.translate(
            detections_with_depth,
            image_width=w,
            image_height=h,
            t_min=t_min,
            k_min=k_min,
            k_max=k_max
        )
        translation_time = (time.time() - translate_start) * 1000
        
        logger.info(f"🎨 Translation: Selected {len(selected_objects)} objects for phosphene display")
        
        # Decode phosphene image for saving
        phosphene_image = None
        if phosphene_b64:
            try:
                phosphene_bytes = base64.b64decode(phosphene_b64.split(',')[1] if ',' in phosphene_b64 else phosphene_b64)
                phosphene_nparr = np.frombuffer(phosphene_bytes, np.uint8)
                phosphene_image = cv2.imdecode(phosphene_nparr, cv2.IMREAD_COLOR)
            except Exception as e:
                logger.error(f"Failed to decode phosphene image for saving: {e}")
        
        # Save debug images
        save_debug_images(frame, depth_map, phosphene_image, timestamp, detections_with_depth)
        
        total_time = (time.time() - total_start) * 1000
        
        # Build response with detailed timing
        result = {
            "detections": detections_with_depth,
            "phosphene_image": phosphene_b64,
            "metadata": {
                "detection_count": len(detections_with_depth),
                "depth_assigned_count": len([d for d in detections_with_depth if d.get('distance_m') is not None]),
                "depth_sampling_method": depth_sampling,
                "timing_breakdown": {
                    "total_ms": round(total_time, 2),
                    "image_read_ms": round(image_read_time, 2),
                    "depth_read_ms": round(depth_read_time, 2),
                    "detection_ms": round(detection_time, 2),
                    "depth_assignment_ms": round(depth_assign_time, 2),
                    "translation_ms": round(translation_time, 2)
                }
            }
        }
        
        # Schedule cleanup
        if background_tasks:
            background_tasks.add_task(cleanup_old_files, translator_service.output_dir)
        
        logger.info(f"Upload depth processing complete: {len(detections_with_depth)} detections ({result['metadata']['depth_assigned_count']} with depth), total={total_time:.2f}ms")
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload depth processing error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Upload depth processing failed: {str(e)}")


@router.post("/api/process-with-depth")
async def process_with_depth(request: ProcessWithDepthRequest, background_tasks: BackgroundTasks = None):
    """
    Process image with VR/WebGL Z-buffer depth map integration (Base64)
    
    This endpoint combines YOLO object detection with depth information from
    a VR/Three.js scene to enable depth-aware phosphene translation.
    
    **Note:** For better performance with large images, use /api/upload-with-depth instead,
    which accepts file uploads and avoids base64 encoding overhead (~33% smaller payload).
    """
    try:
        total_start = time.time()
        
        logger.info(f"🎬 [START] Processing frame with depth integration")
        logger.info(f"📊 [REQUEST PARAMS] depth_sampling={request.depth_sampling}, conf_threshold={request.conf_threshold}, t_min={request.t_min}, k_min={request.k_min}, k_max={request.k_max}")
        
        # Decode RGB image
        decode_start = time.time()
        frame = decode_base64_image(request.image_base64)
        image_decode_time = (time.time() - decode_start) * 1000
        
        # Decode depth map
        depth_decode_start = time.time()
        depth_map = decode_depth_map(request.depth_map_base64)
        depth_decode_time = (time.time() - depth_decode_start) * 1000
        
        # Generate timestamp for this frame
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        
        # Ensure depth map matches image dimensions
        if len(depth_map.shape) == 1:
            h, w = frame.shape[:2]
            if depth_map.size == h * w:
                depth_map = depth_map.reshape(h, w)
            else:
                raise HTTPException(status_code=400, detail=f"Depth map size ({depth_map.size}) doesn't match image ({h}x{w}={h*w})")
        
        # Validate depth map dimensions match image
        if depth_map.shape[:2] != frame.shape[:2]:
            logger.warning(f"Depth map size {depth_map.shape} != image size {frame.shape[:2]}, resizing...")
            depth_map = cv2.resize(depth_map, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_LINEAR)
        
        # Run YOLO detection
        detect_start = time.time()
        if not detector_service.is_ready():
            raise HTTPException(status_code=503, detail="Detector not initialized")
        
        detections = detector_service.detect(frame)
        detection_time = (time.time() - detect_start) * 1000
        
        logger.info(f"🔍 YOLO Detection: Found {len(detections)} objects")
        
        # Assign depth to detections
        depth_assign_start = time.time()
        detections_with_depth = assign_depth_to_detections(detections, depth_map, method=request.depth_sampling)
        depth_assign_time = (time.time() - depth_assign_start) * 1000
        
        logger.info(f"Depth assignment: {len(detections_with_depth)} detections, method={request.depth_sampling}, time={depth_assign_time:.2f}ms")
        
        # Translate to phosphene representation
        translate_start = time.time()
        if not translator_service.is_ready():
            raise HTTPException(status_code=503, detail="Translator not initialized")
        
        h, w = frame.shape[:2]
        phosphene_b64, selected_objects, translate_metadata = translator_service.translate(
            detections_with_depth,
            image_width=w,
            image_height=h,
            t_min=request.t_min,
            k_min=request.k_min,
            k_max=request.k_max
        )
        translation_time = (time.time() - translate_start) * 1000
        
        logger.info(f"🎨 Translation: Selected {len(selected_objects)} objects for phosphene display")
        
        # Decode phosphene image for saving
        phosphene_image = None
        if phosphene_b64:
            try:
                phosphene_bytes = base64.b64decode(phosphene_b64.split(',')[1] if ',' in phosphene_b64 else phosphene_b64)
                phosphene_nparr = np.frombuffer(phosphene_bytes, np.uint8)
                phosphene_image = cv2.imdecode(phosphene_nparr, cv2.IMREAD_COLOR)
            except Exception as e:
                logger.error(f"Failed to decode phosphene image for saving: {e}")
        
        # Save debug images (before and after processing)
        save_debug_images(frame, depth_map, phosphene_image, timestamp, detections_with_depth)
        
        total_time = (time.time() - total_start) * 1000
        
        # Build response with detailed timing
        result = {
            "detections": detections_with_depth,
            "phosphene_image": phosphene_b64,
            "metadata": {
                "detection_count": len(detections_with_depth),
                "depth_assigned_count": len([d for d in detections_with_depth if d.get('distance_m') is not None]),
                "depth_sampling_method": request.depth_sampling,
                "timing_breakdown": {
                    "total_ms": round(total_time, 2),
                    "image_decode_ms": round(image_decode_time, 2),
                    "depth_decode_ms": round(depth_decode_time, 2),
                    "detection_ms": round(detection_time, 2),
                    "depth_assignment_ms": round(depth_assign_time, 2),
                    "translation_ms": round(translation_time, 2)
                }
            }
        }
        
        # Schedule cleanup
        if background_tasks:
            background_tasks.add_task(cleanup_old_files, translator_service.output_dir)
        
        logger.info(f"Depth processing complete: {len(detections_with_depth)} detections ({result['metadata']['depth_assigned_count']} with depth), total={total_time:.2f}ms")
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Depth processing error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Depth processing failed: {str(e)}")
