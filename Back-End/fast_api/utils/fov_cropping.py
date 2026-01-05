"""
FoV-Based Image Cropping Utility

This module provides Field of View (FoV) based cropping functionality using
camera intrinsics from Intel RealSense D435.

Functionality:
- Crops input image (1280×720) to specified FoV angle (e.g., 30 degrees)
- Produces variable-size output based on FoV (30° → ~373×349px, 45° → ~577×539px)
- Supports vertical offset control for FoV region positioning
- Uses camera intrinsics for accurate angular to pixel conversion

Author: Dawn Pilot Team
Date: January 2026
"""

import numpy as np
import math
from typing import Dict, Any, Tuple
import logging

logger = logging.getLogger(__name__)


# Default camera intrinsics for Intel RealSense D435
DEFAULT_CAMERA_INTRINSICS = {
    "fx": 696.0,          # Focal length X (calculated from FoV)
    "fy": 649.5,          # Focal length Y (calculated from FoV)
    "cx": 640.0,          # Principal point X (image center)
    "cy": 360.0,          # Principal point Y (image center)
    "width": 1280,        # Image width in pixels
    "height": 720,        # Image height in pixels
    "horizontal_fov": 85.2,  # Maximum horizontal FoV in degrees
    "vertical_fov": 58.0     # Maximum vertical FoV in degrees
}


class FoVCropper:
    """
    Field of View based image cropping using camera intrinsics.
    
    This class handles cropping an input image to a specific field of view angle,
    taking into account camera parameters and optional vertical offset.
    """
    
    def __init__(self, camera_intrinsics: Dict[str, float] = None):
        """
        Initialize FoV cropper with camera intrinsics.
        
        Args:
            camera_intrinsics: Dictionary containing camera parameters.
                             If None, uses Intel RealSense D435 defaults.
        """
        self.intrinsics = camera_intrinsics or DEFAULT_CAMERA_INTRINSICS.copy()
        
        # Extract intrinsics for quick access
        self.fx = self.intrinsics.get("fx", 696.0)
        self.fy = self.intrinsics.get("fy", 649.5)
        self.cx = self.intrinsics.get("cx", 640.0)
        self.cy = self.intrinsics.get("cy", 360.0)
        self.max_h_fov = self.intrinsics.get("horizontal_fov", 85.2)
        self.max_v_fov = self.intrinsics.get("vertical_fov", 58.0)
    
    def crop_to_fov(
        self, 
        img: np.ndarray, 
        fov_degrees: float = 30.0,
        offset_y_ratio: float = 0.5,
        warn_on_clamp: bool = True
    ) -> np.ndarray:
        """
        Crop image to specified field of view with optional vertical offset.
        
        Process:
        1. Pre-crop input image to square (720×720 from 1280×720)
        2. Calculate FoV boundaries using camera intrinsics and trigonometry
        3. Apply vertical offset to FoV center (0.0=top, 0.5=center, 1.0=bottom)
        4. Crop to FoV region without resizing (variable output size)
        
        Args:
            img: Input image (H, W, 3) or (H, W), typically 1280×720
            fov_degrees: Desired field of view in degrees (default 30°)
            offset_y_ratio: Vertical offset ratio 0.0-1.0 (default 0.5 = center)
            warn_on_clamp: Whether to log warning if FoV exceeds camera limits
            
        Returns:
            np.ndarray: Cropped image with variable size based on FoV
                       Example sizes:
                       - 30° FoV → ~373×349 pixels
                       - 45° FoV → ~577×539 pixels
                       - 60° FoV → ~795×742 pixels
        
        Raises:
            ValueError: If input image dimensions are invalid
        """
        h, w = img.shape[:2]
        
        if h <= 0 or w <= 0:
            raise ValueError(f"Invalid image dimensions: {h}×{w}")
        
        # Clamp FoV to camera limits
        fov_deg = min(fov_degrees, self.max_h_fov, self.max_v_fov)
        if fov_deg != fov_degrees and warn_on_clamp:
            logger.warning(
                f"Requested FoV {fov_degrees}° clamped to {fov_deg}° (camera limit: "
                f"H={self.max_h_fov}°, V={self.max_v_fov}°)"
            )
        
        # Pre-compute trigonometry for speed
        half_fov_rad = math.radians(fov_deg / 2)
        tan_half = math.tan(half_fov_rad)
        fov_px_h = tan_half * self.fx  # Horizontal FoV in pixels
        fov_px_v = tan_half * self.fy  # Vertical FoV in pixels
        
        # Step 1: Pre-crop to square (720×720 centered from 1280×720)
        # This removes 280 pixels from left and right sides
        square_size = min(h, w)
        crop_x1 = (w - square_size) // 2  # For 1280×720: (1280-720)//2 = 280
        crop_x2 = crop_x1 + square_size   # 280 + 720 = 1000
        crop_y1 = (h - square_size) // 2  # For 1280×720: (720-720)//2 = 0
        crop_y2 = crop_y1 + square_size   # 0 + 720 = 720
        
        square_img = img[crop_y1:crop_y2, crop_x1:crop_x2]
        
        # Step 2: Calculate FoV boundaries within square coordinates
        # Adjust camera center for square crop
        new_cx = self.cx - crop_x1  # 640 - 280 = 360
        new_cy = self.cy - crop_y1  # 360 - 0 = 360
        
        # Apply vertical offset to FoV center
        # offset_y_ratio: 0.0 = top, 0.5 = center, 1.0 = bottom
        # Shift by up to ±half the square size
        offset_cy = new_cy + (offset_y_ratio - 0.5) * square_size * 0.5
        
        # Calculate FoV boundaries in square coordinate system
        fov_x1 = max(0, int(new_cx - fov_px_h))
        fov_x2 = min(square_size, int(new_cx + fov_px_h))
        fov_y1 = max(0, int(offset_cy - fov_px_v))
        fov_y2 = min(square_size, int(offset_cy + fov_px_v))
        
        # Step 3: Crop to FoV region - NO RESIZING for variable output
        fov_crop = square_img[fov_y1:fov_y2, fov_x1:fov_x2]
        
        return fov_crop
    
    def get_fov_size_estimate(self, fov_degrees: float) -> Tuple[int, int]:
        """
        Estimate output size for given FoV without processing an image.
        
        Args:
            fov_degrees: Desired field of view in degrees
            
        Returns:
            Tuple[int, int]: Estimated (width, height) in pixels
        """
        # Clamp FoV to camera limits
        fov_deg = min(fov_degrees, self.max_h_fov, self.max_v_fov)
        
        # Calculate FoV in pixels
        half_fov_rad = math.radians(fov_deg / 2)
        tan_half = math.tan(half_fov_rad)
        fov_px_h = tan_half * self.fx
        fov_px_v = tan_half * self.fy
        
        # Estimate size (2× because we go from center to both sides)
        estimated_w = int(2 * fov_px_h)
        estimated_h = int(2 * fov_px_v)
        
        return (estimated_w, estimated_h)


def crop_image_to_fov(
    img: np.ndarray,
    fov_degrees: float = 30.0,
    offset_y_ratio: float = 0.5,
    camera_intrinsics: Dict[str, float] = None
) -> np.ndarray:
    """
    Convenience function to crop image to specified FoV.
    
    This is a standalone function that creates a FoVCropper instance
    and performs the cropping in one call.
    
    Args:
        img: Input image (H, W, 3) or (H, W), typically 1280×720
        fov_degrees: Desired field of view in degrees (default 30°)
        offset_y_ratio: Vertical offset ratio 0.0-1.0 (default 0.5 = center)
        camera_intrinsics: Camera parameters dict, uses defaults if None
        
    Returns:
        np.ndarray: Cropped image with variable size based on FoV
    
    Example:
        >>> import cv2
        >>> img = cv2.imread('frame.jpg')  # 1280×720
        >>> cropped = crop_image_to_fov(img, fov_degrees=30)
        >>> print(cropped.shape)  # (~349, ~373) for 30° FoV
    """
    cropper = FoVCropper(camera_intrinsics)
    return cropper.crop_to_fov(img, fov_degrees, offset_y_ratio)


# Preprocessing utilities
def preprocess_image_for_fov_crop(img: np.ndarray) -> np.ndarray:
    """
    Preprocess image before FoV cropping.
    
    Currently a pass-through function, but can be extended for:
    - Color space conversion
    - Normalization
    - Distortion correction
    
    Args:
        img: Input image
        
    Returns:
        np.ndarray: Preprocessed image
    """
    # No preprocessing needed for basic FoV cropping
    # Image can be RGB, BGR, or grayscale
    return img


def postprocess_fov_crop(img: np.ndarray) -> np.ndarray:
    """
    Postprocess image after FoV cropping.
    
    Currently a pass-through function, but can be extended for:
    - Resizing to fixed size
    - Normalization for neural network input
    - Enhancement
    
    Args:
        img: Cropped image from FoV operation
        
    Returns:
        np.ndarray: Postprocessed image
    """
    # No postprocessing needed for basic FoV cropping
    # Output maintains variable size based on FoV
    return img


# Example usage and testing
if __name__ == "__main__":
    import cv2
    
    # Example: Create test image
    test_img = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
    
    # Initialize cropper with default Intel RealSense D435 intrinsics
    cropper = FoVCropper()
    
    # Test different FoV angles
    for fov in [30, 45, 60]:
        cropped = cropper.crop_to_fov(test_img, fov_degrees=fov)
        estimated_size = cropper.get_fov_size_estimate(fov)
        print(f"{fov}° FoV:")
        print(f"  Actual size: {cropped.shape[1]}×{cropped.shape[0]}")
        print(f"  Estimated size: {estimated_size[0]}×{estimated_size[1]}")
        print()
    
    # Test with vertical offset
    print("Testing vertical offset (30° FoV):")
    for offset_name, offset_val in [("Top", 0.0), ("Center", 0.5), ("Bottom", 1.0)]:
        cropped = cropper.crop_to_fov(test_img, fov_degrees=30, offset_y_ratio=offset_val)
        print(f"  {offset_name} (offset={offset_val}): {cropped.shape[1]}×{cropped.shape[0]}")
