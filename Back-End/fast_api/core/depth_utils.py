"""
Depth Processing Utilities

Functions for processing depth maps and assigning depth to detections.
"""

import logging
import numpy as np
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


def assign_depth_to_detections(
    detections: List[Dict[str, Any]],
    depth_map: np.ndarray,
    method: str = "median"
) -> List[Dict[str, Any]]:
    """
    Assign depth values to YOLO detections by sampling from Z-buffer
    
    Your translator already handles depth in scoring! This function extracts
    depth from the Z-buffer and assigns it to each detection so the translator
    can prioritize closer objects.
    
    Args:
        detections: List of YOLO detections with bbox [x, y, w, h]
        depth_map: 2D array of depth values (same size as image)
        method: How to sample depth from bbox region
            - "centroid": Depth at object center point
            - "median": Median depth in bbox (robust to outliers/noise)
            - "min": Closest point in bbox (most conservative)
            - "mean": Average depth in bbox
    
    Returns:
        Detections enriched with 'distance_m' field (used by translator scoring)
    """
    # Handle 1D depth array (reshape to 2D if needed)
    if len(depth_map.shape) == 1:
        # Assume square or infer from image - this is a fallback
        size = int(np.sqrt(depth_map.shape[0]))
        depth_map = depth_map[:size*size].reshape(size, size)
        logger.warning(f"Reshaped 1D depth array to {size}x{size}")
    
    h, w = depth_map.shape
    
    for det in detections:
        bbox = det.get('bbox', [0, 0, 0, 0])  # [x, y, w, h]
        x, y, bw, bh = bbox
        
        # Clamp bbox to image boundaries
        x1 = max(0, int(x))
        y1 = max(0, int(y))
        x2 = min(w, int(x + bw))
        y2 = min(h, int(y + bh))
        
        # Ensure valid bbox
        if x2 <= x1 or y2 <= y1:
            det['distance_m'] = None
            continue
        
        # Extract depth values in bounding box region
        depth_roi = depth_map[y1:y2, x1:x2]
        
        if depth_roi.size == 0:
            det['distance_m'] = None
            continue
        
        # Debug: Log depth distribution in this bbox
        valid_depths = depth_roi[depth_roi > 0]
        if valid_depths.size > 0:
            logger.debug(f"Bbox depth stats - min: {valid_depths.min():.1f}, max: {valid_depths.max():.1f}, median: {np.median(valid_depths):.1f}")
        
        # Sample depth based on method
        try:
            if method == "centroid":
                # Depth at object center
                cy, cx = depth_roi.shape[0] // 2, depth_roi.shape[1] // 2
                depth = float(depth_roi[cy, cx])
            
            elif method == "median":
                # Median depth (robust to noise/outliers)
                depth = float(np.median(valid_depths)) if valid_depths.size > 0 else 0.0
            
            elif method == "min":
                # Closest point (lowest depth value)
                depth = float(np.min(valid_depths)) if valid_depths.size > 0 else 0.0
            
            elif method == "mean":
                # Average depth
                depth = float(np.mean(valid_depths)) if valid_depths.size > 0 else 0.0
            
            else:
                logger.warning(f"Unknown depth sampling method: {method}, using median")
                depth = float(np.median(valid_depths)) if valid_depths.size > 0 else 0.0
            
            # Convert normalized depth (0-255) to approximate meters
            # BasicDepthPacking: HIGH values = NEAR, LOW values = FAR
            # Observed actual range: pixel 20 (very close) to pixel 0 (~10m away)
            # Need to remap this narrow range to physical distances: 0.2m (close) to 10m (far)
            depth_normalized = min(depth / 255.0, 1.0)  # Normalize to 0-1
            
            # Remap observed range [0, 20] pixels to distance range [10m, 0.2m] (inverted)
            # High pixel value (20) = close = 0.2m
            # Low pixel value (0) = far = 10m
            depth_clamped = max(0.0, min(40.0, depth))  # Clamp to observed pixel range [0, 20]
            
            # Linear interpolation with inversion:
            # Map [0, 20] → [10.0, 0.2]
            t = depth_clamped / 40.0  # Normalize to [0, 1] within observed range (0→0, 40→1)
            depth_meters = 10.0 + t * (0.2 - 10.0)  # Interpolate from 10m to 0.2m (0→10m, 20→0.2m)
            
            # Assign depth and raw pixel value
            det['distance_m'] = depth_meters if depth_meters > 0 else None
            det['depth_pixel'] = float(depth)  # Store raw depth pixel value (0-255)
            logger.info(f"🎯 Detection '{det.get('class', 'unknown')}': depth_pixel={depth:.1f} (20=close/0.2m, 0=far/10m) → distance={depth_meters:.2f}m")
            
        except Exception as e:
            logger.error(f"Error sampling depth for detection: {e}")
            det['distance_m'] = None
    
    return detections
