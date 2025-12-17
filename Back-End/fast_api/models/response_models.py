"""
Response Models for Phosphene Vision API

Pydantic models for validating API responses.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class DetectionObject(BaseModel):
    """Single detected object"""
    class_name: str = Field(..., alias="class")
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: List[int] = Field(..., description="Bounding box [x, y, w, h]")
    centroid_px: List[int] = Field(..., description="Object center [x, y]")
    distance_m: Optional[float] = Field(None, description="Distance in meters")
    
    class Config:
        populate_by_name = True


class DetectionResponse(BaseModel):
    """Response from object detection"""
    objects: List[DetectionObject]
    count: int
    image_size: Dict[str, int]
    processing_time_ms: float


class TranslationResponse(BaseModel):
    """Response from phosphene translation"""
    phosphene_image_base64: str
    selected_objects: List[Dict[str, Any]]
    metadata: Dict[str, Any]


class ProcessResponse(BaseModel):
    """Response from end-to-end processing"""
    detections: List[DetectionObject]
    phosphene_image_base64: str
    selected_objects: List[Dict[str, Any]]
    metadata: Dict[str, Any]


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    detector_type: str
    detector_loaded: bool
    translator_ready: bool
    timestamp: str
