"""
API Routes

Minimal API endpoints for the Phosphene Vision API.
"""

from datetime import datetime
from typing import Dict
from fastapi import APIRouter

router = APIRouter()

# Global reference to navigation service (injected from main.py)
navigation_detector_service = None


def set_navigation_service(service):
    """Set navigation service instance (called from main.py)"""
    global navigation_detector_service
    navigation_detector_service = service


@router.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint"""
    return {
        "service": "Phosphene Vision API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


@router.get("/api/health")
async def health_check():
    """
    Health check endpoint
    
    Returns service status and readiness information
    """
    return {
        "status": "healthy" if (navigation_detector_service and navigation_detector_service.is_ready()) else "degraded",
        "navigation_detector_loaded": navigation_detector_service.is_ready() if navigation_detector_service else False,
        "timestamp": datetime.now().isoformat()
    }
