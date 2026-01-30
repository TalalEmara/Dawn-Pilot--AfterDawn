"""
Navigation Detector Service

Service for object detection and freepath detection in the navigation pipeline.
Integrates ObjectDetector and FreepathDetector for real-time navigation.
"""

import os
import sys
import logging
import tempfile
import threading
import cv2
import numpy as np
import torch
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
            
            # GPU warmup to reduce first-inference latency
            print("🔄 Warming up GPU models...")
            self._warmup_models()
            print("✅ GPU warmup complete")
            
            # Apply GPU memory optimizations if enabled
            if self.gpu_memory_optimization and torch.cuda.is_available():
                print("🔄 Applying GPU memory optimizations...")
                torch.cuda.empty_cache()
                print("✅ GPU memory optimized")
        
        # Initialize reusable ThreadPool executor for parallel processing
        # Avoids per-frame thread creation overhead (significant at 30 FPS)
        import concurrent.futures
        self.executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=2, 
            thread_name_prefix="detection"
        ) if self.parallel_processing else None
        
        # Thread lock for translator to prevent race conditions across parallel frames
        # Critical: Without this, Frame N+1 can overwrite Frame N's translator state
        self.translator_lock = threading.Lock()
        
        print(f"✓ Initialization complete. is_loaded={self.is_loaded}")
        print("="*60 + "\n")
    
    def _load_config(self, config_path: str):
        """Load model paths from configuration file"""
        import json
        
        # Default values (fallback)
        self.model_type = "yolo"
        self.model_path = os.path.join(self.base_dir, "object_path_detection", "models", "yolo_our_data_50.pt")
        self.class_map_path = os.path.join(self.base_dir, "object_path_detection", "yolo_class_mapping.json")
        self.freepath_model_path = os.path.join(self.base_dir, "object_path_detection", "models", "final_deeplabv3_footpath.pth")
        self.debug_mode = False
        
        # Configurable parameters (can be updated via API)
        self.conf_threshold = 0.5  # YOLO detection confidence threshold
        self.t_min = 0.3  # Translator minimum score threshold
        self.k_min = 1    # Translator minimum objects to select
        self.k_max = 5    # Translator maximum objects to select
        
        # Default cropping config
        self.cropping_config = {
            "type": "fov_based",
            "fov_degrees": 30,
            "camera_intrinsics": {
                "fx": 696.0,
                "fy": 649.5,
                "cx": 640.0,
                "cy": 360.0,
                "width": 1280,
                "height": 720,
                "horizontal_fov": 85.2,
                "vertical_fov": 58.0
            },
            "freepath_fallback": "clamp_with_warning",
            "freepath_ball": {
                "radius": 50,
                "margin_buffer": 10,
                "bottom_half_threshold": 0.5
            }
        }
        
        # Cached camera intrinsics (scaled for current image resolution)
        # Only recalculated when image dimensions change - eliminates per-frame overhead
        self._cached_image_dims = None  # (width, height)
        self._cached_intrinsics = None  # (fx, fy, cx, cy)
        self._cached_image_dims = None  # (width, height)
        self._cached_intrinsics = None  # (fx, fy, cx, cy)
        
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
                    
                    self.debug_mode = nav_config.get("debug_mode", True)
                    
                    # Performance optimization settings
                    self.parallel_processing = nav_config.get("parallel_processing", True)
                    self.gpu_memory_optimization = nav_config.get("gpu_memory_optimization", True)
                    
                    # Load cropping config
                    cropping_config = config.get("cropping", {})
                    if cropping_config:
                        self.cropping_config.update(cropping_config)
                    
                    logger.info(f"Loaded navigation config from: {config_path}")
                    logger.info(f"Model path: {self.model_path}")
                    logger.info(f"Freepath model path: {self.freepath_model_path}")
                    logger.info(f"Debug mode: {self.debug_mode}")
                    logger.info(f"Cropping config: {self.cropping_config}")
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
    
    def _warmup_models(self):
        """Warm up GPU models to reduce first-inference latency variability"""
        try:
            print("🔥 Warming up models...")
            
            # Warmup phosphene and edge encoders if available
            if torch.cuda.is_available() and self.pipeline2:
                print("  Warming up phosphene encoder (373x349)...")
                dummy_phosphene_input = np.random.rand(349, 373).astype(np.float32)
                _ = self.pipeline2.input2phosphenes(dummy_phosphene_input, use_edge_encoder=False)
                print("✓ Phosphene encoder warmed up")
                
                print("  Warming up edge encoder (128x128)...")
                dummy_edge_input = np.random.rand(128, 128).astype(np.float32)
                _ = self.pipeline2.input2phosphenes(dummy_edge_input, use_edge_encoder=True)
                print("✓ Edge encoder warmed up")
            
            # Create dummy input for detector warmup
            dummy_rgb = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
            dummy_depth = np.random.rand(480, 640).astype(np.float32)
            
            # Warm up object detector
            print("  Warming up object detector...")
            self.object_detector.detect_per_frame(dummy_rgb, dummy_depth, conf_thresh=self.conf_threshold)
            print("✓ Object detector warmed up")
            
            # Warm up freepath detector
            print("  Warming up freepath detector...")
            self._infer_freepath_from_array(dummy_rgb, 0, save_debug=False)
            print("✓ Freepath detector warmed up")
            
            # Force GPU synchronization
            if torch.cuda.is_available():
                torch.cuda.synchronize()
            
            print("✓ All models warmed up successfully")
                
        except Exception as e:
            print(f"  Warning: Model warmup failed: {e}")
    
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
        detections = self.object_detector.detect_per_frame(frame, depth, conf_thresh=self.conf_threshold)
        
        # Convert to standard format with proper type conversion
        standardized_detections = []
        for det in detections:
            bbox = det.get("bbox", [0, 0, 0, 0])
            # Convert numpy types to Python native types
            bbox = [int(x) for x in bbox]
            cx = int(bbox[0] + bbox[2] // 2)
            cy = int(bbox[1] + bbox[3] // 2)
            
            confidence = det.get("detection_score", 0.001)
            # confidence = 0.8
            # if det.get("distance_m"):
            #     dist = float(det.get("distance_m"))
            #     confidence = max(0.5, min(0.95, 1.0 - (dist - 2) / 8 * 0.45))
            
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
            # Using reusable ThreadPool executor (initialized in __init__) to avoid per-frame overhead
            if self.parallel_processing and self.executor:
                # Submit both tasks in parallel using reusable executor
                object_detection_future = self.executor.submit(
                    self._run_object_detection, rgb, depth, frame_id
                )
                freepath_detection_future = self.executor.submit(
                    self._run_freepath_detection, rgb, frame_id, debug_mode
                )
                
                # Wait for both to complete and get results
                detections, detection_time = object_detection_future.result()
                freepath_data, freepath_time = freepath_detection_future.result()
                
                parallel_time = (time.time() - parallel_start) * 1000
            else:
                # Sequential processing for debugging or constrained environments
                detections, detection_time = self._run_object_detection(rgb, depth, frame_id)
                freepath_data, freepath_time = self._run_freepath_detection(rgb, frame_id, debug_mode)
                parallel_time = detection_time + freepath_time
            
            # Unpack freepath results
            freepath_mask, freepath_coordinates, freepath_circle = freepath_data
            
            logger.debug(f"Frame {frame_id}: Parallel execution completed in {parallel_time:.2f}ms "
                        f"(detection: {detection_time:.2f}ms, freepath: {freepath_time:.2f}ms)")
            logger.debug(f"Frame {frame_id}: Found {len(detections)} detections")
            
            # Add timing stats to result for performance monitoring
            result["timing"] = {
                "parallel_total_ms": parallel_time,
                "object_detection_ms": detection_time,
                "freepath_detection_ms": freepath_time
            }
            
            # Convert detections to standard format
            standardized_detections = []
            for det in detections:
                bbox = det.get("bbox", [0, 0, 0, 0])  # [x, y, w, h]
                bbox = [int(x) for x in bbox]
                cx = int(bbox[0] + bbox[2] // 2)
                cy = int(bbox[1] + bbox[3] // 2)
                real_confidence = det.get("detection_score", 0.001)
                
                # Use distance as confidence if available
                confidence = 0.8
                if det.get("distance_m"):
                    dist = float(det.get("distance_m"))
                    confidence = max(0.5, min(0.95, 1.0 - (dist - 2) / 8 * 0.45))
                
                standardized_detections.append({
                    "class": str(det.get("class", "unknown")),
                    "confidence": float(real_confidence),
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
            
            if debug_mode:
                logger.info(f"Frame {frame_id}: Processed in {processing_time:.2f}ms (detection: {detection_time:.2f}ms, freepath: {freepath_time:.2f}ms)")
            
        except Exception as e:
            logger.error(f"❌ Error processing frame {frame_id}: {e}", exc_info=True)
            result["error"] = str(e)
            result["success"] = False
        
        # Periodic GPU memory cleanup and watchdog
        if torch.cuda.is_available():
            if not hasattr(self, '_frame_count'):
                self._frame_count = 0
            self._frame_count += 1
            
            # GPU Watchdog: Force sync every 50 frames to prevent Windows TDR timeout
            if self._frame_count % 50 == 0:
                torch.cuda.synchronize()
                logger.debug(f"GPU watchdog sync at frame {frame_id}")
            
            # Memory cleanup every 100 frames if optimization enabled
            if self.gpu_memory_optimization and self._frame_count % 100 == 0:
                torch.cuda.empty_cache()
                allocated_gb = torch.cuda.memory_allocated() / (1024**3)
                reserved_gb = torch.cuda.memory_reserved() / (1024**3)
                logger.debug(f"GPU cache cleared at frame {frame_id} | Allocated: {allocated_gb:.3f}GB, Reserved: {reserved_gb:.3f}GB")
        
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
        
        detections = self.object_detector.detect_per_frame(rgb, depth, conf_thresh=self.conf_threshold)
        
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
        
        try:
            # Use optimized direct array processing (no file I/O)
            freepath_mask, _ = self._infer_freepath_from_array(rgb, frame_id, save_debug=debug_mode)
            freepath_coordinates = self.freepath_detector.compute_centerline(freepath_mask, half_image=False, save_debug=debug_mode, frame_id=frame_id)
            
            # Calculate freepath circle for visualization and navigation
            freepath_circle = None
            if freepath_coordinates and len(freepath_coordinates) > 0:
                freepath_circle = self._calculate_freepath_circle(freepath_coordinates, rgb.shape)
            
            elapsed_ms = (time.time() - start) * 1000
            logger.debug(f"Frame {frame_id}: Freepath detection completed in {elapsed_ms:.2f}ms")
            
            return (freepath_mask, freepath_coordinates, freepath_circle), elapsed_ms
            
        except Exception as e:
            logger.error(f"Optimized freepath detection failed for frame {frame_id}: {e}")
            # Fallback to file-based method
            temp_path = None
            try:
                if debug_mode:
                    temp_path = os.path.join(self.debug_output_dir, f"frame_{frame_id:04d}_rgb.png")
                else:
                    temp_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                    temp_path = temp_file.name
                    temp_file.close()
                
                bgr_for_save = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
                cv2.imwrite(temp_path, bgr_for_save)
                
                freepath_mask, _ = self.freepath_detector.infer_per_frame(temp_path, frame_id, save_debug=debug_mode)
                freepath_coordinates = self.freepath_detector.compute_centerline(freepath_mask, half_image=False, save_debug=debug_mode, frame_id=frame_id)
                freepath_circle = self._calculate_freepath_circle(freepath_coordinates, rgb.shape) if freepath_coordinates else None
                
                elapsed_ms = (time.time() - start) * 1000
                return (freepath_mask, freepath_coordinates, freepath_circle), elapsed_ms
                
            finally:
                if temp_path and not debug_mode and os.path.exists(temp_path):
                    os.remove(temp_path)
    
    def _infer_freepath_from_array(self, rgb_array: np.ndarray, frame_id: int, save_debug: bool = True):
        """
        Optimized freepath inference directly from numpy array (no file I/O)
        
        Args:
            rgb_array: RGB image as numpy array
            frame_id: Frame identifier
            save_debug: Whether to save debug outputs
            
        Returns:
            Tuple of (mask, mask_path)
        """
        from PIL import Image
        import torchvision.transforms as transforms
        
        # Convert numpy array to PIL Image
        rgb_pil = Image.fromarray(rgb_array)
        original_size = rgb_pil.size
        
        # Apply inference transforms
        infer_tf = transforms.Compose([
            transforms.Resize((256, 256), interpolation=Image.BILINEAR),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        img_t = infer_tf(rgb_pil).unsqueeze(0).to(self.freepath_detector.device, non_blocking=True)
        
        with torch.no_grad():
            pred = self.freepath_detector.model(img_t)['out']
            mask = torch.argmax(pred[0], dim=0).detach().cpu().numpy()
        
        # Resize mask back to original size
        mask_resized = cv2.resize(mask.astype(np.uint8), original_size, interpolation=cv2.INTER_NEAREST)
        binary_mask = (mask_resized > 0).astype(np.uint8) * 255
        
        # Only save mask if debug mode is enabled
        freepath_mask_path = None
        if save_debug:
            freepath_mask_path = os.path.join(self.freepath_detector.mask_output_dir, f"{frame_id:04d}.png")
            cv2.imwrite(freepath_mask_path, binary_mask)
        
        return mask_resized, freepath_mask_path
    
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
    
    def _calculate_freepath_ball_position(
        self, 
        freepath_coordinates: List[List[int]], 
        original_size: Tuple[int, int],
        cropping_config: Dict[str, Any],
        frame_id: int,
        debug_mode: bool = False
    ) -> Optional[Tuple[int, int]]:
        """
        Calculate freepath ball position using smart selection algorithm
        
        Smart selection logic:
        1. Collect all freepath points in the cropped/FoV region
        2. Filter to bottom half only (configurable threshold)
        3. If no points in bottom half, return None (no freepath in front)
        4. Separate points with/without margin:
           - WITH margin: Select LOWEST (closest, safest)
           - WITHOUT margin (edge): Select UPPERMOST (avoid bottom clipping)
        5. If multiple at same Y, prefer center-most
        6. Return position as-is (never modify freepath point position)
        
        Args:
            freepath_coordinates: List of [x, y] freepath centerline points
            original_size: (height, width) of original image
            cropping_config: Cropping configuration with FoV and camera intrinsics
            frame_id: Frame ID for logging
            debug_mode: Enable debug logging
            
        Returns:
            (x, y) position for freepath ball in cropped coordinates, or None
        """
        if not freepath_coordinates or len(freepath_coordinates) == 0:
            return None
            
        import math
        
        crop_type = cropping_config.get("type", "fov_based")
        crop_size = cropping_config.get("size", [128, 128])
        crop_w, crop_h = crop_size
        
        # Get freepath ball configuration
        ball_config = cropping_config.get("freepath_ball", {})
        BALL_RADIUS = ball_config.get("radius", 50)
        MARGIN_BUFFER = ball_config.get("margin_buffer", 5)
        BOTTOM_HALF_THRESHOLD = ball_config.get("bottom_half_threshold", 0.5)
        MIN_MARGIN = BALL_RADIUS + MARGIN_BUFFER
        
        # print(f"\n🎯 BALL CONFIG - Radius: {BALL_RADIUS}, Margin: {MARGIN_BUFFER}, Threshold: {BOTTOM_HALF_THRESHOLD}")  # Reduced logging
        if debug_mode:
            logger.info(f"🎯 Frame {frame_id}: Ball config - radius={BALL_RADIUS}, margin={MARGIN_BUFFER}, threshold={BOTTOM_HALF_THRESHOLD}")
        
        if crop_type != "fov_based":
            # Use smart selection for all modes
            return self._calculate_freepath_ball_position_smart(
                freepath_coordinates, original_size, cropping_config, 
                frame_id, debug_mode, MIN_MARGIN, BOTTOM_HALF_THRESHOLD
            )
        
        # FoV-based cropping with smart selection
        # Get scaled camera intrinsics (MUST match the actual image resolution)
        orig_h, orig_w = original_size
        intrinsics = cropping_config.get("camera_intrinsics", {})
        
        # Use cached scaled intrinsics to match actual image dimensions
        fx, fy, cx, cy = self._update_cached_intrinsics(orig_w, orig_h, intrinsics)
        
        # Get FoV with clamping
        requested_fov = cropping_config.get("fov_degrees", 30)
        max_h_fov = intrinsics.get("horizontal_fov", 85.2)
        max_v_fov = intrinsics.get("vertical_fov", 58.0)
        offset_y_ratio = cropping_config.get("offset_y_ratio", 0.5)
        fov_deg = min(requested_fov, max_h_fov, max_v_fov)
        square_size = min(orig_h, orig_w)
        crop_x1 = (orig_w - square_size) // 2
        crop_x2 = crop_x1 + square_size
        crop_y1 = (orig_h - square_size) // 2
        crop_y2 = crop_y1 + square_size
        
        # Calculate FoV boundaries in square coordinates
        half_fov_rad = math.radians(fov_deg / 2)
        tan_half = math.tan(half_fov_rad)
        fov_px_h = tan_half * fx  # horizontal FoV in pixels
        fov_px_v = tan_half * fy  # vertical FoV in pixels
        
        # Adjust camera center for square crop
        new_cx = cx - crop_x1
        new_cy = cy - crop_y1
        
        # Apply vertical offset to FoV center
        offset_cy = new_cy + (offset_y_ratio - 0.5) * square_size * 0.5
        
        # FoV region in square coordinates (with clamping and int conversion)
        fov_x1 = max(0, int(new_cx - fov_px_h))
        fov_x2 = min(square_size, int(new_cx + fov_px_h))
        fov_y1 = max(0, int(offset_cy - fov_px_v))
        fov_y2 = min(square_size, int(offset_cy + fov_px_v))
        
        # Actual crop dimensions (variable size)
        actual_crop_w = fov_x2 - fov_x1
        actual_crop_h = fov_y2 - fov_y1
        
        if debug_mode:
            logger.info(f"🎯 Frame {frame_id}: FoV region in square: x={fov_x1:.0f}-{fov_x2:.0f}, y={fov_y1:.0f}-{fov_y2:.0f}")
            logger.info(f"🎯 Frame {frame_id}: Freepath points: {len(freepath_coordinates)}")
        
        # Step 1: Collect all points in FoV region (in crop coordinates)
        points_in_crop = []
        for point in freepath_coordinates:
            px, py = point
            
            # Convert to square coordinates
            square_px = px - crop_x1
            square_py = py - crop_y1
            
            # Check if point is within FoV
            if fov_x1 <= square_px <= fov_x2 and fov_y1 <= square_py <= fov_y2:
                # Convert to crop coordinates
                final_x = (square_px - fov_x1)
                final_y = (square_py - fov_y1)
                points_in_crop.append((final_x, final_y))
        
        if not points_in_crop:
            if debug_mode:
                logger.info(f"🎯 Frame {frame_id}: No freepath points in FoV")
            return None
        
        # Step 2: Filter to bottom half only
        bottom_half_y = actual_crop_h * BOTTOM_HALF_THRESHOLD
        points_in_bottom = [p for p in points_in_crop if p[1] >= bottom_half_y]
        
        if not points_in_bottom:
            if debug_mode:
                logger.info(f"🎯 Frame {frame_id}: No freepath points in bottom half (threshold={BOTTOM_HALF_THRESHOLD})")
            return None
        
        # Step 3: Separate points with/without margins
        points_with_margin = [
            (x, y) for x, y in points_in_bottom
            if (MIN_MARGIN <= x <= actual_crop_w - MIN_MARGIN and 
                MIN_MARGIN <= y <= actual_crop_h - MIN_MARGIN)
        ]
        
        points_without_margin = [
            (x, y) for x, y in points_in_bottom
            if (x, y) not in points_with_margin
        ]
        
        # Step 4: Select point based on margin availability
        if points_with_margin:
            # BEST CASE: Points with margin exist → use LOWEST (closest, safest)
            candidates = points_with_margin
            target_y = max(candidates, key=lambda p: p[1])[1]  # Lowest (highest Y)
        else:
            # EDGE CASE: Only edge points → use UPPERMOST (avoid bottom clipping)
            candidates = points_without_margin
            target_y = min(candidates, key=lambda p: p[1])[1]  # Uppermost (lowest Y)
        
        target_points = [p for p in candidates if p[1] == target_y]
        
        # Step 5: If multiple, pick center-most
        if len(target_points) > 1:
            center_x = actual_crop_w / 2
            selected = min(target_points, key=lambda p: abs(p[0] - center_x))
        else:
            selected = target_points[0]
        
        # Convert to integer coordinates
        final_x = int(selected[0])
        final_y = int(selected[1])
        
        if debug_mode:
            logger.info(f"🎯 Frame {frame_id}: Selected point ({final_x}, {final_y}) from {len(points_in_crop)} candidates")
            logger.info(f"🎯 Frame {frame_id}: Points with margin: {len(points_with_margin)}, without: {len(points_without_margin)}")
        
        return (final_x, final_y)
    
    def draw_freepath_ball(
        self, 
        img: np.ndarray, 
        ball_position: Optional[Tuple[int, int]], 
        crop_size: Tuple[int, int] = (128, 128),
        ball_radius: int = 50
    ) -> np.ndarray:
        """
        Draw freepath ball on image at specified position
        
        Args:
            img: Input image
            ball_position: (x, y) position to draw ball, or None to skip
            crop_size: Size of cropped image
            ball_radius: Radius of the ball (configurable)
            
        Returns:
            Image with freepath ball drawn
        """
        if ball_position is None:
            return img
            
        img_copy = img.copy()
        if len(img_copy.shape) == 2:
            img_copy = cv2.cvtColor(img_copy, cv2.COLOR_GRAY2BGR)
            
        x, y = ball_position
        
        # Draw white circle for freepath ball (will survive binarization)
        # Use position as-is, never modify freepath point position
        cv2.circle(img_copy, (int(x), int(y)), ball_radius, (255, 255, 255), -1)
        
        return img_copy
    

    
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
        frame_id: int,
        depth: Optional[np.ndarray] = None,
        stop_at: str = "phosphene",
        debug_mode: bool = False,
        cropping_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process frame through full modular pipeline with stop points (optimized)
        
        Pipeline stages:
        1. 'passthrough': FOV crop only, no processing -> Cropped RGB view
        2. 'edge_mode': Crop + Edge detection + Encoder + Simulator -> Edge-based phosphene
        3. 'detector': Object detection + freepath detection -> RGB with bboxes
        4. 'translator': Translator simplification -> Simplified image with freepath circle
        5. 'pre_phosphene': Crop/resize to target size -> Image ready for phosphene
        6. 'phosphene': Final phosphene rendering -> Phosphene output
        
        Args:
            rgb: RGB image (H, W, 3)
            depth: Depth image (H, W) - Optional, required only for detector/translator/phosphene stages
            frame_id: Frame identifier
            stop_at: Stage to stop at ('passthrough', 'edge_mode', 'detector', 'translator', 'pre_phosphene', 'phosphene')
            debug_mode: If True, save intermediate outputs (default False for speed)
            cropping_config: Override cropping configuration (optional)
            
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
        
        # Merge provided cropping config with defaults (preserve freepath_ball and camera_intrinsics)
        if cropping_config:
            effective_cropping_config = self.cropping_config.copy()
            effective_cropping_config.update(cropping_config)
            # Ensure freepath_ball is preserved if not in override
            if "freepath_ball" not in cropping_config and "freepath_ball" in self.cropping_config:
                effective_cropping_config["freepath_ball"] = self.cropping_config["freepath_ball"]
            # Ensure camera_intrinsics is preserved if not in override
            if "camera_intrinsics" not in cropping_config and "camera_intrinsics" in self.cropping_config:
                effective_cropping_config["camera_intrinsics"] = self.cropping_config["camera_intrinsics"]
        else:
            effective_cropping_config = self.cropping_config.copy()
        
        # print(f"\n🔧 EFFECTIVE CONFIG: {effective_cropping_config.get('freepath_ball', 'MISSING!')}")
        
        stage_times = {}
        result = {
            "success": False,
            "stage": stop_at,
            "output_image": None,
            "detections": [],
            "freepath_coordinates": [],
            "freepath_circle": None,
            "stats": {},
            "error": None
        }
        
        try:
            # === NEW BRANCH 1: PASSTHROUGH MODE (Normal Vision) ===
            if stop_at == "passthrough":
                stage_start = time.time()
                
                # Apply FOV cropping only, no processing
                cropped = self._fov_based_crop(rgb, effective_cropping_config)
                
                stage_times["passthrough"] = (time.time() - stage_start) * 1000
                
                # Optional debug
                if debug_mode:
                    from datetime import datetime
                    timestamp = datetime.now().strftime("%H%M%S")
                    debug_prefix = f"{self.debug_output_dir}/passthrough_{frame_id}_{timestamp}"
                    cv2.imwrite(f"{debug_prefix}_output.jpg", cv2.cvtColor(cropped, cv2.COLOR_RGB2BGR))
                    logger.info(f"💾 Saved PASSTHROUGH output: {cropped.shape}")
                
                # Encode and return
                output_b64 = encode_ndarray_to_base64(cropped, color_space='RGB')
                
                result.update({
                    "success": True,
                    "output_image": output_b64,
                    "stage": "passthrough",
                    "stats": stage_times
                })
                return result
            
            # === NEW BRANCH 2: EDGE_MODE (Low-Res Vision) ===
            if stop_at == "edge_mode":
                stage_start = time.time()
                
                # Step 1: Apply FOV cropping
                cropped = self._fov_based_crop(rgb, effective_cropping_config)
                stage_times["crop"] = (time.time() - stage_start) * 1000
                
                # Step 2: Apply edge detection
                stage_start = time.time()
                edges = self.apply_edge_detection(cropped)
                stage_times["edge_detection"] = (time.time() - stage_start) * 1000
                
                # Optional debug: Save edge detection output
                if debug_mode:
                    from datetime import datetime
                    timestamp = datetime.now().strftime("%H%M%S")
                    debug_prefix = f"{self.debug_output_dir}/edge_mode_{frame_id}_{timestamp}"
                    cv2.imwrite(f"{debug_prefix}_01_cropped.jpg", cv2.cvtColor(cropped, cv2.COLOR_RGB2BGR))
                    cv2.imwrite(f"{debug_prefix}_02_edges.jpg", cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR))
                    logger.info(f"💾 Saved EDGE_MODE intermediate images")
                
                # Step 3: Run through edge encoder/simulator
                stage_start = time.time()
                
                # Pipeline2 expects grayscale normalized input [0, 1]
                if len(edges.shape) == 3:
                    edges_gray = cv2.cvtColor(edges, cv2.COLOR_RGB2GRAY)
                else:
                    edges_gray = edges
                
                edges_normalized = edges_gray #.astype(np.float32) / 255.0
                
                # Run edge encoder rendering (uses 128x128 edge encoder)
                if self.pipeline2 is None:
                    raise RuntimeError("Pipeline2Integration not initialized")
                
                phosphene_output = self.pipeline2.input2phosphenes(edges_normalized, use_edge_encoder=True)
                stage_times["phosphene_encoder"] = (time.time() - stage_start) * 1000
                
                # Convert to image
                phosphene_img = np.clip(phosphene_output * 255.0, 0, 255).astype(np.uint8)
                
                # Optional debug: Save final output
                if debug_mode:
                    cv2.imwrite(f"{debug_prefix}_03_phosphene_output.png", phosphene_img)
                    logger.info(f"💾 Saved EDGE_MODE phosphene output")
                
                # Encode and return
                output_b64 = encode_ndarray_to_base64(phosphene_img, color_space='BGR')
                
                result.update({
                    "success": True,
                    "output_image": output_b64,
                    "stage": "edge_mode",
                    "stats": stage_times
                })
                return result
            
            # === EXISTING STAGES: Require depth ===
            if depth is None:
                result["error"] = f"Depth image is required for stage '{stop_at}'. Please send depth data or use 'passthrough' or 'edge_mode' stages."
                return result
            
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
            freepath_coordinates = nav_result.get("freepath_coordinates", [])
            freepath_coordinates = nav_result.get("freepath_coordinates", [])
            
            stage_times["detection"] = (time.time() - stage_start) * 1000
            
            # Draw bboxes on RGB for detector stage output
            detector_output = self.draw_detections_on_rgb(rgb, detections)
            
            # Optional debug: Save detector output
            if debug_mode and debug_input_prefix:
                cv2.imwrite(f"{debug_input_prefix}_03_detector_output.jpg", cv2.cvtColor(detector_output, cv2.COLOR_RGB2BGR))
                logger.info(f"💾 Saved DETECTOR output")
                
                # Save freepath visualization
                if debug_mode and freepath_coordinates and len(freepath_coordinates) > 0:
                    freepath_vis = self._visualize_freepath_points(rgb, freepath_coordinates, freepath_circle)
                    cv2.imwrite(f"{debug_input_prefix}_03b_freepath_points.jpg", cv2.cvtColor(freepath_vis, cv2.COLOR_RGB2BGR))
                    # logger.info(f"💾 Saved FREEPATH visualization with {len(freepath_coordinates)} points")
                    print(f"💾 Saved freepath visualization: {debug_input_prefix}_03b_freepath_points.jpg")
            
            if stop_at == "detector":
                # Encode detector output (RGB with bboxes) - optimized single encode
                output_b64 = encode_ndarray_to_base64(detector_output, color_space='RGB')
                
                result.update({
                    "success": True,
                    "output_image": output_b64,
                    "detections": detections,
                    "freepath_coordinates": freepath_coordinates,
                    "freepath_circle": freepath_circle,
                    "stats": stage_times
                })
                return result
            
            # STAGE 2: TRANSLATOR - Simplify image to canonical shapes
            stage_start = time.time()
            
            # CRITICAL: Lock translator to prevent race conditions
            # Without this lock, parallel frames can interfere with each other:
            # - Frame N+1 overwrites translator.bundle while Frame N is rendering
            # - Causes image fluctuation (old frames appearing after new ones)
            with self.translator_lock:
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
                
                # Create detection bundle for translator - exclude freepath for clean canonical shapes
                detection_data = {
                    "frame_id": f"nav_frame_{frame_id}",
                    "file_path": "navigation_pipeline",
                    "metadata": {
                        "image_width": w,
                        "image_height": h,
                        "camera_intrinsics": None
                    },
                    "free_path": None,  # Exclude freepath data for clean translator output
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
                
                # Update configurable translator parameters
                translator.params['T_min'] = self.t_min
                translator.params['K_min'] = self.k_min
                translator.params['K_max'] = self.k_max
            
            # Get simplified canvas output - ALWAYS output full-sized image for translator stage
            crop_type = effective_cropping_config.get("type", "central_crop")
            crop_size = effective_cropping_config.get("size", [128, 128])
            
            # Translator ALWAYS outputs to full image size with retinotopic mapping
            translator.params['canvas_size'] = [h, w]
            simplified_canvas, _ = translator.run(f"nav_frame_{frame_id}.png", save_to_disk=False, target_canvas_size=(w, h), draw_freepath=True)
            
            # Get selected objects with translator scores
            selected_objects = translator.select_objects()
            
            # Create lookup dict for selected objects (by class name for matching)
            selected_lookup = {}
            for sel_obj in selected_objects:
                obj_class = sel_obj.get('class', 'unknown')
                obj_bbox = sel_obj.get('bbox', [])
                # Use class + bbox as key for matching
                key = f"{obj_class}_{obj_bbox}"
                selected_lookup[key] = {
                    'score': sel_obj.get('score', 0.0),
                    'distance_m': sel_obj.get('distance_m', sel_obj.get('depth', 0.0))
                }
            
            # Add translator scores to original detections
            for det in detections:
                det_class = det.get('class', 'unknown')
                det_bbox = det.get('bbox', [])
                key = f"{det_class}_{det_bbox}"
                
                if key in selected_lookup:
                    # Object was selected by translator
                    sel_data = selected_lookup[key]
                    det['translator_score'] = round(sel_data['score'], 3)
                    det['selected'] = True
                    det['selection_reason'] = f"Score {det['translator_score']:.3f} > T_min ({self.t_min})"
                    # Score breakdown (currently distance-based)
                    distance = sel_data['distance_m']
                    det['score_breakdown'] = {
                        'distance_m': round(distance, 2),
                        'distance_score': round(0.01 * distance, 3)
                    }
                else:
                    # Object was rejected by translator
                    det['translator_score'] = 0.0
                    det['selected'] = False
                    det['selection_reason'] = f"Score too low or beyond K_max limit (T_min={self.t_min}, K_max={self.k_max})"
                    det['score_breakdown'] = {}
            
            # End of translator lock - state is now safe, other frames can proceed
            
            # Safety check: Ensure simplified_canvas is valid
            if simplified_canvas is None or simplified_canvas.size == 0:
                logger.error(f"Translator returned None or empty image for frame {frame_id}")
                result["error"] = "Translator failed to generate simplified canvas"
                return result
            
            # Convert to grayscale and binarize for consistency
            simplified_gray = cv2.cvtColor(simplified_canvas, cv2.COLOR_BGR2GRAY)
            _, simplified_binary = cv2.threshold(simplified_gray, 127, 255, cv2.THRESH_BINARY)
            
            # Optional debug: Save translator output
            if debug_mode and debug_input_prefix:
                cv2.imwrite(f"{debug_input_prefix}_04_translator_output_full.jpg", simplified_binary)
                logger.info(f"💾 Saved TRANSLATOR output (full size {w}x{h})")
            
            stage_times["translator"] = (time.time() - stage_start) * 1000
            
            if stop_at == "translator":
                # Encode full-sized simplified canvas - NO cropping, NO freepath ball
                output_b64 = encode_ndarray_to_base64(simplified_binary, color_space='BGR')
                
                result.update({
                    "success": True,
                    "output_image": output_b64,
                    "detections": detections,
                    "freepath_coordinates": freepath_coordinates,
                    "freepath_circle": freepath_circle,
                    "stats": stage_times
                })
                return result
            
            # STAGE 3: PRE_PHOSPHENE - Apply cropping and add freepath ball
            stage_start = time.time()
            
            # Safety check before cropping
            if simplified_binary is None or simplified_binary.size == 0:
                logger.error(f"simplified_binary is None or empty before cropping (frame {frame_id})")
                result["error"] = "Image is empty before cropping stage"
                return result
            
            # Apply cropping to the full-sized translator output
            if crop_type == "fov_based":
                cropped_image = self._fov_based_crop(simplified_binary, effective_cropping_config)
                # Get actual crop size for freepath ball positioning
                crop_size = [cropped_image.shape[1], cropped_image.shape[0]]  # [width, height]
            elif crop_type == "central_crop":
                crop_size = effective_cropping_config.get("size", [128, 128])
                cropped_image = self._central_crop_with_offset(simplified_binary, crop_size, effective_cropping_config.get("offset_y_ratio", 0.5))
            else:  # retinotopic
                crop_size = effective_cropping_config.get("size", [128, 128])
                cropped_image = cv2.resize(simplified_binary, tuple(crop_size), interpolation=cv2.INTER_LINEAR)
            
            # Validate cropped image
            if cropped_image is None or cropped_image.size == 0:
                logger.error(f"Cropping resulted in empty image! Crop type: {crop_type}, Input shape: {simplified_binary.shape}")
                result["error"] = f"Cropping failed - empty image after {crop_type} crop"
                return result
            
            # Calculate and draw freepath ball on the cropped image
            freepath_ball_position = None
            if freepath_coordinates and len(freepath_coordinates) > 0:
                freepath_ball_position = self._calculate_freepath_ball_position(
                    freepath_coordinates, 
                    (h, w),  # original image size
                    effective_cropping_config,
                    frame_id,
                    debug_mode
                )
                if debug_mode:
                    logger.info(f"🎯 Frame {frame_id}: Freepath coordinates: {freepath_coordinates}")
                    logger.info(f"🎯 Frame {frame_id}: Ball position: {freepath_ball_position}")
                    logger.info(f"🎯 Frame {frame_id}: Crop config: {effective_cropping_config}")
            
            # Draw freepath ball on cropped image
            if freepath_ball_position:
                ball_radius = effective_cropping_config.get("freepath_ball", {}).get("radius", 10)
                # print(f"\n🎨 DRAWING BALL - Radius: {ball_radius}, Position: {freepath_ball_position}")
                if debug_mode:
                    logger.info(f"🎯 Frame {frame_id}: Drawing ball with radius={ball_radius} at position {freepath_ball_position}")
                cropped_image = self.draw_freepath_ball(cropped_image, freepath_ball_position, crop_size, ball_radius)
            
            # Optional debug: Save pre-phosphene image
            if debug_mode and debug_input_prefix:
                crop_info = f"{crop_size[0]}x{crop_size[1]}" if crop_type == "fov_based" else f"{crop_size[0]}x{crop_size[1]}"
                cv2.imwrite(f"{debug_input_prefix}_05_pre_phosphene_{crop_info}_{crop_type}.jpg", cropped_image)
                logger.info(f"💾 Saved PRE_PHOSPHENE image ({crop_info} with {crop_type} mapping and freepath ball)")
            
            stage_times["pre_phosphene"] = (time.time() - stage_start) * 1000
            
            if stop_at == "pre_phosphene":
                # Encode cropped image with freepath ball
                output_b64 = encode_ndarray_to_base64(cropped_image, color_space='BGR')
                
                result.update({
                    "success": True,
                    "output_image": output_b64,
                    "detections": detections,
                    "freepath_coordinates": freepath_coordinates,
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
            # Pipeline2 expects grayscale input [0, 1], so convert if necessary
            if len(cropped_image.shape) == 3:
                # Convert BGR/RGB to grayscale
                pre_phosphene_gray = cv2.cvtColor(cropped_image, cv2.COLOR_BGR2GRAY)
            else:
                pre_phosphene_gray = cropped_image

            pre_phosphene_normalized = pre_phosphene_gray.astype(np.float32) / 255.0
            
            # Run phosphene rendering (uses 373x349 phosphene encoder)
            phosphene_output = self.pipeline2.input2phosphenes(pre_phosphene_normalized, use_edge_encoder=False)  # Returns (H, W) numpy array
            
            stage_times["phosphene"] = (time.time() - stage_start) * 1000
            
            # Convert phosphene output to image (scale to 0-255)
            phosphene_img = np.clip(phosphene_output * 255.0, 0, 255).astype(np.uint8)
            
            ################################ add frame ID overlay ################################
            # Convert grayscale to BGR so we can add colored text overlay
            if len(phosphene_img.shape) == 2:
                phosphene_img = cv2.cvtColor(phosphene_img, cv2.COLOR_GRAY2BGR)
            
            # Add frame ID overlay to phosphene output
            from core import add_frame_id_overlay
            phosphene_img = add_frame_id_overlay(phosphene_img, frame_id)
            ####################################################################################
            
            # Optional debug: Save phosphene output
            if debug_mode and debug_input_prefix:
                cv2.imwrite(f"{debug_input_prefix}_06_phosphene_output.png", phosphene_img)
                logger.info(f"💾 Saved PHOSPHENE output")
            
            # Encode phosphene output - now it's BGR with colored overlay
            output_b64 = encode_ndarray_to_base64(phosphene_img, color_space='BGR')
            
            result.update({
                "success": True,
                "output_image": output_b64,
                "detections": detections,
                "freepath_coordinates": freepath_coordinates,
                "freepath_circle": freepath_circle,
                "stats": stage_times
            })
            
        except Exception as e:
            logger.error(f"Error in full pipeline at stage {stop_at}: {e}", exc_info=True)
            result["error"] = str(e)
        
        return result
    
    def _visualize_freepath_points(
        self, 
        rgb: np.ndarray, 
        freepath_coordinates: List[List[int]], 
        freepath_circle: Optional[Dict[str, Any]] = None
    ) -> np.ndarray:
        """
        Visualize freepath centerline points on RGB image
        
        Args:
            rgb: RGB image as numpy array (H, W, 3)
            freepath_coordinates: List of [x, y] freepath points
            freepath_circle: Optional freepath circle dict with center and radius
            
        Returns:
            np.ndarray: RGB image with freepath points visualized
        """
        # Create a copy to draw on
        vis_img = rgb.copy()
        
        if not freepath_coordinates or len(freepath_coordinates) == 0:
            return vis_img
        
        # Draw all freepath points as small circles
        for i, point in enumerate(freepath_coordinates):
            x, y = int(point[0]), int(point[1])
            # Draw point (cyan color for visibility)
            cv2.circle(vis_img, (x, y), 3, (0, 255, 255), -1)  # Cyan filled circle
            
            # Draw line connecting consecutive points
            if i > 0:
                prev_x, prev_y = int(freepath_coordinates[i-1][0]), int(freepath_coordinates[i-1][1])
                cv2.line(vis_img, (prev_x, prev_y), (x, y), (0, 255, 255), 2)  # Cyan line
        
        # Draw freepath circle if available
        if freepath_circle and "center" in freepath_circle:
            center = freepath_circle["center"]
            radius = freepath_circle.get("radius", 0)
            if center and radius > 0:
                cx, cy = int(center[0]), int(center[1])
                # Draw circle (green color)
                cv2.circle(vis_img, (cx, cy), int(radius), (0, 255, 0), 2)  # Green circle outline
                # Draw center point
                cv2.circle(vis_img, (cx, cy), 5, (0, 255, 0), -1)  # Green filled circle
        
        # Add text info
        text = f"Freepath Points: {len(freepath_coordinates)}"
        cv2.putText(vis_img, text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
        
        return vis_img
    
    def apply_edge_detection(self, img: np.ndarray) -> np.ndarray:
        """
        Apply edge detection for low-res vision mode
        
        Args:
            img: Input RGB image (H, W, 3)
            
        Returns:
            np.ndarray: Edge-detected image as RGB (H, W, 3) ready for encoder
        """
        # Edge detection parameters (adjust here)
        CANNY_THRESHOLD1 = 170
        CANNY_THRESHOLD2 = 255
        DILATION_KERNEL_SIZE = (3, 3)
        DILATION_ITERATIONS = 3
        
        # Convert RGB to grayscale
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        else:
            gray = img
        
        # Edge detection (Canny)
        edges = cv2.Canny(gray, CANNY_THRESHOLD1, CANNY_THRESHOLD2)
        
        # Edge dilation
        kernel = np.ones(DILATION_KERNEL_SIZE, np.uint8)
        dilated_edges = cv2.dilate(edges, kernel, iterations=DILATION_ITERATIONS)
        
        # Convert back to RGB for encoder (expects 3 channels)
        # edges_rgb = cv2.cvtColor(dilated_edges, cv2.COLOR_GRAY2RGB)
        
        return dilated_edges
    
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
                # Use actual model probability if available, otherwise use very low confidence
                confidence = det.get('confidence', 0.001)
                label = f"{class_name}: {confidence*100:.1f}%"
                
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
    
    def draw_freepath_ball_alt(self, simplified_img: np.ndarray, ball_position: Optional[Tuple[int, int]], crop_size: List[int], ball_radius: int = 10) -> np.ndarray:
        """
        Alternative draw freepath ball on simplified translator image (legacy compatibility)
        
        Args:
            simplified_img: Simplified image from translator (grayscale or BGR)
            ball_position: (x, y) position for ball in cropped coordinates, or None
            crop_size: [width, height] of cropped image
            ball_radius: Radius of the ball
            
        Returns:
            np.ndarray: Image with drawn ball
        """
        # Create a copy
        img_with_ball = simplified_img.copy()
        
        # Convert to BGR if grayscale for colored ball
        if len(img_with_ball.shape) == 2:
            img_with_ball = cv2.cvtColor(img_with_ball, cv2.COLOR_GRAY2BGR)
        
        if ball_position:
            x, y = ball_position
            # Use position as-is (never modify)
            cv2.circle(img_with_ball, (int(x), int(y)), ball_radius, (255, 255, 255), -1)
        
        return img_with_ball
    
    def crop_image(self, img: np.ndarray, cropping_config: Dict[str, Any]) -> np.ndarray:
        """
        Crop image according to cropping configuration
        
        Args:
            img: Input image
            cropping_config: Cropping configuration
            
        Returns:
            np.ndarray: Cropped image
        """
        crop_type = cropping_config.get("type", "fov_based")
        
        if crop_type == "fov_based":
            return self._fov_based_crop(img, cropping_config)
        elif crop_type == "retinotopic":
            # For retinotopic, we shouldn't reach here, but just in case
            crop_size = cropping_config.get("size", [128, 128])
            return cv2.resize(img, tuple(crop_size), interpolation=cv2.INTER_LINEAR)
        else:  # central_crop (legacy)
            crop_size = cropping_config.get("size", [128, 128])
            offset_y_ratio = cropping_config.get("offset_y_ratio", 0.5)
            return self._central_crop_with_offset(img, crop_size, offset_y_ratio)
    
    def _central_crop_with_offset(self, img: np.ndarray, crop_size: List[int], offset_y_ratio: float) -> np.ndarray:
        """
        Central crop with vertical offset
        
        Args:
            img: Input image
            crop_size: [width, height] of crop
            offset_y_ratio: Vertical offset as ratio of image height (0.5 = center, 1.0 = bottom)
            
        Returns:
            np.ndarray: Cropped image
        """
        h, w = img.shape[:2]
        crop_w, crop_h = crop_size
        
        # Calculate center position with offset
        center_x = w // 2
        center_y = int(h * offset_y_ratio)
        
        # Calculate crop boundaries
        half_crop_w = crop_w // 2
        half_crop_h = crop_h // 2
        
        x1 = max(0, center_x - half_crop_w)
        y1 = max(0, center_y - half_crop_h)
        x2 = min(w, center_x + half_crop_w)
        y2 = min(h, center_y + half_crop_h)
        
        # Crop
        cropped = img[y1:y2, x1:x2]
        
        # Resize to exact crop size if needed (handles edge cases)
        if cropped.shape[0] != crop_h or cropped.shape[1] != crop_w:
            cropped = cv2.resize(cropped, (crop_w, crop_h), interpolation=cv2.INTER_LINEAR)
        
        return cropped
    
    def crop_image(self, img: np.ndarray, cropping_config: Dict[str, Any]) -> np.ndarray:
        """
        Crop image according to cropping configuration
        
        Args:
            img: Input image
            cropping_config: Cropping configuration dict
            
        Returns:
            np.ndarray: Cropped image
        """
        crop_type = cropping_config.get("type", "central_crop")
        crop_size = cropping_config.get("size", [128, 128])
        offset_y_ratio = cropping_config.get("offset_y_ratio", 0.5)
        
        h, w = img.shape[:2]
        target_w, target_h = crop_size
        
        if crop_type == "retinotopic":
            # This shouldn't be called for retinotopic, but fallback to resize
            return cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
        else:  # central_crop with offset
            # Calculate crop center with vertical offset
            center_x = w // 2
            center_y = int(h * offset_y_ratio)  # Offset from top by ratio
            
            # Calculate crop boundaries
            half_w = target_w // 2
            half_h = target_h // 2
            
            x1 = max(0, center_x - half_w)
            y1 = max(0, center_y - half_h)
            x2 = min(w, center_x + half_w)
            y2 = min(h, center_y + half_h)
            
            # Crop
            cropped = img[y1:y2, x1:x2]
            
            # Resize to exact target size if needed
            if cropped.shape[0] != target_h or cropped.shape[1] != target_w:
                cropped = cv2.resize(cropped, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
            
            return cropped
    
    def _update_cached_intrinsics(self, width: int, height: int, intrinsics: Dict) -> Tuple[float, float, float, float]:
        """
        Update cached camera intrinsics only when image dimensions change.
        Eliminates per-frame calculation overhead by caching scaled values.
        
        Args:
            width: Current image width
            height: Current image height
            intrinsics: Camera intrinsics config dict
        
        Returns:
            Tuple of (fx, fy, cx, cy) scaled for current resolution
        """
        current_dims = (width, height)
        
        # Return cached values if dimensions haven't changed (FAST PATH)
        if self._cached_image_dims == current_dims and self._cached_intrinsics is not None:
            return self._cached_intrinsics
        
        # Recalculate only when dimensions change (SLOW PATH - rare)
        cam_w_ref = intrinsics.get("width", 1280)
        cam_h_ref = intrinsics.get("height", 720)
        fx_ref = intrinsics.get('fx', 696.0)
        fy_ref = intrinsics.get('fy', 649.5)
        cx_ref = intrinsics.get('cx', 640.0)
        cy_ref = intrinsics.get('cy', 360.0)
        
        scale_x = width / cam_w_ref
        scale_y = height / cam_h_ref
        fx = fx_ref * scale_x
        fy = fy_ref * scale_y
        cx = cx_ref * scale_x
        cy = cy_ref * scale_y
        
        # Cache the results
        self._cached_image_dims = current_dims
        self._cached_intrinsics = (fx, fy, cx, cy)
        
        logger.info(f"📐 Updated camera intrinsics cache: {cam_w_ref}x{cam_h_ref} -> {width}x{height} (scale: {scale_x:.2f}x, {scale_y:.2f}y)")
        logger.info(f"   fx: {fx_ref:.1f} -> {fx:.1f}, fy: {fy_ref:.1f} -> {fy:.1f}")
        logger.info(f"   cx: {cx_ref:.1f} -> {cx:.1f}, cy: {cy_ref:.1f} -> {cy:.1f}")
        
        return self._cached_intrinsics
    
    def _fov_based_crop(self, img: np.ndarray, cropping_config: Dict[str, Any]) -> np.ndarray:
        """
        FoV-based cropping with square pre-cropping - VARIABLE SIZE OUTPUT
        
        Steps:
        1. Pre-crop to square (720x720 from 1280x720)
        2. Calculate FoV boundaries within square coordinates
        3. Crop to FoV region - NO RESIZING (variable output size)
        
        Args:
            img: Input image (H, W, 3) or (H, W)
            cropping_config: Configuration with fov_degrees and camera_intrinsics
            
        Returns:
            np.ndarray: Cropped image (variable size based on FoV)
        """
        import math
        
        h, w = img.shape[:2]
        
        # Get camera intrinsics (calibrated for reference resolution)
        intrinsics = cropping_config.get("camera_intrinsics", {})
        max_h_fov = intrinsics.get("horizontal_fov", 85.2)
        max_v_fov = intrinsics.get("vertical_fov", 58.0)
        
        # Get scaled intrinsics from cache (only recalculates if dimensions changed)
        fx, fy, cx, cy = self._update_cached_intrinsics(w, h, intrinsics)
        
        # Get requested FoV with clamping
        requested_fov = cropping_config.get("fov_degrees", 30)
        fallback_mode = cropping_config.get("freepath_fallback", "clamp_with_warning")
        offset_y_ratio = cropping_config.get("offset_y_ratio", 0.5)
        
        # Clamp FoV to camera limits
        fov_deg = min(requested_fov, max_h_fov, max_v_fov)
        if fov_deg != requested_fov and fallback_mode == "clamp_with_warning":
            logger.warning(f"Requested FoV {requested_fov}° clamped to {fov_deg}° (camera limit)")
        
        # Pre-compute trigonometry for speed
        half_fov_rad = math.radians(fov_deg / 2)
        tan_half = math.tan(half_fov_rad)
        fov_px_h = tan_half * fx  # horizontal FoV in pixels
        fov_px_v = tan_half * fy  # vertical FoV in pixels
        
        # Step 1: Pre-crop to square (720x720 centered) - FAST array slicing
        square_size = min(h, w)
        crop_x1 = (w - square_size) // 2
        crop_x2 = crop_x1 + square_size
        crop_y1 = (h - square_size) // 2
        crop_y2 = crop_y1 + square_size
        
        square_img = img[crop_y1:crop_y2, crop_x1:crop_x2]
        
        # Step 2: Calculate FoV boundaries within square coordinates
        # Adjust camera center for square crop
        new_cx = cx - crop_x1
        new_cy = cy - crop_y1
        
        # Apply vertical offset to FoV center
        offset_cy = new_cy + (offset_y_ratio - 0.5) * square_size * 0.5  # Shift by up to half the square size
        
        # FoV boundaries in square coordinate system
        fov_x1 = max(0, int(new_cx - fov_px_h))
        fov_x2 = min(square_size, int(new_cx + fov_px_h))
        fov_y1 = max(0, int(offset_cy - fov_px_v))
        fov_y2 = min(square_size, int(offset_cy + fov_px_v))
        
        # Validate boundaries to prevent empty crop
        if fov_x1 >= fov_x2 or fov_y1 >= fov_y2:
            logger.error(f"Invalid FoV crop boundaries: x1={fov_x1}, x2={fov_x2}, y1={fov_y1}, y2={fov_y2}")
            logger.error(f"Image shape: {img.shape}, square_size: {square_size}, fov_deg: {fov_deg}")
            logger.error(f"FoV pixels: h={fov_px_h:.1f}, v={fov_px_v:.1f}")
            # Fallback to center crop
            crop_w, crop_h = cropping_config.get("size", [128, 128])
            center_x, center_y = square_size // 2, square_size // 2
            fov_x1 = max(0, center_x - crop_w // 2)
            fov_x2 = min(square_size, center_x + crop_w // 2)
            fov_y1 = max(0, center_y - crop_h // 2)
            fov_y2 = min(square_size, center_y + crop_h // 2)
            logger.info(f"Using fallback center crop: {fov_x1}:{fov_x2}, {fov_y1}:{fov_y2}")
        
        # Step 3: Crop to FoV region - NO RESIZING for variable output
        fov_crop = square_img[fov_y1:fov_y2, fov_x1:fov_x2]
        
        # Final safety check
        if fov_crop.size == 0:
            logger.error(f"FoV crop resulted in empty image! Shape: {fov_crop.shape}")
            # Emergency fallback: return center crop
            crop_w, crop_h = cropping_config.get("size", [128, 128])
            return square_img[:crop_h, :crop_w]
        
        return fov_crop
    
    def _calculate_freepath_ball_position_smart(
        self, 
        freepath_coordinates: List[List[int]], 
        original_size: Tuple[int, int],
        cropping_config: Dict[str, Any],
        frame_id: int,
        debug_mode: bool,
        MIN_MARGIN: int,
        BOTTOM_HALF_THRESHOLD: float
    ) -> Optional[Tuple[int, int]]:
        """
        Smart freepath ball calculation for non-FoV cropping modes
        
        Applies same smart selection logic as FoV mode:
        1. Collect points in crop region
        2. Filter to bottom half
        3. Select based on margin:
           - WITH margin: LOWEST point
           - WITHOUT margin: UPPERMOST point
        4. If multiple, prefer center-most
        
        Args:
            freepath_coordinates: List of [x, y] freepath centerline points
            original_size: (height, width) of original image
            cropping_config: Cropping configuration
            frame_id: Frame ID for logging
            debug_mode: Enable debug logging
            MIN_MARGIN: Minimum margin for "good" points
            BOTTOM_HALF_THRESHOLD: Y threshold for bottom half
            
        Returns:
            (x, y) position for freepath ball in cropped coordinates, or None
        """
        if not freepath_coordinates or len(freepath_coordinates) == 0:
            return None
            
        crop_type = cropping_config.get("type", "central_crop")
        crop_size = cropping_config.get("size", [128, 128])
        offset_y_ratio = cropping_config.get("offset_y_ratio", 0.5)
        
        orig_h, orig_w = original_size
        crop_w, crop_h = crop_size

        if crop_type == "retinotopic":
            # For retinotopic, collect all points and transform
            points_in_crop = []
            scale_x = crop_w / orig_w
            scale_y = crop_h / orig_h
            
            for x, y in freepath_coordinates:
                crop_x = x * scale_x
                crop_y = y * scale_y
                if 0 <= crop_x < crop_w and 0 <= crop_y < crop_h:
                    points_in_crop.append((crop_x, crop_y))

        else:  # central_crop
            # Calculate crop boundaries
            center_x = orig_w // 2
            center_y = int(orig_h * offset_y_ratio)
            half_w = crop_w // 2
            half_h = crop_h // 2
            crop_x1 = max(0, center_x - half_w)
            crop_y1 = max(0, center_y - half_h)
            crop_x2 = min(orig_w, center_x + half_w)
            crop_y2 = min(orig_h, center_y + half_h)
            
            # Collect points in crop region
            points_in_crop = []
            for x, y in freepath_coordinates:
                if crop_x1 <= x <= crop_x2 and crop_y1 <= y <= crop_y2:
                    # Map to crop coordinates
                    crop_x = (x - crop_x1) * crop_w / (crop_x2 - crop_x1)
                    crop_y = (y - crop_y1) * crop_h / (crop_y2 - crop_y1)
                    points_in_crop.append((crop_x, crop_y))
        
        if not points_in_crop:
            if debug_mode:
                logger.info(f"🎯 Frame {frame_id}: No freepath points in crop region")
            return None
        
        # Smart selection: bottom half only
        bottom_half_y = crop_h * BOTTOM_HALF_THRESHOLD
        points_in_bottom = [p for p in points_in_crop if p[1] >= bottom_half_y]
        
        if not points_in_bottom:
            if debug_mode:
                logger.info(f"🎯 Frame {frame_id}: No freepath points in bottom half")
            return None
        
        # Separate with/without margins
        points_with_margin = [
            (x, y) for x, y in points_in_bottom
            if (MIN_MARGIN <= x <= crop_w - MIN_MARGIN and 
                MIN_MARGIN <= y <= crop_h - MIN_MARGIN)
        ]
        
        points_without_margin = [
            (x, y) for x, y in points_in_bottom
            if (x, y) not in points_with_margin
        ]
        
        # Select point based on margin availability
        if points_with_margin:
            # Points with margin → use LOWEST (closest, safest)
            candidates = points_with_margin
            target_y = max(candidates, key=lambda p: p[1])[1]  # Lowest
        else:
            # Only edge points → use UPPERMOST (avoid bottom clipping)
            candidates = points_without_margin
            target_y = min(candidates, key=lambda p: p[1])[1]  # Uppermost
        
        target_points = [p for p in candidates if p[1] == target_y]
        
        # Pick center-most if multiple
        if len(target_points) > 1:
            center_x_pos = crop_w / 2
            selected = min(target_points, key=lambda p: abs(p[0] - center_x_pos))
        else:
            selected = target_points[0]
        
        # Convert to integer
        final_x = int(selected[0])
        final_y = int(selected[1])
        
        if debug_mode:
            logger.info(f"🎯 Frame {frame_id}: Selected ({final_x}, {final_y}) from {len(points_in_crop)} candidates")
        
        return (final_x, final_y)
