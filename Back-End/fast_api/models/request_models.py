"""
Request Models for Phosphene Vision API

Pydantic models for validating incoming API requests.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class DetectionRequest(BaseModel):
    """Request for object detection"""
    image_base64: str = Field(..., description="Base64 encoded image")
    conf_threshold: Optional[float] = Field(0.5, ge=0.0, le=1.0)


class TranslationRequest(BaseModel):
    """Request for phosphene translation"""
    objects: List[Dict[str, Any]] = Field(..., description="Detected objects")
    image_width: int = Field(..., gt=0)
    image_height: int = Field(..., gt=0)
    t_min: Optional[float] = Field(0.3, ge=0.0, le=1.0, description="Minimum score threshold")
    k_min: Optional[int] = Field(1, ge=0, description="Minimum objects to select")
    k_max: Optional[int] = Field(5, ge=1, description="Maximum objects to select")


class ProcessRequest(BaseModel):
    """Request for end-to-end processing"""
    image_base64: str
    conf_threshold: Optional[float] = Field(0.5, ge=0.0, le=1.0)
    t_min: Optional[float] = Field(0.3, ge=0.0, le=1.0)
    k_min: Optional[int] = Field(1, ge=0)
    k_max: Optional[int] = Field(5, ge=1)


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
