"""
Image Utility Functions

Helper functions for image encoding/decoding and processing.

COLOR SPACE CONVENTIONS:
- decode_base64_to_rgb(): Returns RGB format (for ML models)
- decode_base64_image(): Returns BGR format (for OpenCV operations, legacy)
- encode_ndarray_to_base64(): Accepts RGB or BGR, specify color_space parameter
"""

import logging
import base64
import cv2
import numpy as np
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def decode_base64_to_rgb(base64_string: str) -> np.ndarray:
    """
    Decode base64 string to RGB numpy array (optimized for ML models)
    
    Args:
        base64_string: Base64 encoded image data (with or without data URL prefix)
        
    Returns:
        np.ndarray: RGB image (H, W, 3) in uint8 format
        
    Notes:
        - Returns RGB format (not BGR) for direct use with ML models
        - Faster than decode_base64_image() + color conversion
    """
    try:
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64 to bytes
        img_bytes = base64.b64decode(base64_string)
        
        # Decode to numpy array (BGR format from cv2.imdecode)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img_bgr is None:
            raise ValueError("Failed to decode image")
        
        # Convert BGR to RGB
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        
        return img_rgb
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")


def decode_base64_image(base64_string: str) -> np.ndarray:
    """
    Decode base64 string to OpenCV image (BGR format, legacy compatibility)
    
    Args:
        base64_string: Base64 encoded image data
        
    Returns:
        np.ndarray: BGR image (H, W, 3) in uint8 format (OpenCV default)
        
    Notes:
        - Returns BGR format for backward compatibility
        - Consider using decode_base64_to_rgb() for ML pipelines
    """
    try:
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64
        img_data = base64.b64decode(base64_string)
        
        # Convert to numpy array
        nparr = np.frombuffer(img_data, np.uint8)
        
        # Decode image (returns BGR)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("Failed to decode image")
        
        return img
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")




def encode_ndarray_to_base64(img: np.ndarray, color_space: str = 'RGB', format: str = '.png') -> str:
    """
    Encode numpy array to base64 string (optimized - minimal conversions)
    
    Args:
        img: Numpy array image (H, W, 3) or (H, W)
        color_space: 'RGB' or 'BGR' - specifies input color space
        format: Image format ('.png', '.jpg')
        
    Returns:
        str: Base64 encoded image string (without data URL prefix)
        
    Notes:
        - If img is RGB and you need PNG output, it will convert RGB->BGR once
        - If img is already BGR, no conversion needed
        - For grayscale images, color_space is ignored
    """
    try:
        # Validate input image
        if img is None:
            raise ValueError("Input image is None")
        if img.size == 0:
            raise ValueError("Input image is empty (size=0)")
        if not isinstance(img, np.ndarray):
            raise ValueError(f"Input must be numpy array, got {type(img)}")
        
        # Handle color conversion for color images
        if len(img.shape) == 3 and img.shape[2] == 3:
            # Convert RGB to BGR if needed (cv2.imencode expects BGR)
            if color_space == 'RGB':
                img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            # If already BGR, no conversion needed

        # if the image is grayscale, no color conversion needed
        
        # Encode to PNG/JPG bytes
        success, buffer = cv2.imencode(format, img)
        if not success:
            raise ValueError(f"Failed to encode image to {format}. Image shape: {img.shape}, dtype: {img.dtype}")
        
        # Convert to base64
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return img_base64
    
    except Exception as e:
        logger.error(f"Failed to encode image to base64: {e}")
        raise HTTPException(status_code=500, detail=f"Image encoding error: {str(e)}")


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


def add_frame_id_overlay(
    img: np.ndarray,
    frame_id: int,
    position: tuple = (15, 5),
    color: tuple = (0, 0, 255),  # Red in BGR
    font_scale: float = 0.15,
    thickness: int = 1,
    outline_color: tuple = (0, 0, 0)  # Black outline
) -> np.ndarray:
    """
    Add frame ID text overlay to image (top-left corner by default)
    
    Args:
        img: Input image (BGR or grayscale numpy array)
        frame_id: Frame identifier (will be formatted as "F: {frame_id}")
        position: (x, y) position for text in pixels (default: top-left with margin)
        color: Text color in BGR format (default: red)
        font_scale: Font size multiplier (default: 0.15 for very small)
        thickness: Text thickness in pixels (default: 1)
        outline_color: Outline color for better readability (default: black)
        
    Returns:
        np.ndarray: Image with frame ID overlay (same dtype and shape as input)
        
    Notes:
        - Creates a copy of the image (non-destructive)
        - Draws black outline first, then colored text on top for readability
        - Works with both grayscale and color images
    """
    # Create copy to avoid modifying original
    img_with_text = img.copy()
    
    # Format frame ID text
    text = f"F: {frame_id}"
    
    # Font settings
    font = cv2.FONT_HERSHEY_SIMPLEX
    
    # Draw black outline for better readability (thicker)
    cv2.putText(
        img_with_text,
        text,
        position,
        font,
        font_scale,
        outline_color,
        thickness + 2,  # Thicker for outline
        cv2.LINE_AA
    )
    
    # Draw colored text on top
    cv2.putText(
        img_with_text,
        text,
        position,
        font,
        font_scale,
        color,
        thickness,
        cv2.LINE_AA
    )
    
    return img_with_text
