#!/usr/bin/env python3
"""
Phosphene Vision FastAPI Service

FastAPI service that wraps the phosphene vision translator system.
Provides endpoints for object detection and phosphene shape translation.

Author: Dawn Pilot Team
Date: November 2025
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn
import cv2
import numpy as np
import base64
import json
import os
import time
import requests
from datetime import datetime
import logging
from io import BytesIO
from PIL import Image

# Import local modules
from translator import Translator
from realtime_detector import create_detector

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# Pydantic Models for Request/Response Validation
# ============================================================================

class DetectionObject(BaseModel):
    """Single detected object"""
    class_name: str = Field(..., alias="class")
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: List[int] = Field(..., description="Bounding box [x, y, w, h]")
    centroid_px: List[int] = Field(..., description="Object center [x, y]")
    distance_m: Optional[float] = Field(None, description="Distance in meters")
    
    class Config:
        populate_by_name = True


class DetectionRequest(BaseModel):
    """Request for object detection"""
    image_base64: str = Field(..., description="Base64 encoded image")
    conf_threshold: Optional[float] = Field(0.5, ge=0.0, le=1.0)


class DetectionResponse(BaseModel):
    """Response from object detection"""
    objects: List[DetectionObject]
    count: int
    image_size: Dict[str, int]
    processing_time_ms: float


class TranslationRequest(BaseModel):
    """Request for phosphene translation"""
    objects: List[Dict[str, Any]] = Field(..., description="Detected objects")
    image_width: int = Field(..., gt=0)
    image_height: int = Field(..., gt=0)
    t_min: Optional[float] = Field(0.3, ge=0.0, le=1.0, description="Minimum score threshold")
    k_min: Optional[int] = Field(1, ge=0, description="Minimum objects to select")
    k_max: Optional[int] = Field(5, ge=1, description="Maximum objects to select")


class TranslationResponse(BaseModel):
    """Response from phosphene translation"""
    phosphene_image_base64: str
    selected_objects: List[Dict[str, Any]]
    metadata: Dict[str, Any]


class ProcessRequest(BaseModel):
    """Request for end-to-end processing"""
    image_base64: str
    conf_threshold: Optional[float] = Field(0.5, ge=0.0, le=1.0)
    t_min: Optional[float] = Field(0.3, ge=0.0, le=1.0)
    k_min: Optional[int] = Field(1, ge=0)
    k_max: Optional[int] = Field(5, ge=1)


class ProcessResponse(BaseModel):
    """Response from end-to-end processing"""
    detections: List[DetectionObject]
    phosphene_image_base64: str
    selected_objects: List[Dict[str, Any]]
    metadata: Dict[str, Any]


class ConfigUpdateRequest(BaseModel):
    """Request to update configuration"""
    t_min: Optional[float] = Field(None, ge=0.0, le=1.0, description="Minimum score threshold for translation")
    k_min: Optional[int] = Field(None, ge=0, description="Minimum objects to select")
    k_max: Optional[int] = Field(None, ge=1, description="Maximum objects to select")
    conf_threshold: Optional[float] = Field(None, ge=0.0, le=1.0, description="YOLO detection confidence threshold")


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    detector_type: str
    detector_loaded: bool
    translator_ready: bool
    timestamp: str


# ============================================================================
# Service Singleton Classes
# ============================================================================

class DetectorService:
    """Singleton service for object detection"""
    
    def __init__(self):
        self.detector = None
        self.detector_type = "mock"
        self.config_path = os.path.join(os.path.dirname(__file__), "detector_config.json")
        self._load_detector()
    
    def _load_detector(self):
        """Load detector from configuration"""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    config = json.load(f)
                
                self.detector_type = config.get("detector_type", "mock")
                
                if self.detector_type == "yolo":
                    yolo_config = config.get("yolo", {})
                    model_path = yolo_config.get("model_path", "yolov8n.pt")
                    # Make path absolute if relative
                    if not os.path.isabs(model_path):
                        model_path = os.path.join(os.path.dirname(__file__), model_path)
                    
                    self.detector = create_detector(
                        "yolo",
                        model_path=model_path,
                        conf_threshold=yolo_config.get("conf_threshold", 0.5)
                    )
                elif self.detector_type == "fasterrcnn":
                    frcnn_config = config.get("fasterrcnn", {})
                    self.detector = create_detector(
                        "fasterrcnn",
                        model_path=frcnn_config.get("model_path"),
                        conf_threshold=frcnn_config.get("conf_threshold", 0.5)
                    )
                else:
                    self.detector = create_detector("mock")
                    self.detector_type = "mock"
            else:
                logger.warning(f"Config file not found: {self.config_path}, using mock detector")
                self.detector = create_detector("mock")
                self.detector_type = "mock"
            
            logger.info(f"Detector loaded: {self.detector_type} (ready: {self.detector.is_loaded})")
        
        except Exception as e:
            logger.error(f"Failed to load detector: {e}")
            self.detector = create_detector("mock")
            self.detector_type = "mock"
    
    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Run detection on frame"""
        if not self.detector or not self.detector.is_loaded:
            raise HTTPException(status_code=503, detail="Detector not loaded")
        
        return self.detector.detect(frame)
    
    def update_conf_threshold(self, conf_threshold: float) -> bool:
        """
        Update detection confidence threshold
        
        Args:
            conf_threshold: New confidence threshold (0.0 to 1.0)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if self.detector and hasattr(self.detector, 'conf_threshold'):
                self.detector.conf_threshold = conf_threshold
                logger.info(f"Updated detector confidence threshold to {conf_threshold}")
                return True
            else:
                logger.warning("Detector does not support confidence threshold updates")
                return False
        except Exception as e:
            logger.error(f"Failed to update confidence threshold: {e}")
            return False
    
    def get_conf_threshold(self) -> Optional[float]:
        """Get current detection confidence threshold"""
        if self.detector and hasattr(self.detector, 'conf_threshold'):
            return self.detector.conf_threshold
        return None
    
    def is_ready(self) -> bool:
        """Check if detector is ready"""
        return self.detector is not None and self.detector.is_loaded


class TranslatorService:
    """Singleton service for phosphene translation"""
    
    def __init__(self, eager_init: bool = True):
        self.translator = None
        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.output_dir = os.path.join(self.script_dir, "api_output")
        self.temp_json_path = os.path.join(self.output_dir, "temp_detection.json")
        
        # Configuration paths
        self.shapes_path = os.path.join(self.script_dir, "dummy_data/canonical_shapes.json")
        self.params_path = os.path.join(self.script_dir, "dummy_data/selection_params.json")
        
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Verify required files exist
        self._verify_config_files()
        
        # Eagerly initialize translator to avoid first-request delay
        if eager_init:
            self._initialize_translator()
    
    def _verify_config_files(self):
        """Verify that required configuration files exist"""
        if not os.path.exists(self.shapes_path):
            logger.warning(f"Shapes file not found: {self.shapes_path}")
        if not os.path.exists(self.params_path):
            logger.warning(f"Params file not found: {self.params_path}")
    
    def _initialize_translator(self):
        """Initialize translator with dummy data at startup to avoid first-request delay"""
        try:
            logger.info("Pre-initializing translator...")
            
            # Create a minimal dummy detection bundle for initialization
            dummy_detection = {
                "frame_id": "init_frame",
                "file_path": "initialization",
                "metadata": {
                    "image_width": 640,
                    "image_height": 480,
                    "camera_intrinsics": None
                },
                "free_path": None,
                "obstacles": []
            }
            
            # Save temporary detection JSON for initialization
            with open(self.temp_json_path, 'w') as f:
                json.dump(dummy_detection, f)
            
            # Initialize the translator
            self.translator = Translator(
                self.temp_json_path,
                self.shapes_path,
                self.params_path,
                None,
                self.output_dir
            )
            
            logger.info("✓ Translator pre-initialized successfully")
        except Exception as e:
            logger.warning(f"Failed to pre-initialize translator: {e}")
            # Don't fail startup, translator will be lazy-loaded on first request
            self.translator = None
    
    def translate(
        self,
        objects: List[Dict[str, Any]],
        image_width: int,
        image_height: int,
        t_min: float = 0.3,
        k_min: int = 1,
        k_max: int = 5
    ) -> tuple:
        """
        Translate detected objects to phosphene representation
        
        Returns:
            tuple: (phosphene_image_base64, selected_objects, metadata)
        """
        start_time = time.time()
        
        try:
            # Create detection bundle (in-memory, no file I/O needed for updating)
            detection_data = {
                "frame_id": f"api_frame_{int(time.time() * 1000)}",
                "file_path": "api_request",
                "metadata": {
                    "image_width": image_width,
                    "image_height": image_height,
                    "camera_intrinsics": None
                },
                "free_path": None,
                "obstacles": objects
            }
            
            # Initialize or reuse translator
            if self.translator is None:
                # Save temporary detection JSON only for initialization
                with open(self.temp_json_path, 'w') as f:
                    json.dump(detection_data, f)
                    
                self.translator = Translator(
                    self.temp_json_path,
                    self.shapes_path,
                    self.params_path,
                    None,
                    self.output_dir
                )
            else:
                # Update bundle directly in memory (no file I/O)
                self.translator.bundle = detection_data
                
                # Update dimensions
                self.translator.input_width = image_width
                self.translator.input_height = image_height
                self.translator.canvas_size = (image_width, image_height)
            
            # Update threshold parameters
            self.translator.params['T_min'] = t_min
            self.translator.params['K_min'] = k_min
            self.translator.params['K_max'] = k_max
            
            # Generate output
            timestamp = int(time.time() * 1000)
            output_filename = f"api_frame_{timestamp}.png"
            output_path = self.translator.run(output_filename)
            
            # Read and encode output image
            with open(output_path, 'rb') as img_file:
                img_data = img_file.read()
                phosphene_base64 = base64.b64encode(img_data).decode('utf-8')
            
            # Get selected objects
            selected_objects = self._get_selected_objects()
            
            processing_time = (time.time() - start_time) * 1000
            
            metadata = {
                "processing_time_ms": round(processing_time, 2),
                "selected_count": len(selected_objects),
                "total_objects": len(objects),
                "thresholds": {
                    "t_min": t_min,
                    "k_min": k_min,
                    "k_max": k_max
                }
            }
            
            return phosphene_base64, selected_objects, metadata
        
        except Exception as e:
            logger.error(f"Translation error: {e}")
            raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")
    
    def _get_selected_objects(self) -> List[Dict[str, Any]]:
        """Get list of selected objects with scores"""
        if not self.translator:
            return []
        
        try:
            selected = self.translator.select_objects()
            
            result = []
            for obj in selected:
                result.append({
                    "class": obj.get("class", "unknown"),
                    "score": obj.get("score", 0.0),
                    "distance_m": obj.get("distance_m", obj.get("depth")),
                    "bbox": obj.get("bbox", []),
                    "confidence": obj.get("confidence", 1.0)
                })
            
            return result
        
        except Exception as e:
            logger.error(f"Error getting selected objects: {e}")
            return []
    
    def is_ready(self) -> bool:
        """Check if translator is ready"""
        return (os.path.exists(self.shapes_path) and 
                os.path.exists(self.params_path))


# ============================================================================
# Initialize Services
# ============================================================================

detector_service = DetectorService()
translator_service = TranslatorService()

# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="Phosphene Vision API",
    description="Object detection and phosphene shape translation service",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Utility Functions
# ============================================================================

def decode_base64_image(base64_string: str) -> np.ndarray:
    """Decode base64 string to OpenCV image"""
    try:
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64
        img_data = base64.b64decode(base64_string)
        
        # Convert to numpy array
        nparr = np.frombuffer(img_data, np.uint8)
        
        # Decode image
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("Failed to decode image")
        
        return img
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")


def cleanup_old_files(directory: str, max_age_seconds: int = 3600):
    """Background task to cleanup old temporary files"""
    try:
        current_time = time.time()
        for filename in os.listdir(directory):
            filepath = os.path.join(directory, filename)
            if os.path.isfile(filepath):
                file_age = current_time - os.path.getmtime(filepath)
                if file_age > max_age_seconds:
                    os.remove(filepath)
                    logger.debug(f"Cleaned up old file: {filename}")
    except Exception as e:
        logger.error(f"Cleanup error: {e}")


# ============================================================================
# Core Processing Logic (DRY - shared by all routes)
# ============================================================================

def _process_frame_internal(
    frame: np.ndarray,
    conf_threshold: float = 0.5,
    t_min: float = 0.3,
    k_min: int = 1,
    k_max: int = 5,
    include_timing: bool = False
) -> Dict[str, Any]:
    """
    Core image processing logic - shared by all endpoints
    
    This is the single source of truth for detection + translation.
    Works on decoded numpy array (no format coupling).
    
    Args:
        frame: OpenCV image (numpy array)
        conf_threshold: Detection confidence threshold (not currently used, reserved for future)
        t_min: Minimum score threshold for translation
        k_min: Minimum objects to select
        k_max: Maximum objects to select
        include_timing: Whether to include detailed timing breakdown
        
    Returns:
        Dictionary with detections, phosphene image, and metadata
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


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint"""
    return {
        "service": "Phosphene Vision API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/api/health", response_model=HealthResponse)
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


@app.post("/api/detect", response_model=DetectionResponse)
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


@app.post("/api/translate", response_model=TranslationResponse)
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


@app.post("/api/process", response_model=ProcessResponse)
async def process_image(request: ProcessRequest, background_tasks: BackgroundTasks):
    """
    End-to-end processing: detect objects and translate to phosphene
    
    Accepts: JSON with base64 encoded image
    Best for: JSON-only clients, small images, simple integrations
    Note: Base64 encoding adds ~33% overhead compared to /api/upload-image
    
    Args:
        request: ProcessRequest with image and parameters
        
    Returns:
        ProcessResponse with detections and phosphene image
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
            include_timing=True  # Include timing for debugging
        )
        
        # Add total detection count to metadata
        result["metadata"]["detection_count"] = len(result["detections"])
        
        # Schedule cleanup
        background_tasks.add_task(cleanup_old_files, translator_service.output_dir)
        
        # Return as Pydantic model
        return ProcessResponse(**result)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Base64 processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/api/configure")
async def update_configuration(request: ConfigUpdateRequest):
    """
    Update translator and detector configuration parameters
    
    Allows runtime configuration of:
    - Translation thresholds (t_min, k_min, k_max)
    - YOLO detection confidence threshold (conf_threshold)
    
    Args:
        request: ConfigUpdateRequest with threshold parameters
        
    Returns:
        Updated configuration and status
    """
    if not translator_service.translator:
        raise HTTPException(status_code=503, detail="Translator not initialized")
    
    updates = {}
    warnings = []
    
    # Update translator parameters
    if request.t_min is not None:
        translator_service.translator.params['T_min'] = request.t_min
        updates['t_min'] = request.t_min
    
    if request.k_min is not None:
        translator_service.translator.params['K_min'] = request.k_min
        updates['k_min'] = request.k_min
    
    if request.k_max is not None:
        translator_service.translator.params['K_max'] = request.k_max
        updates['k_max'] = request.k_max
    
    # Update detector confidence threshold
    if request.conf_threshold is not None:
        success = detector_service.update_conf_threshold(request.conf_threshold)
        if success:
            updates['conf_threshold'] = request.conf_threshold
        else:
            warnings.append("Failed to update detector confidence threshold (detector may not support it)")
    
    response = {
        "status": "updated" if updates else "no_changes",
        "changes": updates,
        "current_config": {
            "t_min": translator_service.translator.params.get('T_min'),
            "k_min": translator_service.translator.params.get('K_min'),
            "k_max": translator_service.translator.params.get('K_max'),
            "conf_threshold": detector_service.get_conf_threshold()
        }
    }
    
    if warnings:
        response["warnings"] = warnings
    
    return response


@app.post("/api/upload-image")
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
    
    Query parameters:
        conf_threshold: Detection confidence (default: 0.5)
        t_min: Minimum score threshold (default: 0.3)
        k_min: Minimum objects to select (default: 1)
        k_max: Maximum objects to select (default: 5)
        
    Returns:
        ProcessResponse with detections, phosphene image, and detailed timing
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
            result["metadata"]["timing_breakdown"]["decode_ms"] = round(decode_time, 2)
            # Recalculate total to include file I/O
            result["metadata"]["timing_breakdown"]["total_ms"] = round((time.time() - total_start) * 1000, 2)
        
        # Add detection count
        result["metadata"]["detection_count"] = len(result["detections"])
        
        # Schedule cleanup
        if background_tasks:
            background_tasks.add_task(cleanup_old_files, translator_service.output_dir)
        
        logger.info(
            f"Upload processing: total={result['metadata']['timing_breakdown']['total_ms']:.2f}ms "
            f"(read={read_time:.2f}ms, decode={decode_time:.2f}ms, "
            f"detect={result['metadata']['timing_breakdown']['detection_ms']:.2f}ms, "
            f"translate={result['metadata']['timing_breakdown']['translation_ms']:.2f}ms)"
        )
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload processing failed: {str(e)}")


@app.post("/api/process-url")
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
    
    Example:
        POST /api/process-url?image_url=https://example.com/image.jpg&t_min=0.4
        
    Query parameters:
        image_url: URL of the image to process (required)
        conf_threshold: Detection confidence (default: 0.5)
        t_min: Minimum score threshold (default: 0.3)
        k_min: Minimum objects to select (default: 1)
        k_max: Maximum objects to select (default: 5)
        
    Returns:
        ProcessResponse with detections, phosphene image, and timing
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
    
    except requests.RequestException as e:
        logger.error(f"Failed to fetch image from URL: {image_url} - {e}")
        raise HTTPException(status_code=400, detail=f"Failed to fetch image: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"URL processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


# ============================================================================
# Startup/Shutdown Events
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("=" * 60)
    logger.info("Phosphene Vision API Starting...")
    logger.info(f"Detector: {detector_service.detector_type} (ready: {detector_service.is_ready()})")
    logger.info(f"Translator: ready: {translator_service.is_ready()}")
    logger.info(f"Output directory: {translator_service.output_dir}")
    logger.info("=" * 60)


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Phosphene Vision API shutting down...")


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "phosphene_api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
