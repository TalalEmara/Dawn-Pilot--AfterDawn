"""
Detector Service

Singleton service for object detection using YOLO, Faster R-CNN, or mock detector.
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional
import numpy as np
from fastapi import HTTPException

from detection.realtime_detector import create_detector
from detection.mock_detector import create_mock_detector

logger = logging.getLogger(__name__)


class DetectorService:
    """Singleton service for object detection"""
    
    def __init__(self):
        self.detector = None
        self.detector_type = "mock"
        self.config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "detector_config.json")
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
                        model_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), model_path)
                    
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
                elif self.detector_type == "mock":
                    mock_config = config.get("mock", {})
                    self.detector = create_mock_detector(
                        brightness_threshold=mock_config.get("brightness_threshold", 200),
                        min_area=mock_config.get("min_area", 100),
                        max_detections=mock_config.get("max_detections", 10)
                    )
                    # Add is_loaded attribute for compatibility
                    self.detector.is_loaded = True
                else:
                    # Default to mock
                    self.detector = create_mock_detector()
                    self.detector.is_loaded = True
                    self.detector_type = "mock"
            else:
                logger.warning(f"Config file not found: {self.config_path}, using mock detector")
                self.detector = create_mock_detector()
                self.detector.is_loaded = True
                self.detector_type = "mock"
            
            logger.info(f"Detector loaded: {self.detector_type} (ready: {getattr(self.detector, 'is_loaded', True)})")
        
        except Exception as e:
            logger.error(f"Failed to load detector: {e}")
            self.detector = create_mock_detector()
            self.detector.is_loaded = True
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
