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
from PIL import Image

# Add object_path_detection to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), 'object_path_detection'))

from preprocessing.detector import ObjectDetector
from preprocessing.freepath_detector import FreepathDetector
from path_planning.occupancy_map import OccupancyMapBuilder

# Import translator and pipeline2 for full pipeline integration
from services.translator_service import TranslatorService
from translation.Pipeline2Integration import Pipeline2Integration

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
        
        # For full pipeline integration
        self.translator_service = None
        self.pipeline2 = None
        
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
        
        # Eager loading: Load all models at startup for immediate readiness
        print("🔄 Starting eager model loading...")
        self._load_models()
        
        # Eagerly initialize Translator and Pipeline2 for full pipeline
        if self.is_loaded:
            print("🔄 Eagerly loading Translator and Pipeline2...")
            self.translator_service = TranslatorService(eager_init=True)
            self.pipeline2 = Pipeline2Integration()
            print("✅ Translator and Pipeline2 loaded")
        
        print(f"✓ Initialization complete. is_loaded={self.is_loaded}")
        print("="*60 + "\n")
    
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
        Process a single frame through the navigation pipeline (PARALLEL OPTIMIZED)
        
        Args:
            rgb: RGB image as numpy array (H, W, 3)
            depth: Depth image as numpy array (H, W) or (H, W, 1)
            frame_id: Frame identifier
            debug_mode: If True, save intermediate outputs to disk
            
        Returns:
            dict: Processing results including detections and freepath centerline
            
        Notes:
            - PARALLEL: Object detection and freepath detection run simultaneously
            - ~30% faster than sequential (650ms → 500ms)
            - Optimized to work with RGB directly (no BGR conversions)
            - Debug images only saved when debug_mode=True
        """
        if not self.is_loaded:
            raise RuntimeError("Navigation detector models not loaded")
        
        import time
        import concurrent.futures
        start_time = time.time()
        
        result = {
            "frame_id": frame_id,
            "success": False,
            "detections": [],
            "freepath_coordinates": [],
            "freepath_circle": None,
            "processing_time_ms": 0,
            "stats": {}
        }
        
        try:
            parallel_start = time.time()
            
            # PARALLEL EXECUTION: Object detection and Freepath detection run simultaneously
            # These are independent operations that both use RGB+Depth
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                # Submit both tasks in parallel
                object_detection_future = executor.submit(
                    self._run_object_detection, rgb, depth, frame_id
                )
                freepath_detection_future = executor.submit(
                    self._run_freepath_detection, rgb, frame_id, debug_mode
                )
                
                # Wait for both to complete and get results
                detections, detection_time = object_detection_future.result()
                freepath_data, freepath_time = freepath_detection_future.result()
            
            parallel_time = (time.time() - parallel_start) * 1000
            
            # Unpack freepath results
            freepath_mask, freepath_coordinates, freepath_circle = freepath_data
            
            logger.debug(f"Frame {frame_id}: Parallel execution completed in {parallel_time:.2f}ms "
                        f"(detection: {detection_time:.2f}ms, freepath: {freepath_time:.2f}ms)")
            logger.debug(f"Frame {frame_id}: Found {len(detections)} detections")
            
            # Convert detections to standard format
            standardized_detections = []
            for det in detections:
                bbox = det.get("bbox", [0, 0, 0, 0])  # [x, y, w, h]
                bbox = [int(x) for x in bbox]
                cx = int(bbox[0] + bbox[2] // 2)
                cy = int(bbox[1] + bbox[3] // 2)
                
                # Use distance as confidence if available
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
            
            # Calculate total processing time
            processing_time = (time.time() - start_time) * 1000  # ms
            
            # Build result - simplified (no image outputs, only JSON data)
            result.update({
                "success": True,
                "detections": standardized_detections,
                "freepath_coordinates": [[int(x), int(y)] for x, y in freepath_coordinates] if freepath_coordinates else [],
                "freepath_circle": {
                    k: (
                        [int(x) for x in v] if isinstance(v, (list, tuple, np.ndarray))
                        else int(v) if isinstance(v, (np.integer, int))
                        else float(v)
                    )
                    for k, v in freepath_circle.items()
                } if freepath_circle else None,
                "processing_time_ms": float(processing_time),
                "stats": {
                    "num_detections": int(len(standardized_detections)),
                    "freepath_points": int(len(freepath_coordinates)),
                    "has_freepath_circle": bool(freepath_circle is not None),
                    "detection_time_ms": float(detection_time),
                    "freepath_time_ms": float(freepath_time),
                    "parallel_total_ms": float(parallel_time)
                }
            })
            
            logger.info(f"Frame {frame_id}: Processed in {processing_time:.2f}ms (detection: {detection_time:.2f}ms, freepath: {freepath_time:.2f}ms)")
            
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
    
    def _run_object_detection(
        self, 
        rgb: np.ndarray, 
        depth: np.ndarray, 
        frame_id: int
    ) -> Tuple[List[Dict[str, Any]], float]:
        """
        Worker method for parallel object detection execution
        
        Args:
            rgb: RGB image
            depth: Depth map
            frame_id: Frame identifier for logging
            
        Returns:
            Tuple of (detections list, processing time in ms)
        """
        import time
        start = time.time()
        
        detections = self.object_detector.detect_per_frame(rgb, depth, conf_thresh=0.5)
        
        elapsed_ms = (time.time() - start) * 1000
        logger.debug(f"Frame {frame_id}: Object detection completed in {elapsed_ms:.2f}ms")
        
        return detections, elapsed_ms
    
    def _run_freepath_detection(
        self, 
        rgb: np.ndarray, 
        frame_id: int,
        debug_mode: bool = False
    ) -> Tuple[Tuple[np.ndarray, List[Tuple[int, int]], Optional[Dict[str, Any]]], float]:
        """
        Worker method for parallel freepath detection execution
        
        Args:
            rgb: RGB image
            frame_id: Frame identifier
            debug_mode: Save debug outputs if True
            
        Returns:
            Tuple of ((freepath_mask, centerline, circle), processing time in ms)
        """
        import time
        start = time.time()
        
        # Save RGB to temp file for freepath detector
        temp_path = None
        try:
            if debug_mode:
                # Use debug output directory for persistent storage
                temp_path = os.path.join(self.debug_output_dir, f"frame_{frame_id:04d}_rgb.png")
            else:
                # Use temporary file that will be auto-deleted
                temp_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                temp_path = temp_file.name
                temp_file.close()
            
            # Save RGB (already in RGB format, convert to BGR for cv2.imwrite)
            bgr_for_save = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            cv2.imwrite(temp_path, bgr_for_save)
            
            # Run freepath detection (using correct method names)
            freepath_mask, _ = self.freepath_detector.infer_per_frame(temp_path, frame_id, save_debug=debug_mode)
            freepath_coordinates = self.freepath_detector.compute_centerline(freepath_mask, half_image=False, save_debug=debug_mode, frame_id=frame_id)
            
            # Calculate freepath circle for visualization and navigation
            freepath_circle = None
            if freepath_coordinates and len(freepath_coordinates) > 0:
                freepath_circle = self._calculate_freepath_circle(freepath_coordinates, rgb.shape)
            
            elapsed_ms = (time.time() - start) * 1000
            logger.debug(f"Frame {frame_id}: Freepath detection completed in {elapsed_ms:.2f}ms")
            
            return (freepath_mask, freepath_coordinates, freepath_circle), elapsed_ms
            
        finally:
            # Clean up temp file only if not in debug mode
            if temp_path and not debug_mode and os.path.exists(temp_path):
                os.remove(temp_path)
    
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
    
    def process_full_pipeline(
        self,
        rgb: np.ndarray,
        depth: np.ndarray,
        frame_id: int,
        stop_at: str = "phosphene",
        debug_mode: bool = False
    ) -> Dict[str, Any]:
        """
        Process frame through full modular pipeline with stop points (optimized)
        
        Pipeline stages:
        1. 'detector': Object detection + freepath detection -> RGB with bboxes
        2. 'translator': Translator simplification -> Simplified image with freepath circle
        3. 'pre_phosphene': Center crop to 128x128 -> Cropped image ready for phosphene
        4. 'phosphene': Final phosphene rendering -> Phosphene output
        
        Args:
            rgb: RGB image (H, W, 3)
            depth: Depth image (H, W)
            frame_id: Frame identifier
            stop_at: Stage to stop at ('detector', 'translator', 'pre_phosphene', 'phosphene')
            debug_mode: If True, save intermediate outputs (default False for speed)
            
        Returns:
            dict: Results with output_image (base64), stage info, detections, timing
            
        Notes:
            - Works in RGB color space throughout
            - Debug saves only when debug_mode=True
            - Uses optimized encode_ndarray_to_base64
        """
        import time
        import base64
        from core import encode_ndarray_to_base64
        
        if not self.is_loaded:
            raise RuntimeError("Navigation detector models not loaded")
        
        stage_times = {}
        result = {
            "success": False,
            "stage": stop_at,
            "output_image": None,
            "detections": [],
            "freepath_circle": None,
            "stats": {},
            "error": None
        }
        
        try:
            # Optional debug: Save input images only if debug_mode=True
            debug_input_prefix = None
            if debug_mode:
                from datetime import datetime
                timestamp = datetime.now().strftime("%H%M%S")
                debug_input_prefix = f"{self.debug_output_dir}/pipeline_{frame_id}_{timestamp}"
                cv2.imwrite(f"{debug_input_prefix}_01_input_rgb.jpg", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
                cv2.imwrite(f"{debug_input_prefix}_02_input_depth.jpg", depth)
                logger.info(f"💾 Saved INPUT images: {debug_input_prefix}_01_input_*.jpg")
            
            # STAGE 1: DETECTOR - Object detection + freepath detection
            stage_start = time.time()
            
            # Run navigation detector (pass debug_mode through)
            nav_result = self.process_frame(rgb, depth, frame_id, debug_mode=debug_mode)
            
            if not nav_result["success"]:
                result["error"] = "Navigation detection failed"
                return result
            
            detections = nav_result["detections"]
            freepath_circle = nav_result["freepath_circle"]
            
            stage_times["detection"] = (time.time() - stage_start) * 1000
            
            # Draw bboxes on RGB for detector stage output
            detector_output = self.draw_detections_on_rgb(rgb, detections)
            
            # Optional debug: Save detector output
            if debug_mode and debug_input_prefix:
                cv2.imwrite(f"{debug_input_prefix}_03_detector_output.jpg", cv2.cvtColor(detector_output, cv2.COLOR_RGB2BGR))
                logger.info(f"💾 Saved DETECTOR output")
            
            if stop_at == "detector":
                # Encode detector output (RGB with bboxes) - optimized single encode
                output_b64 = encode_ndarray_to_base64(detector_output, color_space='RGB')
                
                result.update({
                    "success": True,
                    "output_image": output_b64,
                    "detections": detections,
                    "freepath_circle": freepath_circle,
                    "stats": stage_times
                })
                return result
            
            # STAGE 2: TRANSLATOR - Simplify image to canonical shapes
            stage_start = time.time()
            
            # Translator already initialized at startup
            if self.translator_service is None:
                raise RuntimeError("TranslatorService not initialized")
            
            # Convert detections to translator format
            h, w = rgb.shape[:2]
            translator_objects = []
            for det in detections:
                bbox = det.get('bbox', [])
                if len(bbox) == 4:
                    translator_objects.append({
                        "class": det.get('class', 'unknown'),
                        "confidence": det.get('confidence', 0.8),
                        "bbox": bbox,
                        "centroid_px": det.get('centroid_px', [0, 0]),
                        "distance_m": det.get('distance_m')
                    })
            
            # Create detection bundle for translator
            detection_data = {
                "frame_id": f"nav_frame_{frame_id}",
                "file_path": "navigation_pipeline",
                "metadata": {
                    "image_width": w,
                    "image_height": h,
                    "camera_intrinsics": None
                },
                "free_path": None,
                "obstacles": translator_objects
            }
            
            # Get translator instance
            translator = self.translator_service.translator
            if translator is None:
                # Initialize if needed
                import json
                import tempfile
                temp_json = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
                json.dump(detection_data, temp_json)
                temp_json.close()
                
                translator = self.translator_service.translator = self.translator_service.translator.__class__(
                    temp_json.name,
                    self.translator_service.shapes_path,
                    self.translator_service.params_path,
                    None,
                    self.translator_service.output_dir
                )
            else:
                # Update existing translator with new data
                translator.bundle = detection_data
                translator.input_width = w
                translator.input_height = h
                translator.canvas_size = (w, h)
                translator.params['canvas_size'] = [h, w]
            
            # Get simplified canvas output (canonical shapes) - NOW RETURNS 128x128 WITH RETINOTOPIC MAPPING
            # No center crop needed - full field of view preserved through coordinate normalization
            simplified_canvas_128, _ = translator.run(f"nav_frame_{frame_id}.png", save_to_disk=True, target_canvas_size=(128, 128))
            
            # Convert to grayscale and binarize for consistency
            simplified_gray = cv2.cvtColor(simplified_canvas_128, cv2.COLOR_BGR2GRAY)
            _, simplified_binary_128 = cv2.threshold(simplified_gray, 127, 255, cv2.THRESH_BINARY)
            
            # Optional debug: Save translator output (already 128x128)
            if debug_mode and debug_input_prefix:
                cv2.imwrite(f"{debug_input_prefix}_04_translator_output_128x128.jpg", simplified_binary_128)
                logger.info(f"💾 Saved TRANSLATOR output (128x128 with retinotopic mapping)")
            
            stage_times["translator"] = (time.time() - stage_start) * 1000
            
            # Draw freepath circle on simplified image for visualization (needs scaling to 128x128)
            freepath_circle_scaled = None
            if freepath_circle and freepath_circle.get("center") and freepath_circle.get("radius"):
                # Scale freepath circle coordinates to 128x128
                orig_center = freepath_circle["center"]
                orig_radius = freepath_circle["radius"]
                scale_x = 128 / w
                scale_y = 128 / h
                freepath_circle_scaled = {
                    "center": (int(orig_center[0] * scale_x), int(orig_center[1] * scale_y)),
                    "radius": int(orig_radius * min(scale_x, scale_y))
                }
            
            simplified_with_circle = self.draw_freepath_circle(simplified_binary_128, freepath_circle_scaled)
            
            if stop_at == "translator":
                # Encode simplified canvas with circle - optimized
                output_b64 = encode_ndarray_to_base64(simplified_with_circle, color_space='BGR')
                
                result.update({
                    "success": True,
                    "output_image": output_b64,
                    "detections": detections,
                    "freepath_circle": freepath_circle,
                    "stats": stage_times
                })
                return result
            
            # STAGE 3: PRE_PHOSPHENE - No center crop needed anymore!
            # Translator now outputs 128x128 directly with retinotopic mapping
            stage_start = time.time()
            
            # Use the 128x128 output directly (no cropping)
            pre_phosphene_128 = simplified_with_circle
            
            # Optional debug: Save pre-phosphene image (now just pass-through)
            if debug_mode and debug_input_prefix:
                cv2.imwrite(f"{debug_input_prefix}_05_pre_phosphene_128x128.jpg", pre_phosphene_128)
                logger.info(f"💾 Saved PRE_PHOSPHENE image (no crop - retinotopic mapping)")
            
            stage_times["pre_phosphene"] = (time.time() - stage_start) * 1000
            
            if stop_at == "pre_phosphene":
                # Encode pre-phosphene output - optimized
                output_b64 = encode_ndarray_to_base64(pre_phosphene_128, color_space='BGR')
                
                result.update({
                    "success": True,
                    "output_image": output_b64,
                    "detections": detections,
                    "freepath_circle": freepath_circle,
                    "stats": stage_times
                })
                return result
            
            # STAGE 4: PHOSPHENE - Final rendering
            stage_start = time.time()
            
            # Pipeline2 already initialized at startup
            if self.pipeline2 is None:
                raise RuntimeError("Pipeline2Integration not initialized")
            
            # Normalize 128x128 image to 0-1 range for Pipeline2 (neural network expects normalized input)
            pre_phosphene_normalized = pre_phosphene_128.astype(np.float32) / 255.0
            
            # Run phosphene rendering
            phosphene_output = self.pipeline2.input2phosphenes(pre_phosphene_normalized)  # Returns (H, W) numpy array
            
            stage_times["phosphene"] = (time.time() - stage_start) * 1000
            
            # Convert phosphene output to image (scale to 0-255)
            phosphene_img = np.clip(phosphene_output * 255.0, 0, 255).astype(np.uint8)
            
            # Optional debug: Save phosphene output
            if debug_mode and debug_input_prefix:
                cv2.imwrite(f"{debug_input_prefix}_06_phosphene_output.png", phosphene_img)
                logger.info(f"💾 Saved PHOSPHENE output")
            
            # Encode phosphene output - optimized (grayscale, no color space needed)
            output_b64 = encode_ndarray_to_base64(phosphene_img, color_space='BGR')
            
            result.update({
                "success": True,
                "output_image": output_b64,
                "detections": detections,
                "freepath_circle": freepath_circle,
                "stats": stage_times
            })
            
        except Exception as e:
            logger.error(f"Error in full pipeline at stage {stop_at}: {e}", exc_info=True)
            result["error"] = str(e)
        
        return result
    
    def is_ready(self) -> bool:
        """Check if navigation detector service is ready"""
        return self.is_loaded
    
    def draw_detections_on_rgb(self, rgb: np.ndarray, detections: List[Dict[str, Any]]) -> np.ndarray:
        """
        Draw bounding boxes and labels on RGB image
        
        Args:
            rgb: RGB image as numpy array (H, W, 3)
            detections: List of detection dictionaries with bbox, class, confidence
            
        Returns:
            np.ndarray: RGB image with drawn detections
        """
        # Create a copy to avoid modifying original
        img_with_boxes = rgb.copy()
        
        # Draw each detection
        for det in detections:
            bbox = det.get('bbox', [])
            if len(bbox) == 4:
                x1, y1, w, h = bbox
                x2, y2 = x1 + w, y1 + h
                
                # Draw rectangle (green)
                cv2.rectangle(img_with_boxes, (x1, y1), (x2, y2), (0, 255, 0), 2)
                
                # Prepare label text
                class_name = det.get('class', 'unknown')
                confidence = det.get('confidence', 0.0)
                label = f"{class_name}: {confidence:.2f}"
                
                # Draw label background
                (text_width, text_height), baseline = cv2.getTextSize(
                    label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1
                )
                cv2.rectangle(
                    img_with_boxes,
                    (x1, y1 - text_height - baseline - 5),
                    (x1 + text_width, y1),
                    (0, 255, 0),
                    -1
                )
                
                # Draw label text (black on green background)
                cv2.putText(
                    img_with_boxes,
                    label,
                    (x1, y1 - baseline - 5),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 0, 0),
                    1
                )
        
        return img_with_boxes
    
    def draw_freepath_circle(self, simplified_img: np.ndarray, freepath_circle: Dict[str, Any]) -> np.ndarray:
        """
        Draw freepath circle on simplified translator image
        
        Args:
            simplified_img: Simplified image from translator (grayscale or BGR)
            freepath_circle: Dictionary with 'center' (x, y) and 'radius'
            
        Returns:
            np.ndarray: Image with drawn circle
        """
        # Create a copy
        img_with_circle = simplified_img.copy()
        
        # Convert to BGR if grayscale for colored circle
        if len(img_with_circle.shape) == 2:
            img_with_circle = cv2.cvtColor(img_with_circle, cv2.COLOR_GRAY2BGR)
        
        if freepath_circle:
            center = freepath_circle.get('center')
            radius = freepath_circle.get('radius')
            
            if center and radius:
                # Draw filled circle (blue)
                cv2.circle(img_with_circle, center, radius, (255, 0, 0), -1)
                # Draw center point (red)
                cv2.circle(img_with_circle, center, 5, (0, 0, 255), -1)
        
        return img_with_circle
    
    def center_crop_128x128(self, img: np.ndarray) -> np.ndarray:
        """
        Center crop image to 128x128
        
        Args:
            img: Input image (any size)
            
        Returns:
            np.ndarray: Center-cropped 128x128 image
        """
        h, w = img.shape[:2]
        
        # Calculate center crop coordinates
        center_x = w // 2
        center_y = h // 2
        crop_size = 128
        half_crop = crop_size // 2
        
        # Calculate crop boundaries
        x1 = max(0, center_x - half_crop)
        y1 = max(0, center_y - half_crop)
        x2 = min(w, center_x + half_crop)
        y2 = min(h, center_y + half_crop)
        
        # Crop
        cropped = img[y1:y2, x1:x2]
        
        # Resize to exactly 128x128 if needed (handles edge cases)
        if cropped.shape[0] != 128 or cropped.shape[1] != 128:
            cropped = cv2.resize(cropped, (128, 128), interpolation=cv2.INTER_LINEAR)
        
        return cropped
