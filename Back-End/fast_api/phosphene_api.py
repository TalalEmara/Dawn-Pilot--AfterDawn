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


class ProcessWithDepthRequest(BaseModel):
    """Request for processing with depth map from VR/3D scene"""
    image_base64: str = Field(..., description="Base64 encoded RGB image")
    depth_map_base64: str = Field(..., description="Base64 encoded depth/Z-buffer")
    depth_sampling: Optional[str] = Field("median", description="How to sample depth: centroid|median|min|mean")
    conf_threshold: Optional[float] = Field(0.5, ge=0.0, le=1.0)
    t_min: Optional[float] = Field(0.3, ge=0.0, le=1.0)
    k_min: Optional[int] = Field(1, ge=0)
    k_max: Optional[int] = Field(5, ge=1)


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
                
                # Ensure canvas_size matches input image (no scaling needed)
                self.translator.params['canvas_size'] = [image_height, image_width]
                logger.debug(f"📐 Translator initialized: input={image_width}x{image_height}, canvas_size={self.translator.params['canvas_size']}")
            else:
                # Update bundle directly in memory (no file I/O)
                self.translator.bundle = detection_data
                
                # Update dimensions
                self.translator.input_width = image_width
                self.translator.input_height = image_height
                self.translator.canvas_size = (image_width, image_height)
                
                # CRITICAL: Update params canvas_size to match (format: [H, W])
                self.translator.params['canvas_size'] = [image_height, image_width]
                
                logger.debug(f"📐 Translator dimensions updated: input={image_width}x{image_height}, canvas_size={self.translator.params['canvas_size']}")
            
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
        logger.info(f"📥 [RECEIVE] RGB base64 length: {len(base64_string)}, prefix: {base64_string[:30]}")
        
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64
        img_data = base64.b64decode(base64_string)
        logger.info(f"📥 [DECODE] RGB bytes length: {len(img_data)}")
        
        # Convert to numpy array
        nparr = np.frombuffer(img_data, np.uint8)
        
        # Decode image
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        logger.info(f"📥 [IMAGE] RGB decoded: {img.shape if img is not None else 'FAILED'}, dtype: {img.dtype if img is not None else 'N/A'}")
        
        if img is None:
            raise ValueError("Failed to decode image")
        
        return img
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")


def decode_depth_map(depth_base64: str) -> np.ndarray:
    """
    Decode depth map from base64
    
    Supports multiple formats:
    - PNG/JPEG image (grayscale, will be normalized to meters)
    - Raw numpy array (float32 or uint16)
    - EXR format (32-bit float depth)
    
    Args:
        depth_base64: Base64 encoded depth data
        
    Returns:
        2D numpy array of depth values in meters
    """
    try:
        logger.info(f"📥 [RECEIVE] Depth base64 length: {len(depth_base64)}, prefix: {depth_base64[:30]}")
        
        # Remove data URL prefix if present
        if ',' in depth_base64:
            depth_base64 = depth_base64.split(',')[1]
        
        depth_data = base64.b64decode(depth_base64)
        logger.info(f"📥 [DECODE] Depth bytes length: {len(depth_data)}")
        
        # Try to decode as image first (PNG, JPEG, EXR)
        nparr = np.frombuffer(depth_data, np.uint8)
        depth_map = cv2.imdecode(nparr, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_GRAYSCALE)
        
        if depth_map is not None:
            logger.info(f"📥 [IMAGE] Depth decoded as image: {depth_map.shape}, dtype: {depth_map.dtype}")
            
            # Log depth statistics
            non_zero_count = np.count_nonzero(depth_map)
            total_pixels = depth_map.size
            logger.info(f"📊 [DEPTH STATS] Non-zero pixels: {non_zero_count}/{total_pixels} ({100*non_zero_count/total_pixels:.1f}%), min: {depth_map.min()}, max: {depth_map.max()}, mean: {depth_map[depth_map>0].mean() if non_zero_count > 0 else 0:.2f}")
            
            # Convert to float32
            depth_map = depth_map.astype(np.float32)
            
            # If image is 8-bit or 16-bit, normalize to reasonable depth range
            if depth_map.max() > 100:  # Likely pixel values, not meters
                depth_map = depth_map / depth_map.max() * 10.0  # Normalize to 0-10m range
            
            return depth_map
        
        # Try as raw numpy array (float32)
        try:
            depth_array = np.frombuffer(depth_data, dtype=np.float32)
            # This will be a 1D array, caller must reshape if needed
            logger.info(f"Decoded raw depth array: {depth_array.shape}")
            return depth_array
        except:
            pass
        
        raise ValueError("Could not decode depth map as image or numpy array")
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid depth map data: {str(e)}")


def save_debug_images(frame: np.ndarray, depth_map: np.ndarray, phosphene_image: np.ndarray, timestamp: str, detections: list = None):
    """
    Save RGB, depth, and phosphene images for debugging
    
    Args:
        frame: RGB image (BGR format from OpenCV)
        depth_map: Depth map (grayscale or float)
        phosphene_image: Processed phosphene output
        timestamp: Timestamp string for filename
        detections: List of detections with bounding boxes (optional)
    """
    try:
        # Create output directory if it doesn't exist
        output_dir = os.path.join(os.path.dirname(__file__), "api_output", "debug_frames")
        os.makedirs(output_dir, exist_ok=True)
        
        # Save RGB image (before processing)
        rgb_path = os.path.join(output_dir, f"rgb_before_{timestamp}.png")
        cv2.imwrite(rgb_path, frame)
        logger.info(f"💾 Saved RGB (before): {rgb_path}")
        
        # Save RGB with bounding boxes overlaid
        if detections:
            frame_with_boxes = frame.copy()
            for det in detections:
                bbox = det.get('bbox', [0, 0, 0, 0])  # [x, y, w, h]
                x, y, w, h = [int(v) for v in bbox]
                # Draw rectangle
                cv2.rectangle(frame_with_boxes, (x, y), (x + w, y + h), (0, 255, 0), 2)
                # Draw label
                label = f"{det.get('class', 'unknown')} {det.get('confidence', 0):.2f}"
                cv2.putText(frame_with_boxes, label, (x, y - 5), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
            
            rgb_boxes_path = os.path.join(output_dir, f"rgb_with_boxes_{timestamp}.png")
            cv2.imwrite(rgb_boxes_path, frame_with_boxes)
            logger.info(f"💾 Saved RGB with boxes: {rgb_boxes_path}")
        
        # Save depth map (before processing)
        if depth_map is not None:
            depth_path = os.path.join(output_dir, f"depth_before_{timestamp}.png")
            # Normalize depth for visualization
            depth_vis = cv2.normalize(depth_map, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
            cv2.imwrite(depth_path, depth_vis)
            logger.info(f"💾 Saved Depth (before): {depth_path}")
        
        # Save phosphene image (after processing)
        if phosphene_image is not None:
            phosphene_path = os.path.join(output_dir, f"phosphene_after_{timestamp}.png")
            cv2.imwrite(phosphene_path, phosphene_image)
            logger.info(f"💾 Saved Phosphene (after): {phosphene_path}")
        
        return True
    except Exception as e:
        logger.error(f"❌ Failed to save debug images: {str(e)}")
        return False


def assign_depth_to_detections(
    detections: List[Dict[str, Any]],
    depth_map: np.ndarray,
    method: str = "median"
) -> List[Dict[str, Any]]:
    """
    Assign depth values to YOLO detections by sampling from Z-buffer
    
    Your translator already handles depth in scoring! This function extracts
    depth from the Z-buffer and assigns it to each detection so the translator
    can prioritize closer objects.
    
    Args:
        detections: List of YOLO detections with bbox [x, y, w, h]
        depth_map: 2D array of depth values (same size as image)
        method: How to sample depth from bbox region
            - "centroid": Depth at object center point
            - "median": Median depth in bbox (robust to outliers/noise)
            - "min": Closest point in bbox (most conservative)
            - "mean": Average depth in bbox
    
    Returns:
        Detections enriched with 'distance_m' field (used by translator scoring)
    """
    # Handle 1D depth array (reshape to 2D if needed)
    if len(depth_map.shape) == 1:
        # Assume square or infer from image - this is a fallback
        size = int(np.sqrt(depth_map.shape[0]))
        depth_map = depth_map[:size*size].reshape(size, size)
        logger.warning(f"Reshaped 1D depth array to {size}x{size}")
    
    h, w = depth_map.shape
    
    for det in detections:
        bbox = det.get('bbox', [0, 0, 0, 0])  # [x, y, w, h]
        x, y, bw, bh = bbox
        
        # Clamp bbox to image boundaries
        x1 = max(0, int(x))
        y1 = max(0, int(y))
        x2 = min(w, int(x + bw))
        y2 = min(h, int(y + bh))
        
        # Ensure valid bbox
        if x2 <= x1 or y2 <= y1:
            det['distance_m'] = None
            continue
        
        # Extract depth values in bounding box region
        depth_roi = depth_map[y1:y2, x1:x2]
        
        if depth_roi.size == 0:
            det['distance_m'] = None
            continue
        
        # Sample depth based on method
        try:
            if method == "centroid":
                # Depth at object center
                cy, cx = depth_roi.shape[0] // 2, depth_roi.shape[1] // 2
                depth = float(depth_roi[cy, cx])
            
            elif method == "median":
                # Median depth (robust to noise/outliers)
                valid_depths = depth_roi[depth_roi > 0]  # Ignore 0 (invalid/sky)
                depth = float(np.median(valid_depths)) if valid_depths.size > 0 else 0.0
            
            elif method == "min":
                # Closest point (conservative - closest obstacle)
                valid_depths = depth_roi[depth_roi > 0]
                depth = float(np.min(valid_depths)) if valid_depths.size > 0 else 0.0
            
            elif method == "mean":
                # Average depth
                valid_depths = depth_roi[depth_roi > 0]
                depth = float(np.mean(valid_depths)) if valid_depths.size > 0 else 0.0
            
            else:
                logger.warning(f"Unknown depth sampling method: {method}, using median")
                valid_depths = depth_roi[depth_roi > 0]
                depth = float(np.median(valid_depths)) if valid_depths.size > 0 else 0.0
            
            # Assign depth (translator uses distance_m, depth, or depth_z)
            det['distance_m'] = depth if depth > 0 else None
            
        except Exception as e:
            logger.error(f"Error sampling depth for detection: {e}")
            det['distance_m'] = None
    
    return detections


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


@app.post("/api/upload-with-depth")
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
    
    This endpoint provides the same functionality as /api/process-with-depth but
    accepts file uploads instead of base64 encoded data for better performance.
    
    Form fields:
        image_file: RGB camera frame (JPEG/PNG)
        depth_file: Depth map from VR/WebGL Z-buffer (PNG/JPEG/EXR)
        depth_sampling: Method to extract depth ("median" recommended)
        conf_threshold: YOLO detection confidence (0.0-1.0)
        t_min: Minimum score threshold for translation
        k_min: Minimum objects to select
        k_max: Maximum objects to select
    
    Returns:
        Same as /api/process-with-depth with detections, phosphene image, and metadata
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
        
        # Log depth statistics
        non_zero_count = np.count_nonzero(depth_map)
        total_pixels = depth_map.size
        logger.info(f"📊 [DEPTH STATS] Non-zero pixels: {non_zero_count}/{total_pixels} ({100*non_zero_count/total_pixels:.1f}%), min: {depth_map.min()}, max: {depth_map.max()}, mean: {depth_map[depth_map>0].mean() if non_zero_count > 0 else 0:.2f}")
        
        # Convert depth to float32 and normalize if needed
        depth_map = depth_map.astype(np.float32)
        if depth_map.max() > 100:  # Likely pixel values, not meters
            depth_map = depth_map / depth_map.max() * 10.0  # Normalize to 0-10m range
        
        # Generate timestamp for this frame
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        
        # Ensure depth map matches image dimensions
        if depth_map.shape[:2] != frame.shape[:2]:
            logger.warning(
                f"Depth map size {depth_map.shape} != image size {frame.shape[:2]}, resizing..."
            )
            depth_map = cv2.resize(depth_map, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_LINEAR)
        
        # Run YOLO detection
        detect_start = time.time()
        if not detector_service.is_ready():
            raise HTTPException(status_code=503, detail="Detector not initialized")
        
        detections = detector_service.detect(frame)
        detection_time = (time.time() - detect_start) * 1000
        
        logger.info(f"🔍 YOLO Detection: Found {len(detections)} objects")
        if len(detections) > 0:
            for i, det in enumerate(detections[:3]):
                logger.info(f"  Detection {i+1}: class={det.get('class')}, conf={det.get('confidence'):.2f}, bbox={det.get('bbox')}")
        else:
            logger.warning("⚠️ No objects detected by YOLO! Check if model is loaded correctly.")
        
        # Assign depth to detections
        depth_assign_start = time.time()
        detections_with_depth = assign_depth_to_detections(
            detections,
            depth_map,
            method=depth_sampling
        )
        depth_assign_time = (time.time() - depth_assign_start) * 1000
        
        logger.info(
            f"Depth assignment: {len(detections_with_depth)} detections, "
            f"method={depth_sampling}, time={depth_assign_time:.2f}ms"
        )
        
        # Log depth statistics
        depths = [d.get('distance_m') for d in detections_with_depth if d.get('distance_m') is not None]
        if depths:
            logger.info(
                f"Depth stats: min={min(depths):.2f}m, max={max(depths):.2f}m, "
                f"mean={np.mean(depths):.2f}m, median={np.median(depths):.2f}m"
            )
        
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
        if len(selected_objects) > 0:
            for i, obj in enumerate(selected_objects[:3]):
                logger.info(f"  Selected {i+1}: class={obj.get('class')}, score={obj.get('score'):.2f}, distance={obj.get('distance_m')}")
        else:
            logger.warning("⚠️ No objects selected by translator! Check t_min threshold or detection confidence.")
        
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
        
        logger.info(
            f"Upload depth processing complete: {len(detections_with_depth)} detections "
            f"({result['metadata']['depth_assigned_count']} with depth), "
            f"total={total_time:.2f}ms"
        )
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload depth processing error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Upload depth processing failed: {str(e)}")


@app.post("/api/process-with-depth")
async def process_with_depth(
    request: ProcessWithDepthRequest,
    background_tasks: BackgroundTasks = None
):
    """
    Process image with VR/WebGL Z-buffer depth map integration (Base64)
    
    This endpoint combines YOLO object detection with depth information from
    a VR/Three.js scene to enable depth-aware phosphene translation. The depth
    values are assigned to each detected object, and the translator automatically
    prioritizes closer objects in the phosphene representation.
    
    **Note:** For better performance with large images, use /api/upload-with-depth instead,
    which accepts file uploads and avoids base64 encoding overhead (~33% smaller payload).
    
    **Depth Sampling Methods:**
    - `centroid`: Depth at object center point (fast, works for centered objects)
    - `median`: Median depth in bbox (robust to noise/outliers) - **RECOMMENDED**
    - `min`: Closest point in bbox (conservative, good for obstacle avoidance)
    - `mean`: Average depth in bbox (smooth but sensitive to outliers)
    
    **Depth Map Formats Supported:**
    - PNG/JPEG grayscale (8-bit or 16-bit, will be normalized to meters)
    - Raw numpy float32 array (base64 encoded)
    - EXR format (32-bit float depth from rendering engines)
    
    **How it works:**
    1. Decode image and depth map from base64
    2. Run YOLO detection on RGB image
    3. For each detection, sample depth from Z-buffer using bbox coordinates
    4. Assign depth as 'distance_m' field (used by translator scoring)
    5. Translator automatically prioritizes closer objects (higher scores)
    
    **Use Case Example:**
    VR headset captures 500ms frame intervals. For each frame:
    - Capture RGB image from camera
    - Render Three.js scene to get Z-buffer/depth map
    - Send both to this endpoint
    - Receive phosphene representation with depth-aware prioritization
    
    Args:
        request: ProcessWithDepthRequest containing:
            - image_base64: RGB camera frame
            - depth_map_base64: Z-buffer from VR/WebGL scene
            - depth_sampling: Method to extract depth ("median" recommended)
            - conf_threshold: YOLO detection confidence (0.0-1.0)
            - t_min, k_min, k_max: Translator selection parameters
    
    Returns:
        ProcessResponse with:
            - detections: YOLO results enriched with 'distance_m' field
            - phosphene_image: Base64 phosphene representation (depth-prioritized)
            - metadata: Timing breakdown and detection count
    
    Example Request:
        POST /api/process-with-depth
        {
            "image_base64": "data:image/jpeg;base64,/9j/4AAQ...",
            "depth_map_base64": "data:image/png;base64,iVBOR...",
            "depth_sampling": "median",
            "conf_threshold": 0.5,
            "t_min": 0.3,
            "k_min": 1,
            "k_max": 5
        }
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
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # milliseconds
        
        # Ensure depth map matches image dimensions
        if len(depth_map.shape) == 1:
            # Reshape 1D to match image dimensions
            h, w = frame.shape[:2]
            if depth_map.size == h * w:
                depth_map = depth_map.reshape(h, w)
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Depth map size ({depth_map.size}) doesn't match image ({h}x{w}={h*w})"
                )
        
        # Validate depth map dimensions match image
        if depth_map.shape[:2] != frame.shape[:2]:
            # Try resizing depth map to match image
            logger.warning(
                f"Depth map size {depth_map.shape} != image size {frame.shape[:2]}, resizing..."
            )
            depth_map = cv2.resize(depth_map, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_LINEAR)
        
        # Run YOLO detection
        detect_start = time.time()
        if not detector_service.is_ready():
            raise HTTPException(status_code=503, detail="Detector not initialized")
        
        detections = detector_service.detect(frame)
        detection_time = (time.time() - detect_start) * 1000
        
        logger.info(f"🔍 YOLO Detection: Found {len(detections)} objects")
        if len(detections) > 0:
            for i, det in enumerate(detections[:3]):  # Log first 3 detections
                logger.info(f"  Detection {i+1}: class={det.get('class')}, conf={det.get('confidence'):.2f}, bbox={det.get('bbox')}")
        else:
            logger.warning("⚠️ No objects detected by YOLO! Check if model is loaded correctly.")
        
        # Assign depth to detections
        depth_assign_start = time.time()
        detections_with_depth = assign_depth_to_detections(
            detections,
            depth_map,
            method=request.depth_sampling
        )
        depth_assign_time = (time.time() - depth_assign_start) * 1000
        
        logger.info(
            f"Depth assignment: {len(detections_with_depth)} detections, "
            f"method={request.depth_sampling}, time={depth_assign_time:.2f}ms"
        )
        
        # Log depth statistics
        depths = [d.get('distance_m') for d in detections_with_depth if d.get('distance_m') is not None]
        if depths:
            logger.info(
                f"Depth stats: min={min(depths):.2f}m, max={max(depths):.2f}m, "
                f"mean={np.mean(depths):.2f}m, median={np.median(depths):.2f}m"
            )
        
        # Translate to phosphene representation
        # The translator will automatically prioritize closer objects based on distance_m
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
        if len(selected_objects) > 0:
            for i, obj in enumerate(selected_objects[:3]):
                logger.info(f"  Selected {i+1}: class={obj.get('class')}, score={obj.get('score'):.2f}, distance={obj.get('distance_m')}")
        else:
            logger.warning("⚠️ No objects selected by translator! Check t_min threshold or detection confidence.")
        
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
        
        # No need to encode again, already base64
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
        
        logger.info(
            f"Depth processing complete: {len(detections_with_depth)} detections "
            f"({result['metadata']['depth_assigned_count']} with depth), "
            f"total={total_time:.2f}ms"
        )
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Depth processing error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Depth processing failed: {str(e)}")


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
