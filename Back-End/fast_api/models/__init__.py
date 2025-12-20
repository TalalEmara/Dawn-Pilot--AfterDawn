"""
Models Package

Exposes all request and response models for the Phosphene Vision API.
"""

from .request_models import (
    DetectionRequest,
    TranslationRequest,
    ProcessRequest,
    ConfigUpdateRequest,
    ProcessWithDepthRequest
)

from .response_models import (
    DetectionObject,
    DetectionResponse,
    TranslationResponse,
    ProcessResponse,
    HealthResponse
)

__all__ = [
    # Request models
    "DetectionRequest",
    "TranslationRequest",
    "ProcessRequest",
    "ConfigUpdateRequest",
    "ProcessWithDepthRequest",
    # Response models
    "DetectionObject",
    "DetectionResponse",
    "TranslationResponse",
    "ProcessResponse",
    "HealthResponse",
]
