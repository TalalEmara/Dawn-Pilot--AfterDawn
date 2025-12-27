#!/usr/bin/env python3
"""
Standalone Cropping Functions for Testing

Core cropping logic extracted from NavigationDetectorService for independent testing.
No dependencies on ML models or full pipeline - just pure image processing.

IMPORTANT FIXES:
1. Phosphene input preparation: Converts BGR images to grayscale before phosphene pipeline
   Prevents "Expected 3D (unbatched) or 4D (batched) input to conv2d" tensor dimension errors

2. Translator output logic: Freepath ball is drawn on full resolution image before cropping
   Ensures ball positioning works correctly with both central_crop and retinotopic modes
"""

import numpy as np
import cv2
import json
from typing import List, Tuple, Optional, Dict, Any


def calculate_crop_region(original_size: Tuple[int, int], cropping_config: Dict[str, Any]) -> Tuple[int, int, int, int]:
    """
    Calculate the crop region based on cropping configuration.

    Args:
        original_size: (height, width) of original image
        cropping_config: Configuration dict with type, size, offset_y_ratio, etc.

    Returns:
        (x1, y1, x2, y2) crop boundaries
    """
    height, width = original_size
    crop_size = cropping_config['size']
    crop_width, crop_height = crop_size

    if cropping_config['type'] == 'central_crop':
        # Calculate center with vertical offset
        center_x = width // 2
        offset_y_ratio = cropping_config.get('offset_y_ratio', 0.5)
        center_y = int(height * offset_y_ratio)

        # Calculate crop boundaries
        x1 = max(0, center_x - crop_width // 2)
        y1 = max(0, center_y - crop_height // 2)
        x2 = min(width, x1 + crop_width)
        y2 = min(height, y1 + crop_height)

        # Adjust if we went out of bounds
        if x2 - x1 < crop_width:
            x1 = max(0, width - crop_width)
            x2 = x1 + crop_width
        if y2 - y1 < crop_height:
            y1 = max(0, height - crop_height)
            y2 = y1 + crop_height

        return (x1, y1, x2, y2)
    else:
        # Retinotopic mapping (full image)
        return (0, 0, width, height)


def crop_image(image: np.ndarray, cropping_config: Dict[str, Any]) -> np.ndarray:
    """
    Crop an image according to the cropping configuration.

    Args:
        image: Input image as numpy array (H, W, C)
        cropping_config: Cropping configuration

    Returns:
        Cropped image as numpy array
    """
    height, width = image.shape[:2]
    x1, y1, x2, y2 = calculate_crop_region((height, width), cropping_config)

    # Perform the crop
    cropped = image[y1:y2, x1:x2]

    # If cropping config specifies a target size, resize
    if cropping_config['type'] == 'central_crop':
        target_width, target_height = cropping_config['size']
        if cropped.shape[1] != target_width or cropped.shape[0] != target_height:
            cropped = cv2.resize(cropped, (target_width, target_height), interpolation=cv2.INTER_LINEAR)

    return cropped


def calculate_freepath_ball_position(freepath_coords: List[List[int]],
                                   original_size: Tuple[int, int],
                                   cropping_config: Dict[str, Any]) -> Optional[Tuple[int, int]]:
    """
    Calculate the freepath ball position for the cropped region.

    For retinotopic: Uses simple retinotopic scaling.
    For central_crop: Finds freepath points within the crop region and maps to canvas coordinates.

    Args:
        freepath_coords: List of [x, y] freepath centerline points
        original_size: (height, width) of original image
        cropping_config: Cropping configuration

    Returns:
        (x, y) position for freepath ball in cropped coordinates, or None
    """
    if not freepath_coords or len(freepath_coords) == 0:
        return None

    crop_type = cropping_config.get("type", "central_crop")
    crop_size = cropping_config.get("size", [128, 128])
    offset_y_ratio = cropping_config.get("offset_y_ratio", 0.5)

    orig_h, orig_w = original_size
    crop_w, crop_h = crop_size

    if crop_type == "retinotopic":
        # For retinotopic mapping, use simple scaling
        xs = [x for x, y in freepath_coords]
        ys = [y for x, y in freepath_coords]
        center_x = sum(xs) / len(xs) if xs else orig_w // 2
        center_y = sum(ys) / len(ys) if ys else orig_h // 2

        scale_x = crop_w / orig_w
        scale_y = crop_h / orig_h
        crop_x = int(center_x * scale_x)
        crop_y = int(center_y * scale_y)

    else:  # central_crop
        # For central_crop, find points within the crop region and map to canvas coordinates
        center_x = orig_w // 2
        center_y = int(orig_h * offset_y_ratio)

        half_w = crop_w // 2
        half_h = crop_h // 2

        crop_x1 = max(0, center_x - half_w)
        crop_y1 = max(0, center_y - half_h)
        crop_x2 = min(orig_w, center_x + half_w)
        crop_y2 = min(orig_h, center_y + half_h)

        # Find freepath points within crop region
        points_in_crop = [
            (x, y) for x, y in freepath_coords
            if crop_x1 <= x <= crop_x2 and crop_y1 <= y <= crop_y2
        ]

        if points_in_crop:
            # Find the lowest point (highest Y) in the freepath within crop region
            lowest_point = max(points_in_crop, key=lambda p: p[1])  # p[1] is Y coordinate
            center_x, center_y = lowest_point

            # Map X coordinate to canvas coordinates (0-127)
            crop_x = int((center_x - crop_x1) * crop_w / (crop_x2 - crop_x1))
            # Position ball at the BOTTOM of the cropped image (highest Y in crop coordinates)
            crop_y = crop_h - 1
        else:
            # No points in crop region, don't draw the ball
            return None

    # Ensure within bounds
    crop_x = max(0, min(crop_w - 1, crop_x))
    crop_y = max(0, min(crop_h - 1, crop_y))

    return (crop_x, crop_y)


def draw_freepath_ball(image: np.ndarray, ball_position: Optional[Tuple[int, int]],
                      ball_color: Tuple[int, int, int] = (0, 255, 0),
                      ball_radius: int = 8) -> np.ndarray:
    """
    Draw the freepath ball on the image at the specified position.

    Args:
        image: Input image
        ball_position: (x, y) position to draw ball, or None to skip
        ball_color: BGR color tuple for the ball
        ball_radius: Radius of the ball in pixels

    Returns:
        Image with ball drawn
    """
    if ball_position is None:
        return image

    result = image.copy()
    cv2.circle(result, ball_position, ball_radius, ball_color, -1)  # Filled circle
    cv2.circle(result, ball_position, ball_radius, (255, 255, 255), 2)  # White border

    return result


def prepare_phosphene_input(image: np.ndarray) -> np.ndarray:
    """
    Prepare image for phosphene pipeline input.

    IMPORTANT FIX: The phosphene pipeline (Pipeline2Integration.input2phosphenes)
    expects grayscale input, but the cropping pipeline produces BGR images.
    This function converts BGR to grayscale to prevent tensor dimension errors.

    Args:
        image: Input image (can be BGR or grayscale)

    Returns:
        Grayscale image ready for phosphene pipeline (H, W) shape

    Example:
        # Before fix: shape (128, 128, 3) -> Error in conv2d
        # After fix: shape (128, 128) -> Works correctly
    """
    if len(image.shape) == 3:
        # Convert BGR/RGB to grayscale for phosphene pipeline
        phosphene_input = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        # Already grayscale
        phosphene_input = image

    # Normalize to 0-1 range as expected by neural network
    phosphene_input_normalized = phosphene_input.astype(np.float32) / 255.0

    return phosphene_input_normalized


def create_test_image(width: int = 1280, height: int = 720) -> np.ndarray:
    """
    Create a test image with some visual elements for testing cropping.
    """
    # Create a gradient background
    image = np.zeros((height, width, 3), dtype=np.uint8)

    # Add some colored rectangles to simulate objects
    cv2.rectangle(image, (100, 100), (300, 200), (255, 0, 0), -1)  # Blue rectangle
    cv2.rectangle(image, (500, 300), (700, 400), (0, 255, 0), -1)  # Green rectangle
    cv2.rectangle(image, (900, 500), (1100, 600), (0, 0, 255), -1)  # Red rectangle

    # Add some text
    cv2.putText(image, "TEST IMAGE", (width//2 - 100, height//2),
                cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)

    return image


def test_cropping_functionality(debug: bool = False):
    """
    Comprehensive test of the cropping functionality.
    
    Args:
        debug: If True, print detailed test output
    """
    if debug:
        print("🧪 Testing Cropping Functionality")
        print("=" * 50)

    # Create test image
    test_image = create_test_image()
    if debug:
        print(f"✅ Created test image: {test_image.shape}")

    # Test configurations
    configs = [
        {
            'type': 'central_crop',
            'size': [128, 128],
            'offset_y_ratio': 0.5,  # Center
            'freepath_fallback': 'none'
        },
        {
            'type': 'central_crop',
            'size': [128, 128],
            'offset_y_ratio': 0.0,  # Top
            'freepath_fallback': 'none'
        },
        {
            'type': 'central_crop',
            'size': [128, 128],
            'offset_y_ratio': 1.0,  # Bottom
            'freepath_fallback': 'none'
        },
        {
            'type': 'retinotopic',
            'size': [128, 128],
            'offset_y_ratio': 0.5,
            'freepath_fallback': 'none'
        }
    ]

    # Test cropping
    for i, config in enumerate(configs):
        if debug:
            print(f"\n📋 Test {i+1}: {config['type']} (offset: {config.get('offset_y_ratio', 'N/A')})")

        # Calculate crop region
        region = calculate_crop_region((720, 1280), config)
        if debug:
            print(f"   Crop region: {region}")

        # Perform crop
        cropped = crop_image(test_image, config)
        if debug:
            print(f"   Cropped shape: {cropped.shape}")

        # Verify size
        if config['type'] == 'central_crop':
            assert cropped.shape[:2] == (128, 128), f"Expected (128, 128), got {cropped.shape[:2]}"
        else:
            assert cropped.shape[:2] == (720, 1280), f"Expected (720, 1280), got {cropped.shape[:2]}"

    # Test freepath positioning
    if debug:
        print("\n🎯 Testing Freepath Ball Positioning")
        print("-" * 30)

    freepath_scenarios = [
        # Points in center crop region (ball at bottom with X from lowest point)
        [[600, 320], [610, 330], [620, 340], [630, 350]],  # Expected: X from lowest point (630) -> 54, Y at bottom -> 127
        # Points outside crop region (no ball drawn)
        [[50, 50], [60, 60], [70, 70]],  # Expected: None
        # Empty freepath (should return None)
        []
    ]

    central_config = {
        'type': 'central_crop',
        'size': [128, 128],
        'offset_y_ratio': 0.5,
        'freepath_fallback': 'none'
    }

    for i, freepath_coords in enumerate(freepath_scenarios):
        if debug:
            print(f"   Scenario {i+1}: {len(freepath_coords)} points")
        ball_pos = calculate_freepath_ball_position(freepath_coords, (720, 1280), central_config)
        if debug:
            print(f"   Ball position: {ball_pos}")

        if len(freepath_coords) > 0:
            if i == 1:  # Scenario 2: points outside crop, expect None
                assert ball_pos is None, f"Expected None for points outside crop, got {ball_pos}"
                if debug:
                    print("   ✅ Correctly returned None for points outside crop")
            else:
                # Check bounds - scenarios with points in crop should return valid positions
                assert ball_pos is not None, f"Expected valid position for {len(freepath_coords)} points"
                assert 0 <= ball_pos[0] < 128, f"X position {ball_pos[0]} out of bounds"
                assert 0 <= ball_pos[1] < 128, f"Y position {ball_pos[1]} out of bounds"
                if debug:
                    print("   ✅ Position within bounds")
        else:
            assert ball_pos is None, "Expected None for empty freepath"
            if debug:
                print("   ✅ Correctly returned None for empty freepath")

    # Test ball drawing
    if debug:
        print("\n🎨 Testing Ball Drawing")
        print("-" * 20)

    test_crop = np.zeros((128, 128, 3), dtype=np.uint8)
    ball_pos = (64, 64)  # Center

    result = draw_freepath_ball(test_crop, ball_pos)
    if debug:
        print(f"   Drew ball at {ball_pos}")

    # Check that image changed (ball was drawn)
    diff = cv2.absdiff(result, test_crop)
    has_changes = np.any(diff > 0)
    assert has_changes, "Ball drawing didn't modify the image"
    if debug:
        print("   ✅ Ball successfully drawn on image")

    # Test phosphene input preparation
    if debug:
        print("\n🧠 Testing Phosphene Input Preparation")
        print("-" * 30)

    # Create BGR image with freepath ball (like simplified_with_circle)
    bgr_test_img = np.zeros((128, 128, 3), dtype=np.uint8)
    cv2.circle(bgr_test_img, (64, 64), 8, (0, 255, 0), -1)  # Green ball

    if debug:
        print(f"   Input BGR image shape: {bgr_test_img.shape}")

    # Prepare for phosphene pipeline
    phosphene_ready = prepare_phosphene_input(bgr_test_img)
    if debug:
        print(f"   Phosphene-ready shape: {phosphene_ready.shape}")
        print(f"   Value range: {phosphene_ready.min():.3f} - {phosphene_ready.max():.3f}")

    # Verify correct shape and range
    assert phosphene_ready.shape == (128, 128), f"Expected (128, 128), got {phosphene_ready.shape}"
    assert 0.0 <= phosphene_ready.min() <= phosphene_ready.max() <= 1.0, "Values should be in [0, 1] range"
    if debug:
        print("   ✅ Phosphene input preparation successful!")

    if debug:
        print("\n🎉 All tests passed!")
        print("=" * 50)


if __name__ == "__main__":
    import sys
    debug = len(sys.argv) > 1 and sys.argv[1] == "--debug"
    test_cropping_functionality(debug=debug)