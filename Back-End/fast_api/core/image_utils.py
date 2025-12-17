"""
Image Utility Functions

Helper functions for image encoding/decoding and processing.
"""

import logging
import base64
import cv2
import numpy as np
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def decode_base64_image(base64_string: str) -> np.ndarray:
    """
    Decode base64 string to OpenCV image
    
    Args:
        base64_string: Base64 encoded image data
        
    Returns:
        OpenCV image (numpy array)
    """
    try:
        logger.info(f"📥 [RECEIVE] RGB base64 length: {len(base64_string)}, prefix: {base64_string[:30]}")
        
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64
        img_data = base64.b64decode(base64_string)
        logger.info(f"📥 [DECODE] RGB bytes length: {len(img_data)}")
        
        # Convert to numpy array
        nparr = np.frombuffer(img_data, np.uint8)
        
        # Decode image
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        logger.info(f"📥 [IMAGE] RGB decoded: {img.shape if img is not None else 'FAILED'}, dtype: {img.dtype if img is not None else 'N/A'}")
        
        if img is None:
            raise ValueError("Failed to decode image")
        
        return img
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")


def decode_depth_map(depth_base64: str) -> np.ndarray:
    """
    Decode depth map from base64
    
    Supports multiple formats:
    - PNG/JPEG image (grayscale, will be normalized to meters)
    - Raw numpy array (float32 or uint16)
    - EXR format (32-bit float depth)
    
    Args:
        depth_base64: Base64 encoded depth data
        
    Returns:
        2D numpy array of depth values in meters
    """
    try:
        logger.info(f"📥 [RECEIVE] Depth base64 length: {len(depth_base64)}, prefix: {depth_base64[:30]}")
        
        # Remove data URL prefix if present
        if ',' in depth_base64:
            depth_base64 = depth_base64.split(',')[1]
        
        depth_data = base64.b64decode(depth_base64)
        logger.info(f"📥 [DECODE] Depth bytes length: {len(depth_data)}")
        
        # Try to decode as image first (PNG, JPEG, EXR)
        nparr = np.frombuffer(depth_data, np.uint8)
        depth_map = cv2.imdecode(nparr, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_GRAYSCALE)
        
        if depth_map is not None:
            logger.info(f"📥 [IMAGE] Depth decoded as image: {depth_map.shape}, dtype: {depth_map.dtype}")
            
            # Log depth statistics
            non_zero_count = np.count_nonzero(depth_map)
            total_pixels = depth_map.size
            logger.info(f"📊 [DEPTH STATS] Non-zero pixels: {non_zero_count}/{total_pixels} ({100*non_zero_count/total_pixels:.1f}%), min: {depth_map.min()}, max: {depth_map.max()}, mean: {depth_map[depth_map>0].mean() if non_zero_count > 0 else 0:.2f}")
            
            # Convert to float32
            depth_map = depth_map.astype(np.float32)
            
            # If image is 8-bit or 16-bit, normalize to reasonable depth range
            if depth_map.max() > 100:  # Likely pixel values, not meters
                depth_map = depth_map / depth_map.max() * 10.0  # Normalize to 0-10m range
            
            return depth_map
        
        # Try as raw numpy array (float32)
        try:
            depth_array = np.frombuffer(depth_data, dtype=np.float32)
            # This will be a 1D array, caller must reshape if needed
            logger.info(f"Decoded raw depth array: {depth_array.shape}")
            return depth_array
        except:
            pass
        
        raise ValueError("Could not decode depth map as image or numpy array")
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid depth map data: {str(e)}")


def save_debug_images(
    frame: np.ndarray,
    depth_map: np.ndarray,
    phosphene_image: np.ndarray,
    timestamp: str,
    detections: list = None,
    output_dir: str = None
) -> bool:
    """
    Save RGB, depth, and phosphene images for debugging
    
    Args:
        frame: RGB image (BGR format from OpenCV)
        depth_map: Depth map (grayscale or float)
        phosphene_image: Processed phosphene output
        timestamp: Timestamp string for filename
        detections: List of detections with bounding boxes (optional)
        output_dir: Output directory path (optional)
    
    Returns:
        True if successful, False otherwise
    """
    try:
        import os
        
        # Create output directory if it doesn't exist
        if output_dir is None:
            output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "api_output", "debug_frames")
        os.makedirs(output_dir, exist_ok=True)
        
        # Save RGB image (before processing)
        rgb_path = os.path.join(output_dir, f"rgb_before_{timestamp}.png")
        cv2.imwrite(rgb_path, frame)
        logger.info(f"💾 Saved RGB (before): {rgb_path}")
        
        # Save RGB with bounding boxes overlaid
        if detections:
            frame_with_boxes = frame.copy()
            for det in detections:
                bbox = det.get('bbox', [0, 0, 0, 0])  # [x, y, w, h]
                x, y, w, h = [int(v) for v in bbox]
                # Draw rectangle
                cv2.rectangle(frame_with_boxes, (x, y), (x + w, y + h), (0, 255, 0), 2)
                # Draw label
                label = f"{det.get('class', 'unknown')} {det.get('confidence', 0):.2f}"
                cv2.putText(frame_with_boxes, label, (x, y - 5), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
            
            rgb_boxes_path = os.path.join(output_dir, f"rgb_with_boxes_{timestamp}.png")
            cv2.imwrite(rgb_boxes_path, frame_with_boxes)
            logger.info(f"💾 Saved RGB with boxes: {rgb_boxes_path}")
        
        # Save depth map (before processing)
        if depth_map is not None:
            depth_path = os.path.join(output_dir, f"depth_before_{timestamp}.png")
            # Normalize depth for visualization
            depth_vis = cv2.normalize(depth_map, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
            cv2.imwrite(depth_path, depth_vis)
            logger.info(f"💾 Saved Depth (before): {depth_path}")
        
        # Save phosphene image (after processing)
        if phosphene_image is not None:
            phosphene_path = os.path.join(output_dir, f"phosphene_after_{timestamp}.png")
            cv2.imwrite(phosphene_path, phosphene_image)
            logger.info(f"💾 Saved Phosphene (after): {phosphene_path}")
        
        return True
    except Exception as e:
        logger.error(f"❌ Failed to save debug images: {str(e)}")
        return False
