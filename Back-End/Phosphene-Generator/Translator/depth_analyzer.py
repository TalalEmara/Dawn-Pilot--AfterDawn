import numpy as np
from typing import List, Tuple
from .utils import bbox_to_xyxy, clamp_bbox_xyxy

class DepthAnalyzer:
    """Handle the NumPy depth map and extract distances."""
    
    @staticmethod
    def _to_depth_plane(depth_numpy: np.ndarray) -> np.ndarray:
        if depth_numpy is None:
            raise ValueError("depth_numpy is required")
        if depth_numpy.ndim == 2:
            return depth_numpy.astype(np.float32)
        if depth_numpy.ndim == 3 and depth_numpy.shape[2] >= 1:
            return depth_numpy[:, :, 0].astype(np.float32)
        raise ValueError(f"Unsupported depth shape: {depth_numpy.shape}")
        
    def analyze_depth(self, depth_numpy: np.ndarray, bbox: List[int]) -> float:
        depth_plane = self._to_depth_plane(depth_numpy)
        return self._median_depth_in_bbox(depth_plane, bbox)

    def _median_depth_in_bbox(self, depth_plane: np.ndarray, bbox: List[int]) -> float:
        h, w = depth_plane.shape[:2]
        x1, y1, x2, y2 = bbox_to_xyxy(bbox)
        x1, y1, x2, y2 = clamp_bbox_xyxy(x1, y1, x2, y2, w, h)

        if x2 <= x1 or y2 <= y1:
            all_valid = depth_plane[depth_plane > 0]
            return float(np.median(all_valid)) if all_valid.size > 0 else 128.0

        roi = depth_plane[y1:y2, x1:x2]
        valid = roi[roi > 0]
        if valid.size > 0:
            return float(np.median(valid))

        all_valid = depth_plane[depth_plane > 0]
        return float(np.median(all_valid)) if all_valid.size > 0 else 128.0
