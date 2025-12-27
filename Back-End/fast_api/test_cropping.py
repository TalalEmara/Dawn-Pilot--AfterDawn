#!/usr/bin/env python3
"""
Test script for cropping functionality

Tests the new cropping configuration and freepath ball positioning.
"""

import numpy as np
import cv2
import sys
import os

# Add the services directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'services'))

def test_cropping():
    """Test the cropping functionality"""
    print("Testing cropping functionality...")

    # Create a mock NavigationDetectorService instance
    from navigation_detector_service import NavigationDetectorService

    # Create a minimal instance for testing
    service = NavigationDetectorService.__new__(NavigationDetectorService)
    service.cropping_config = {
        "type": "central_crop",
        "size": [128, 128],
        "offset_y_ratio": 0.5,
        "freepath_fallback": "none"
    }

    # Test crop_image method
    # Create a test image (720x1280 RGB)
    test_img = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)

    # Test central cropping
    cropped = service.crop_image(test_img, service.cropping_config)
    print(f"Original image shape: {test_img.shape}")
    print(f"Cropped image shape: {cropped.shape}")
    assert cropped.shape == (128, 128, 3), f"Expected (128, 128, 3), got {cropped.shape}"

    # Test freepath ball positioning
    freepath_coords = [[400, 300], [410, 310], [420, 320], [430, 330]]  # Sample centerline
    original_size = (720, 1280)

    ball_pos = service._calculate_freepath_ball_position(
        freepath_coords, original_size, service.cropping_config
    )

    print(f"Freepath coordinates: {freepath_coords}")
    print(f"Ball position: {ball_pos}")

    if ball_pos:
        assert 0 <= ball_pos[0] < 128, f"X position {ball_pos[0]} out of bounds"
        assert 0 <= ball_pos[1] < 128, f"Y position {ball_pos[1]} out of bounds"
        print("✅ Ball position is within crop bounds")
    else:
        print("ℹ️  No ball position (expected for this test case)")

    # Test draw_freepath_ball
    test_canvas = np.zeros((128, 128, 3), dtype=np.uint8)
    if ball_pos:
        result = service.draw_freepath_ball(test_canvas, ball_pos, (128, 128))
        print(f"Drawing result shape: {result.shape}")
        assert result.shape == (128, 128, 3), f"Expected (128, 128, 3), got {result.shape}"
        print("✅ Freepath ball drawing works")

    print("✅ All cropping tests passed!")

if __name__ == "__main__":
    test_cropping()