#!/usr/bin/env python3
"""
Mock Object Detector for Virtual Scenes

Detects white/bright regions in images instead of using YOLO.
Useful for testing phosphene pipeline with 3D virtual scenes.

Author: Dawn Pilot Team
Date: November 2025
"""

import cv2
import numpy as np
from typing import List, Tuple, Dict, Any
import logging

logger = logging.getLogger(__name__)


class MockDetector:
    """
    Mock detector that finds white/bright objects in images.
    
    Instead of using YOLO (which won't detect 3D models), this detector:
    1. Converts image to grayscale
    2. Thresholds for white/bright pixels
    3. Finds connected components (regions)
    4. Creates bounding boxes around each region
    5. Returns detections in YOLO format
    """
    
    def __init__(
        self,
        brightness_threshold: int = 200,
        min_area: int = 100,
        max_detections: int = 10
    ):
        """
        Initialize mock detector.
        
        Args:
            brightness_threshold: Pixel brightness threshold (0-255)
            min_area: Minimum region area in pixels
            max_detections: Maximum number of detections to return
        """
        self.brightness_threshold = brightness_threshold
        self.min_area = min_area
        self.max_detections = max_detections
        logger.info(
            f"MockDetector initialized: threshold={brightness_threshold}, "
            f"min_area={min_area}, max_detections={max_detections}"
        )
    
    def detect(
        self,
        image: np.ndarray,
        conf_threshold: float = 0.5
    ) -> List[Dict[str, Any]]:
        """
        Detect white/bright regions in image.
        
        Args:
            image: Input image (BGR or RGB format)
            conf_threshold: Confidence threshold (not used in mock, kept for compatibility)
            
        Returns:
            List of detections in YOLO format:
            [
                {
                    'class': 'white_object',
                    'confidence': 0.95,
                    'bbox': [x, y, w, h],
                    'centroid_px': [cx, cy]
                },
                ...
            ]
        """
        try:
            start_time = cv2.getTickCount()
            
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            # Threshold for white/bright pixels
            _, binary = cv2.threshold(
                gray,
                self.brightness_threshold,
                255,
                cv2.THRESH_BINARY
            )
            
            # Find connected components
            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
                binary,
                connectivity=8
            )
            
            detections = []
            
            # Process each component (skip background label 0)
            for i in range(1, num_labels):
                area = stats[i, cv2.CC_STAT_AREA]
                
                # Filter by minimum area
                if area < self.min_area:
                    continue
                
                # Get bounding box
                x = int(stats[i, cv2.CC_STAT_LEFT])
                y = int(stats[i, cv2.CC_STAT_TOP])
                w = int(stats[i, cv2.CC_STAT_WIDTH])
                h = int(stats[i, cv2.CC_STAT_HEIGHT])
                
                # Get centroid
                cx = int(centroids[i, 0])
                cy = int(centroids[i, 1])
                
                # Calculate confidence based on area (larger = more confident)
                # Normalize by image size
                img_area = image.shape[0] * image.shape[1]
                confidence = min(0.99, 0.5 + (area / img_area) * 5)
                
                detection = {
                    'class': 'white_object',
                    'confidence': float(confidence),
                    'bbox': [x, y, w, h],
                    'centroid_px': [cx, cy]
                }
                
                detections.append(detection)
                
                # Limit number of detections
                if len(detections) >= self.max_detections:
                    break
            
            # Sort by confidence (area)
            detections.sort(key=lambda d: d['confidence'], reverse=True)
            
            elapsed = (cv2.getTickCount() - start_time) / cv2.getTickFrequency() * 1000
            
            logger.info(
                f"Mock detection: found {len(detections)} white regions "
                f"in {elapsed:.1f}ms"
            )
            
            return detections
            
        except Exception as e:
            logger.error(f"Mock detection failed: {e}")
            raise
    
    def detect_with_visualization(
        self,
        image: np.ndarray,
        conf_threshold: float = 0.5
    ) -> Tuple[List[Dict[str, Any]], np.ndarray]:
        """
        Detect objects and return annotated image.
        
        Args:
            image: Input image (BGR format)
            conf_threshold: Confidence threshold
            
        Returns:
            (detections, annotated_image)
        """
        detections = self.detect(image, conf_threshold)
        
        # Draw bounding boxes
        annotated = image.copy()
        for det in detections:
            x, y, w, h = det['bbox']
            conf = det['confidence']
            
            # Draw rectangle (green)
            cv2.rectangle(annotated, (x, y), (x+w, y+h), (0, 255, 0), 2)
            
            # Draw label
            label = f"{det['class']}: {conf:.2f}"
            cv2.putText(
                annotated,
                label,
                (x, y - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 255, 0),
                2
            )
            
            # Draw centroid
            cx, cy = det['centroid_px']
            cv2.circle(annotated, (cx, cy), 5, (0, 0, 255), -1)
        
        return detections, annotated


def create_mock_detector(
    brightness_threshold: int = 200,
    min_area: int = 100,
    max_detections: int = 10
) -> MockDetector:
    """
    Factory function to create mock detector.
    
    Args:
        brightness_threshold: Pixel brightness threshold (0-255)
        min_area: Minimum region area in pixels
        max_detections: Maximum detections to return
        
    Returns:
        MockDetector instance
    """
    return MockDetector(brightness_threshold, min_area, max_detections)


# Test function
if __name__ == "__main__":
    # Create test image with white shapes
    test_img = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Add some white rectangles
    cv2.rectangle(test_img, (100, 100), (200, 200), (255, 255, 255), -1)
    cv2.rectangle(test_img, (300, 150), (400, 250), (255, 255, 255), -1)
    cv2.circle(test_img, (500, 300), 50, (255, 255, 255), -1)
    
    # Create detector
    detector = create_mock_detector()
    
    # Detect
    detections, annotated = detector.detect_with_visualization(test_img)
    
    print(f"Found {len(detections)} white objects:")
    for i, det in enumerate(detections):
        print(f"  {i+1}. {det['class']}: confidence={det['confidence']:.2f}, "
              f"bbox={det['bbox']}, centroid={det['centroid_px']}")
    
    # Save result
    cv2.imwrite('mock_detection_test.jpg', annotated)
    print("Saved annotated image to mock_detection_test.jpg")
