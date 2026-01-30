#!/usr/bin/env python3
"""
Phosphene Vision FastAPI Service - Main Application

Clean, organized entry point for the phosphene vision API.

PRODUCTION ENDPOINT: /ws/navigation-phosphene
Full modular pipeline: Object Detection → Freepath → Translator → Phosphene Rendering

Author: Dawn Pilot Team
Date: December 2025
"""

import logging
import uvicorn
from datetime import datetime
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
# from fastapi.staticfiles import StaticFiles
import os
import torch

# ============================================================================
# CRITICAL: Force NVIDIA GPU usage (must be BEFORE any model imports)
# ============================================================================
if torch.cuda.is_available():
    # Check which GPU is NVIDIA (usually cuda:1 on systems with Intel + NVIDIA)
    num_gpus = torch.cuda.device_count()
    nvidia_device = None
    
    for i in range(num_gpus):
        gpu_name = torch.cuda.get_device_name(i)
        print(f"GPU {i}: {gpu_name}")
        if "nvidia" in gpu_name.lower() or "geforce" in gpu_name.lower() or "rtx" in gpu_name.lower() or "gtx" in gpu_name.lower():
            nvidia_device = i
            break
    
    if nvidia_device is not None:
        print(f"\n⚡ FORCING PyTorch to use GPU {nvidia_device}: {torch.cuda.get_device_name(nvidia_device)}")
        torch.cuda.set_device(nvidia_device)  # Set default device
        os.environ['CUDA_VISIBLE_DEVICES'] = str(nvidia_device)  # Hide other GPUs
        print(f"✅ Default CUDA device set to: cuda:{torch.cuda.current_device()}\n")
    else:
        print("⚠️  No NVIDIA GPU detected, using default CUDA device")
else:
    print("⚠️  CUDA not available, running on CPU")

from api import router, set_navigation_service, handle_navigation_phosphene_websocket
from api.nav_phosphene_ws import navigation_detector_service as nav_detector_module
from services import NavigationDetectorService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ============================================================================
# Initialize Services (Eager Loading at Startup)
# ============================================================================

logger.info("Initializing NavigationDetectorService...")

# Initialize navigation detector service
navigation_detector_service = NavigationDetectorService(output_dir="api_output")
logger.info("Navigation detector initialized")

# Inject navigation detector service into routes and WebSocket handler
import api.routes as routes_module
routes_module.set_navigation_service(navigation_detector_service)

import api.nav_phosphene_ws as nav_ws
nav_ws.navigation_detector_service = navigation_detector_service


# ============================================================================
# Create FastAPI Application
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

# Include API routes (REST endpoints)
app.include_router(router)

# ============================================================================
# WebSocket Endpoints
# ============================================================================

# PRODUCTION ENDPOINT - Full navigation + phosphene pipeline
@app.websocket("/ws/navigation-phosphene")
async def navigation_phosphene_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for full navigation pipeline with phosphene rendering
    
    MAIN PRODUCTION ENDPOINT
    
    Protocol:
    - Client sends: {"type": "frame", "frame_id": str, "rgb": base64, "depth": base64, 
                     "stage": str, "debug": bool}
    - Server responds: {"type": "result", "data": {...}}
    
    Pipeline Stages:
    1. 'detector' - Object detection with bounding boxes
    2. 'translator' - Simplified canonical shapes
    3. 'pre_phosphene' - Center cropped 128x128
    4. 'phosphene' - Final phosphene rendering (full pipeline)
    
    Features:
    - Optimized RGB color space throughout
    - Minimal image transformations
    - Optional debug mode for saving intermediate outputs
    - Stage-by-stage processing for testing
    """
    await handle_navigation_phosphene_websocket(websocket)

# Legacy endpoints removed - see old_experiments/legacy_websockets.py if needed


# Serve main test page
@app.get("/test", response_class=HTMLResponse)
async def test_page():
    """Serve navigation phosphene test page"""
    test_file = os.path.join(os.path.dirname(__file__), "static", "navigation_phosphene_test.html")
    if os.path.exists(test_file):
        with open(test_file, 'r') as f:
            return f.read()
    return "<h1>Test page not found</h1><p>Create static/navigation_phosphene_test.html</p>"


# Health check endpoint (simplified)
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if navigation_detector_service.is_ready() else "degraded",
        "navigation_detector": navigation_detector_service.is_ready(),
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/configure_new")
async def configure_navigation_detector(request: dict):
    """Configure navigation detector and translator parameters
    
    Request body:
    {
        "conf_threshold": 0.2,  // YOLO detection confidence threshold (0.0-1.0)
        "t_min": 0.3,           // Translator minimum score threshold
        "k_min": 1,             // Translator minimum objects to select
        "k_max": 5              // Translator maximum objects to select
    }
    """
    t_min = request.get("t_min")
    k_min = request.get("k_min")
    k_max = request.get("k_max")
    conf_thresh = request.get("conf_threshold")
    
    # Update parameters if navigation detector is used
    if navigation_detector_service:
        if t_min is not None:
            navigation_detector_service.t_min = float(t_min)
            logger.info(f"Updated t_min to {navigation_detector_service.t_min}")
        if k_min is not None:
            navigation_detector_service.k_min = int(k_min)
            logger.info(f"Updated k_min to {navigation_detector_service.k_min}")
        if k_max is not None:
            navigation_detector_service.k_max = int(k_max)
            logger.info(f"Updated k_max to {navigation_detector_service.k_max}")
        if conf_thresh is not None:
            navigation_detector_service.conf_threshold = float(conf_thresh)
            logger.info(f"Updated conf_threshold to {navigation_detector_service.conf_threshold}")
        
        return {
            "status": "configured",
            "parameters": {
                "conf_threshold": navigation_detector_service.conf_threshold,
                "t_min": navigation_detector_service.t_min,
                "k_min": navigation_detector_service.k_min,
                "k_max": navigation_detector_service.k_max
            }
        }
    else:
        return {"status": "error", "message": "Navigation detector service not initialized"}


# ============================================================================
# Startup/Shutdown Events
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("=" * 60)
    logger.info("Phosphene Vision API Starting...")
    logger.info(f"Navigation Detector: ready: {navigation_detector_service.is_ready()}")
    
    if not navigation_detector_service.is_ready():
        logger.warning("⚠️  Navigation Detector not ready!")
    else:
        logger.info("✅ NavigationDetectorService ready for API requests!")
    
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
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
