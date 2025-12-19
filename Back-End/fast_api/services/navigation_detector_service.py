"""
Navigation Detector Service

Service for object detection and freepath detection in the navigation pipeline.
Integrates ObjectDetector and FreepathDetector for real-time navigation.
"""

import os
import sys
import logging
import tempfile
import cv2
import numpy as np
from typing import List, Dict, Any, Optional, Tuple

# Add object_path_detection to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), 'object_path_detection'))

from preprocessing.detector import ObjectDetector
from preprocessing.freepath_detector import FreepathDetector
from path_planning.occupancy_map import OccupancyMapBuilder

logger = logging.getLogger(__name__)


class NavigationDetectorService:
    """Service for navigation pipeline with object and freepath detection"""
    
    def __init__(self, output_dir: str = "api_output"):
        """
        Initialize navigation detector service
        
        Args:
            output_dir: Directory for saving debug outputs (relative to fast_api root)
        """
        print("\n" + "="*60)
        print("🔧 INITIALIZING NavigationDetectorService")
        print("="*60)
        
        self.object_detector = None
        self.freepath_detector = None
        self.is_loaded = False
        
        # Setup output directory (relative path)
        self.base_dir = os.path.dirname(os.path.dirname(__file__))
        print(f"📁 Base directory: {self.base_dir}")
        self.output_dir = os.path.join(self.base_dir, output_dir)
        self.debug_output_dir = os.path.join(self.output_dir, "debug_output")
        os.makedirs(self.debug_output_dir, exist_ok=True)
        
        # Load configuration from navigation_config.json
        config_path = os.path.join(self.base_dir, "config", "navigation_config.json")
        print(f"📋 Loading config from: {config_path}")
        self._load_config(config_path)
        
        # Load models at initialization (startup)
        print("🔄 Starting model loading...")
        self._load_models()
        print(f"✓ Initialization complete. is_loaded={self.is_loaded}")
        print("="*60 + "\n")
        self._load_models()
    
    def _load_config(self, config_path: str):
        """Load model paths from configuration file"""
        import json
        
        # Default values (fallback)
        self.model_type = "faster_rcnn"
        self.model_path = os.path.join(self.base_dir, "object_path_detection", "models", "best_yolo.pt")
        self.class_map_path = os.path.join(self.base_dir, "object_path_detection", "yolo_class_mapping.json")
        self.freepath_model_path = os.path.join(self.base_dir, "object_path_detection", "models", "final_deeplabv3_footpath.pth")
        self.debug_mode = False
        
        # Load from config if exists
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    config = json.load(f)
                    nav_config = config.get("navigation_detector", {})
                    
                    # Get model type and paths from config
                    self.model_type = nav_config.get("model_type", "faster_rcnn")
                    
                    model_path = nav_config.get("model_path")
                    if model_path:
                        self.model_path = os.path.join(self.base_dir, model_path)
                    
                    class_map_path = nav_config.get("class_map_path")
                    if class_map_path:
                        self.class_map_path = os.path.join(self.base_dir, class_map_path)
                    
                    freepath_path = nav_config.get("freepath_model_path")
                    if freepath_path:
                        self.freepath_model_path = os.path.join(self.base_dir, freepath_path)
                    
                    self.debug_mode = nav_config.get("debug_mode", False)
                    
                    logger.info(f"Loaded navigation config from: {config_path}")
                    logger.info(f"YOLO model path: {self.yolo_model_path}")
                    logger.info(f"Freepath model path: {self.freepath_model_path}")
                    logger.info(f"Debug mode: {self.debug_mode}")
            except Exception as e:
                logger.warning(f"Failed to load config from {config_path}: {e}")
                logger.info("Using default model paths")
        else:
            logger.warning(f"Config file not found: {config_path}")
            logger.info("Using default model paths")
    
    def _load_models(self):
        """Load ObjectDetector and FreepathDetector models"""
        try:
            print("=" * 60)
            print("📦 Loading navigation detection models...")
            print(f"📁 Base directory: {self.base_dir}")
            print(f"🤖 Model type: {self.model_type}")
            print(f"🎯 Object detection model: {self.model_path}")
            print(f"🗺️  Class map: {self.class_map_path}")
            print(f"🛣️  Freepath model: {self.freepath_model_path}")
            print("="*60)
            
            # Check if model files exist
            if not os.path.exists(self.model_path):
                print(f"❌ Object detection model NOT FOUND at: {self.model_path}")
                print(f"   Absolute path: {os.path.abspath(self.model_path)}")
                print("   Please download the model and place it at the specified path")
                print("   Or update the path in config/navigation_config.json")
                self.is_loaded = False
                return
            else:
                print(f"✅ Object detection model FOUND at: {self.model_path}")
            
            if not os.path.exists(self.freepath_model_path):
                print(f"❌ Freepath model NOT FOUND at: {self.freepath_model_path}")
                print(f"   Absolute path: {os.path.abspath(self.freepath_model_path)}")
                print("   Please download the model and place it at the specified path")
                print("   Or update the path in config/navigation_config.json")
                self.is_loaded = False
                return
            else:
                print(f"✅ Freepath model FOUND at: {self.freepath_model_path}")
            
            # Load ObjectDetector (Faster R-CNN or YOLO)
            print(f"\n🔄 Initializing ObjectDetector ({self.model_type.upper()})...")
            self.object_detector = ObjectDetector(
                model_name=self.model_type,
                model_path=self.model_path,
                class_map_path=self.class_map_path
            )
            print(f"✅ ObjectDetector ({self.model_type.upper()}) loaded successfully")
            
            # Load FreepathDetector
            print("🔄 Initializing FreepathDetector (DeepLabV3)...")
            self.freepath_detector = FreepathDetector(
                model_path=self.freepath_model_path,
                output_dir=self.output_dir
            )
            print("✅ FreepathDetector (DeepLabV3) loaded successfully")
            
            # Log device information
            import torch
            device_info = "CUDA" if torch.cuda.is_available() else "CPU"
            if torch.cuda.is_available():
                device_info += f" ({torch.cuda.get_device_name(0)})"
            print(f"\n🚀 Navigation detector service ready on {device_info}!")
            print("=" * 60)
            
            self.is_loaded = True
            logger.info("Navigation detector models loaded successfully")
            
        except Exception as e:
            print(f"\n❌ FAILED to load navigation models!")
            print(f"   Error type: {type(e).__name__}")
            print(f"   Error message: {str(e)}")
            print(f"   Full traceback:")
            import traceback
            traceback.print_exc()
            print("=" * 60)
            logger.error(f"❌ Failed to load navigation models: {str(e)}", exc_info=True)
            logger.info("Service will not be available until models are properly configured")
            self.is_loaded = False
    
    def detect(self, frame: np.ndarray, depth: Optional[np.ndarray] = None) -> List[Dict[str, Any]]:
        """
        Detect objects in frame (compatible with standard detector interface)
        
        Args:
            frame: RGB frame
            depth: Optional depth map
            
        Returns:
            List of detections in standard format
        """
        if not self.is_loaded:
            logger.warning("Navigation detector not loaded, returning empty detections")
            return []
        
        # If no depth provided, create a dummy depth map
        if depth is None:
            depth = np.zeros((frame.shape[0], frame.shape[1]), dtype=np.uint16)
        
        # Run object detection only
        detections = self.object_detector.detect_per_frame(frame, depth, conf_thresh=0.5)
        
        # Convert to standard format with proper type conversion
        standardized_detections = []
        for det in detections:
            bbox = det.get("bbox", [0, 0, 0, 0])
            # Convert numpy types to Python native types
            bbox = [int(x) for x in bbox]
            cx = int(bbox[0] + bbox[2] // 2)
            cy = int(bbox[1] + bbox[3] // 2)
            
            confidence = 0.8
            if det.get("distance_m"):
                dist = float(det.get("distance_m"))
                confidence = max(0.5, min(0.95, 1.0 - (dist - 2) / 8 * 0.45))
            
            standardized_detections.append({
                "class": str(det.get("class", "unknown")),
                "confidence": float(confidence),
                "bbox": bbox,
                "centroid_px": [int(cx), int(cy)],
                "distance_m": float(det.get("distance_m")) if det.get("distance_m") else None
            })
        
        return standardized_detections
    
    def process_frame(
        self, 
        rgb: np.ndarray, 
        depth: np.ndarray, 
        frame_id: int,
        debug_mode: bool = False
    ) -> Dict[str, Any]:
        """
        Process a single frame through the navigation pipeline
        
        Args:
            rgb: RGB image as numpy array (H, W, 3)
            depth: Depth image as numpy array (H, W) or (H, W, 1)
            frame_id: Frame identifier
            debug_mode: If True, save frames to debug output directory
            
        Returns:
            dict: Processing results including detections, freepath mask, occupancy map, etc.
        """
        if not self.is_loaded:
            raise RuntimeError("Navigation detector models not loaded")
        
        import time
        start_time = time.time()
        
        result = {
            "frame_id": frame_id,
            "success": False,
            "detections": [],
            "freepath_mask": None,
            "freepath_coordinates": [],
            "freepath_circle": None,
            "occupancy_map": None,
            "processing_time_ms": 0,
            "stats": {}
        }
        
        try:
            # 1. Object Detection
            detections = self.object_detector.detect_per_frame(rgb, depth, conf_thresh=0.5)
            logger.debug(f"Frame {frame_id}: Found {len(detections)} detections")
            
            # 2. Freepath Detection (requires saving RGB to temp file)
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as temp_file:
                temp_path = temp_file.name
                cv2.imwrite(temp_path, cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
            
            try:
                freepath_mask, freepath_mask_path = self.freepath_detector.infer_per_frame(
                    temp_path, 
                    frame_id=frame_id,
                    save_debug=debug_mode
                )
                
                # Compute centerline coordinates
                freepath_coordinates = self.freepath_detector.compute_centerline(
                    freepath_mask,  # Pass mask array instead of path
                    half_image=True,
                    save_debug=debug_mode,
                    frame_id=frame_id
                )
                
                # Calculate freepath circle center (bottom half of centerline)
                freepath_circle = self._calculate_freepath_circle(freepath_coordinates, rgb.shape)
                
            finally:
                # Clean up temp file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            
            # 3. Build Occupancy Map
            occupancy_builder = OccupancyMapBuilder(
                img_shape=rgb.shape,
                detections=detections
            )
            occupancy_map, _ = occupancy_builder.build_map()
            
            # 4. Convert detections to standard format (matching mock detector)
            standardized_detections = []
            for det in detections:
                # Calculate centroid from bbox
                bbox = det.get("bbox", [0, 0, 0, 0])  # [x, y, w, h]
                # Convert all to Python int
                bbox = [int(x) for x in bbox]
                cx = int(bbox[0] + bbox[2] // 2)
                cy = int(bbox[1] + bbox[3] // 2)
                
                # Use distance as confidence if available, otherwise use high confidence
                confidence = 0.8
                if det.get("distance_m"):
                    # Convert distance to confidence (closer = higher confidence)
                    # Normalize distance (2m-10m range) to confidence (0.5-0.95)
                    dist = float(det.get("distance_m"))
                    confidence = max(0.5, min(0.95, 1.0 - (dist - 2) / 8 * 0.45))
                
                standardized_detections.append({
                    "class": str(det.get("class", "unknown")),
                    "confidence": float(confidence),
                    "bbox": bbox,
                    "centroid_px": [int(cx), int(cy)],
                    "distance_m": float(det.get("distance_m")) if det.get("distance_m") else None
                })
            
            # 5. Debug mode: save frames
            if debug_mode:
                self._save_debug_frames(rgb, depth, freepath_mask, occupancy_map, frame_id)
            
            # Calculate processing time
            processing_time = (time.time() - start_time) * 1000  # ms
            
            # Build result - ensure all values are JSON serializable
            result.update({
                "success": True,
                "detections": standardized_detections,
                "freepath_mask": freepath_mask,
                "freepath_coordinates": [[int(x), int(y)] for x, y in freepath_coordinates] if freepath_coordinates else [],
                "freepath_circle": {
                    k: (
                        [int(x) for x in v] if isinstance(v, (list, tuple, np.ndarray))
                        else int(v) if isinstance(v, (np.integer, int))
                        else float(v)
                    )
                    for k, v in freepath_circle.items()
                } if freepath_circle else None,
                "occupancy_map": occupancy_map,
                "processing_time_ms": float(processing_time),
                "stats": {
                    "num_detections": int(len(standardized_detections)),
                    "freepath_points": int(len(freepath_coordinates)),
                    "has_freepath_circle": bool(freepath_circle is not None)
                }
            })
            
            logger.debug(f"Frame {frame_id}: Processed in {processing_time:.2f}ms")
            
        except Exception as e:
            logger.error(f"❌ Error processing frame {frame_id}: {e}", exc_info=True)
            print(f"\n❌ EXCEPTION in process_frame:")
            print(f"   Error type: {type(e).__name__}")
            print(f"   Error message: {str(e)}")
            import traceback
            traceback.print_exc()
            result["error"] = str(e)
            result["success"] = False
        
        return result
    
    def _calculate_freepath_circle(
        self, 
        centerline: List[Tuple[int, int]], 
        img_shape: Tuple[int, int, int]
    ) -> Optional[Dict[str, Any]]:
        """
        Calculate a circle in the bottom half of the freepath centerline
        
        Args:
            centerline: List of (x, y) coordinates representing the freepath centerline
            img_shape: Shape of the image (H, W, C)
            
        Returns:
            dict: Circle parameters {"center": (x, y), "radius": r} or None
        """
        if len(centerline) < 2:
            return None
        
        height = img_shape[0]
        bottom_half_y = height // 2
        
        # Filter points in bottom half of image
        bottom_points = [(x, y) for x, y in centerline if y >= bottom_half_y]
        
        if len(bottom_points) < 2:
            return None
        
        # Calculate center as the mean of bottom half points
        xs = [x for x, y in bottom_points]
        ys = [y for x, y in bottom_points]
        center_x = int(np.mean(xs))
        center_y = int(np.mean(ys))
        
        # Calculate radius as std deviation of distances from center
        distances = [np.sqrt((x - center_x)**2 + (y - center_y)**2) for x, y in bottom_points]
        radius = int(np.mean(distances))
        
        return {
            "center": (center_x, center_y),
            "radius": radius
        }
    
    def _save_debug_frames(
        self,
        rgb: np.ndarray,
        depth: np.ndarray,
        freepath_mask: np.ndarray,
        occupancy_map: np.ndarray,
        frame_id: int
    ):
        """Save debug frames to output directory"""
        from datetime import datetime
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Save RGB
        rgb_path = os.path.join(self.debug_output_dir, f"{timestamp}_frame{frame_id:04d}_rgb.png")
        cv2.imwrite(rgb_path, cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
        
        # Save Depth
        depth_path = os.path.join(self.debug_output_dir, f"{timestamp}_frame{frame_id:04d}_depth.png")
        cv2.imwrite(depth_path, depth)
        
        # Save Freepath Mask
        freepath_path = os.path.join(self.debug_output_dir, f"{timestamp}_frame{frame_id:04d}_freepath.png")
        freepath_visual = (freepath_mask > 0).astype(np.uint8) * 255
        cv2.imwrite(freepath_path, freepath_visual)
        
        # Save Occupancy Map
        if occupancy_map is not None:
            occupancy_path = os.path.join(self.debug_output_dir, f"{timestamp}_frame{frame_id:04d}_occupancy.png")
            # Convert occupancy map to visual format (-1, 0, 1) -> (128, 255, 0)
            occupancy_visual = np.zeros_like(occupancy_map, dtype=np.uint8)
            occupancy_visual[occupancy_map == -1] = 128  # Unknown
            occupancy_visual[occupancy_map == 0] = 255   # Free
            occupancy_visual[occupancy_map == 1] = 0     # Occupied
            cv2.imwrite(occupancy_path, occupancy_visual)
        
        logger.debug(f"Debug frames saved for frame {frame_id}")
    
    def is_ready(self) -> bool:
        """Check if navigation detector service is ready"""
        return self.is_loaded
