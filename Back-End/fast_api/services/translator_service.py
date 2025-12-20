"""
Translator Service

Singleton service for phosphene translation and Pipeline2 integration.
"""

import os
import json
import time
import logging
import base64
from typing import List, Dict, Any, Tuple
import numpy as np
import cv2
from fastapi import HTTPException

from translation.translator import Translator
from translation.Pipeline2Integration import Pipeline2Integration

logger = logging.getLogger(__name__)


class TranslatorService:
    """Singleton service for phosphene translation"""
    
    def __init__(self, eager_init: bool = True):
        self.translator = None
        self.script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.output_dir = os.path.join(self.script_dir, "api_output")
        self.temp_json_path = os.path.join(self.output_dir, "temp_detection.json")
        
        # Configuration paths
        self.shapes_path = os.path.join(self.script_dir, "dummy_data/canonical_shapes.json")
        self.params_path = os.path.join(self.script_dir, "dummy_data/selection_params.json")
        
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Verify required files exist
        self._verify_config_files()
        
        # Initialize Pipeline2 at startup (neural network for phosphene simulation)
        logger.info("Initializing Pipeline2 neural network...")
        self.pipeline2 = Pipeline2Integration()
        logger.info("✓ Pipeline2 initialized successfully")
        
        # Eagerly initialize translator to avoid first-request delay
        if eager_init:
            self._initialize_translator()
        else:
            logger.warning("Translator lazy initialization enabled - first request will be slower")
    
    def _verify_config_files(self):
        """Verify that required configuration files exist"""
        if not os.path.exists(self.shapes_path):
            logger.warning(f"Shapes file not found: {self.shapes_path}")
        if not os.path.exists(self.params_path):
            logger.warning(f"Params file not found: {self.params_path}")
    
    def _initialize_translator(self):
        """Initialize translator with dummy data at startup to avoid first-request delay"""
        try:
            logger.info("Pre-initializing translator...")
            
            # Create a minimal dummy detection bundle for initialization
            dummy_detection = {
                "frame_id": "init_frame",
                "file_path": "initialization",
                "metadata": {
                    "image_width": 640,
                    "image_height": 480,
                    "camera_intrinsics": None
                },
                "free_path": None,
                "obstacles": []
            }
            
            # Save temporary detection JSON for initialization
            with open(self.temp_json_path, 'w') as f:
                json.dump(dummy_detection, f)
            
            # Initialize the translator
            self.translator = Translator(
                self.temp_json_path,
                self.shapes_path,
                self.params_path,
                None,
                self.output_dir
            )
            
            logger.info("✓ Translator pre-initialized successfully")
        except Exception as e:
            logger.warning(f"Failed to pre-initialize translator: {e}")
            # Don't fail startup, translator will be lazy-loaded on first request
            self.translator = None
    
    def translate(
        self,
        objects: List[Dict[str, Any]],
        image_width: int,
        image_height: int,
        t_min: float = 0.3,
        k_min: int = 1,
        k_max: int = 5,
        save_debug_images: bool = False,
        return_bytes: bool = False
    ) -> Tuple[str, List[Dict[str, Any]], Dict[str, Any]]:
        """
        Translate detected objects to phosphene representation
        
        Args:
            objects: List of detected objects
            image_width: Width of input image
            image_height: Height of input image
            t_min: Minimum score threshold
            k_min: Minimum number of objects to select
            k_max: Maximum number of objects to select
            save_debug_images: If True, save intermediate images to disk for debugging
            return_bytes: If True, return phosphene image as bytes instead of base64 string
        
        Returns:
            tuple: (phosphene_image_base64_or_bytes, selected_objects, metadata)
        """
        start_time = time.time()
        
        try:
            # Create detection bundle (in-memory, no file I/O needed for updating)
            detection_data = {
                "frame_id": f"api_frame_{int(time.time() * 1000)}",
                "file_path": "api_request",
                "metadata": {
                    "image_width": image_width,
                    "image_height": image_height,
                    "camera_intrinsics": None
                },
                "free_path": None,
                "obstacles": objects
            }
            
            # Initialize or reuse translator
            if self.translator is None:
                # Save temporary detection JSON only for initialization
                with open(self.temp_json_path, 'w') as f:
                    json.dump(detection_data, f)
                    
                self.translator = Translator(
                    self.temp_json_path,
                    self.shapes_path,
                    self.params_path,
                    None,
                    self.output_dir
                )
                
                # Ensure canvas_size matches input image (no scaling needed)
                self.translator.params['canvas_size'] = [image_height, image_width]
                logger.debug(f"📐 Translator initialized: input={image_width}x{image_height}, canvas_size={self.translator.params['canvas_size']}")
            else:
                # Update bundle directly in memory (no file I/O)
                self.translator.bundle = detection_data
                
                # Update dimensions
                self.translator.input_width = image_width
                self.translator.input_height = image_height
                self.translator.canvas_size = (image_width, image_height)
                
                # CRITICAL: Update params canvas_size to match (format: [H, W])
                self.translator.params['canvas_size'] = [image_height, image_width]
                
                logger.debug(f"📐 Translator dimensions updated: input={image_width}x{image_height}, canvas_size={self.translator.params['canvas_size']}")
            
            # Update threshold parameters
            self.translator.params['T_min'] = t_min
            self.translator.params['K_min'] = k_min
            self.translator.params['K_max'] = k_max
            
            # Generate output
            timestamp = int(time.time() * 1000)
            output_filename = f"api_frame_{timestamp}.png"
            
            # Measure translator time
            translator_start = time.time()
            # Get canvas array directly (no disk I/O)
            translator_output, _ = self.translator.run(output_filename, save_to_disk=False)
            translator_time = (time.time() - translator_start) * 1000
            
            # Use canvas array directly (already in memory)
            decode_start = time.time()
            # Convert to grayscale and binarize
            translator_output_gray = cv2.cvtColor(translator_output, cv2.COLOR_BGR2GRAY)
            _, translator_output_binary = cv2.threshold(translator_output_gray, 127, 255, cv2.THRESH_BINARY)
            decode_time = (time.time() - decode_start) * 1000
                
            # Resize to 128x128 for Pipeline2 (expected input size)
            resize_start = time.time()
            if translator_output_binary.shape != (128, 128):
                translator_output_resized = cv2.resize(translator_output_binary, (128, 128), interpolation=cv2.INTER_LINEAR)
            else:
                translator_output_resized = translator_output_binary
            resize_time = (time.time() - resize_start) * 1000
            
            # Optionally save translator output before phosphene simulation
            if save_debug_images:
                pre_phosphene_filename = f"phosphene_input_{timestamp}.png"
                pre_phosphene_path = os.path.join(self.output_dir, pre_phosphene_filename)
                cv2.imwrite(pre_phosphene_path, translator_output_resized)
                logger.info(f"Saved translator output: {pre_phosphene_path}")

            # Normalize to 0-1 range for Pipeline2 (neural network expects normalized input)
            translator_output_normalized = translator_output_resized.astype(np.float32) / 255.0

            # Pass through Pipeline2 for phosphene simulation
            phosphene_start = time.time()
            phosphene_img = self.pipeline2.input2phosphenes(translator_output_normalized)
            phosphene_time = (time.time() - phosphene_start) * 1000
            
            # Scale output back to 0-255 range for visualization
            phosphene_img_scaled = np.clip(phosphene_img * 255.0, 0, 255).astype(np.uint8)
            
            # Optionally save phosphene output
            if save_debug_images:
                phosphene_filename = f"phosphene_output_{timestamp}.png"
                phosphene_path = os.path.join(self.output_dir, phosphene_filename)
                cv2.imwrite(phosphene_path, phosphene_img_scaled)
                logger.info(f"Saved phosphene image: {phosphene_path}")
            
            # Encode phosphene output
            encode_start = time.time()
            _, buffer = cv2.imencode('.png', phosphene_img_scaled)
            
            if return_bytes:
                phosphene_output = buffer.tobytes()
            else:
                phosphene_output = base64.b64encode(buffer).decode('utf-8')
            
            encode_time = (time.time() - encode_start) * 1000
            
            # Get selected objects
            selected_objects = self._get_selected_objects()
            
            processing_time = (time.time() - start_time) * 1000
            
            metadata = {
                "processing_time_ms": round(processing_time, 2),
                "timing_breakdown": {
                    "translator_ms": round(translator_time, 2),
                    "decode_ms": round(decode_time, 2),
                    "resize_ms": round(resize_time, 2),
                    "phosphene_simulation_ms": round(phosphene_time, 2),
                    "encode_ms": round(encode_time, 2),
                    "total_ms": round(processing_time, 2)
                },
                "selected_count": len(selected_objects),
                "total_objects": len(objects),
                "thresholds": {
                    "t_min": t_min,
                    "k_min": k_min,
                    "k_max": k_max
                }
            }
            
            return phosphene_output, selected_objects, metadata
        
        except Exception as e:
            logger.error(f"Translation error: {e}")
            raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")
    
    def _get_selected_objects(self) -> List[Dict[str, Any]]:
        """Get list of selected objects with scores"""
        if not self.translator:
            return []
        
        try:
            selected = self.translator.select_objects()
            
            result = []
            for obj in selected:
                result.append({
                    "class": obj.get("class", "unknown"),
                    "score": obj.get("score", 0.0),
                    "distance_m": obj.get("distance_m", obj.get("depth")),
                    "bbox": obj.get("bbox", []),
                    "confidence": obj.get("confidence", 1.0)
                })
            
            return result
        
        except Exception as e:
            logger.error(f"Error getting selected objects: {e}")
            return []
    
    def is_ready(self) -> bool:
        """Check if translator is ready"""
        return (os.path.exists(self.shapes_path) and 
                os.path.exists(self.params_path))
    
    def get_params(self) -> Dict[str, Any]:
        """Get current translator parameters"""
        if self.translator and hasattr(self.translator, 'params'):
            return {
                'T_min': self.translator.params.get('T_min'),
                'K_min': self.translator.params.get('K_min'),
                'K_max': self.translator.params.get('K_max'),
                'canvas_size': self.translator.params.get('canvas_size')
            }
        return {}
