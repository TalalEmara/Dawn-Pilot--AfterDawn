#!/usr/bin/env python3
"""
Phosphene Vision FastAPI Service - Main Application

Clean, organized entry point for the phosphene vision API.

Author: Dawn Pilot Team
Date: December 2025
"""

import logging
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import router, set_services
from services import DetectorService, TranslatorService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ============================================================================
# Initialize Services (Eager Loading at Startup)
# ============================================================================

logger.info("Initializing services at startup for fast API responses...")
detector_service = DetectorService()
translator_service = TranslatorService(eager_init=True)  # Explicitly enable eager init
logger.info("Services initialization complete.")

# Inject services into routes
set_services(detector_service, translator_service)


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

# Include API routes
app.include_router(router)


# ============================================================================
# Startup/Shutdown Events
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("=" * 60)
    logger.info("Phosphene Vision API Starting...")
    logger.info(f"Detector: {detector_service.detector_type} (ready: {detector_service.is_ready()})")
    logger.info(f"Translator: ready: {translator_service.is_ready()} (initialized: {translator_service.translator is not None})")
    logger.info(f"Pipeline2: initialized: {translator_service.pipeline2 is not None}")
    logger.info(f"Output directory: {translator_service.output_dir}")
    
    # Verify all components are ready
    if not detector_service.is_ready():
        logger.warning("⚠️  Detector not ready!")
    if not translator_service.is_ready():
        logger.warning("⚠️  Translator not ready!")
    if translator_service.translator is None:
        logger.warning("⚠️  Translator not pre-initialized!")
    if translator_service.pipeline2 is None:
        logger.warning("⚠️  Pipeline2 not initialized!")
    
    if detector_service.is_ready() and translator_service.is_ready() and translator_service.translator and translator_service.pipeline2:
        logger.info("✅ All components initialized and ready for fast API responses!")
    
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
