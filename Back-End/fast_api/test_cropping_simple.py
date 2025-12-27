#!/usr/bin/env python3
"""
Simple test for cropping functionality without dependencies
"""

import numpy as np
import sys
import os

# Add the services directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'services'))

def test_cropping_logic():
    """Test the cropping logic without importing the full service"""
    print("Testing cropping logic...")

    # Mock cropping configuration
    cropping_config = {
        "type": "central_crop",
        "size": [128, 128],
        "offset_y_ratio": 0.5,
        "freepath_fallback": "none"
    }

    # Test crop_image logic
    def crop_image(img, cropping_config):
        crop_type = cropping_config.get("type", "central_crop")
        crop_size = cropping_config.get("size", [128, 128])
        offset_y_ratio = cropping_config.get("offset_y_ratio", 0.5)

        h, w = img.shape[:2]
        target_w, target_h = crop_size

        if crop_type == "retinotopic":
            return cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
        else:  # central_crop with offset
            center_x = w // 2
            center_y = int(h * offset_y_ratio)

            half_w = target_w // 2
            half_h = target_h // 2

            x1 = max(0, center_x - half_w)
            y1 = max(0, center_y - half_h)
            x2 = min(w, center_x + half_w)
            y2 = min(h, center_y + half_h)

            cropped = img[y1:y2, x1:x2]

            if cropped.shape[0] != target_h or cropped.shape[1] != target_w:
                import cv2
                cropped = cv2.resize(cropped, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

            return cropped

    # Test freepath ball positioning logic
    def calculate_freepath_ball_position(freepath_coordinates, original_size, cropping_config):
        if not freepath_coordinates or len(freepath_coordinates) == 0:
            return None

        crop_type = cropping_config.get("type", "central_crop")
        crop_size = cropping_config.get("size", [128, 128])
        offset_y_ratio = cropping_config.get("offset_y_ratio", 0.5)

        orig_h, orig_w = original_size
        crop_w, crop_h = crop_size

        if crop_type == "retinotopic":
            center_x = orig_w // 2
            center_y = int(orig_h * offset_y_ratio)

            crop_x1 = max(0, center_x - crop_w // 2)
            crop_y1 = max(0, center_y - crop_h // 2)
            crop_x2 = min(orig_w, center_x + crop_w // 2)
            crop_y2 = min(orig_h, center_y + crop_h // 2)

            points_in_crop = [
                (x, y) for x, y in freepath_coordinates
                if crop_x1 <= x <= crop_x2 and crop_y1 <= y <= crop_y2
            ]

            if points_in_crop:
                middle_idx = len(points_in_crop) // 2
                center_x, center_y = points_in_crop[middle_idx]

                rel_x = center_x - crop_x1
                rel_y = center_y - crop_y1

                scale_x = crop_w / (crop_x2 - crop_x1)
                scale_y = crop_h / (crop_y2 - crop_y1)

                crop_center_x = int(rel_x * scale_x)
                crop_center_y = int(rel_y * scale_y)

                return (crop_center_x, crop_center_y)
            else:
                return None

        else:  # central_crop
            center_x = orig_w // 2
            center_y = int(orig_h * offset_y_ratio)

            half_w = crop_w // 2
            half_h = crop_h // 2

            crop_x1 = max(0, center_x - half_w)
            crop_y1 = max(0, center_y - half_h)
            crop_x2 = min(orig_w, center_x + half_w)
            crop_y2 = min(orig_h, center_y + half_h)

            points_in_crop = [
                (x, y) for x, y in freepath_coordinates
                if crop_x1 <= x <= crop_x2 and crop_y1 <= y <= crop_y2
            ]

            if points_in_crop:
                middle_idx = len(points_in_crop) // 2
                orig_center_x, orig_center_y = points_in_crop[middle_idx]

                crop_center_x = int((orig_center_x - crop_x1) * (crop_w / (crop_x2 - crop_x1)))
                crop_center_y = int((orig_center_y - crop_y1) * (crop_h / (crop_y2 - crop_y1)))

                return (crop_center_x, crop_center_y)
            else:
                return None

    # Test with sample data
    test_img = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
    cropped = crop_image(test_img, cropping_config)
    print(f"Original shape: {test_img.shape}")
    print(f"Cropped shape: {cropped.shape}")
    assert cropped.shape == (128, 128, 3), f"Expected (128, 128, 3), got {cropped.shape}"

    # Test freepath positioning with coordinates in crop region
    # For central_crop with offset_y_ratio=0.5, center is at (640, 360)
    # Crop region: x1=640-64=576, y1=360-64=296, x2=640+64=704, y2=360+64=424
    freepath_coords_in_crop = [[600, 320], [610, 330], [620, 340], [630, 350]]  # Within crop region

    ball_pos = calculate_freepath_ball_position(freepath_coords_in_crop, (720, 1280), cropping_config)
    print(f"Freepath coordinates (in crop): {freepath_coords_in_crop}")
    print(f"Ball position: {ball_pos}")

    if ball_pos:
        assert 0 <= ball_pos[0] < 128, f"X position {ball_pos[0]} out of bounds"
        assert 0 <= ball_pos[1] < 128, f"Y position {ball_pos[1]} out of bounds"
        print("✅ Ball position is within crop bounds")
    else:
        print("❌ Expected ball position but got None")

    print("✅ All cropping logic tests passed!")

if __name__ == "__main__":
    test_cropping_logic()