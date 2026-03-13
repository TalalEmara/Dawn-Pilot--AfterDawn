import numpy as np
from typing import List, Tuple, Optional

def bbox_to_xyxy(bbox: List[int]) -> Tuple[int, int, int, int]:
    """Convert [x, y, w, h] to [x1, y1, x2, y2]."""
    x, y, bw, bh = [int(v) for v in bbox]
    return x, y, x + max(0, bw), y + max(0, bh)

def clamp_bbox_xyxy(x1: int, y1: int, x2: int, y2: int, w: int, h: int) -> Tuple[int, int, int, int]:
    """Clamp bbox coordinates to image dimensions."""
    x1 = max(0, min(x1, w - 1))
    y1 = max(0, min(y1, h - 1))
    x2 = max(0, min(x2, w))
    y2 = max(0, min(y2, h))
    return x1, y1, x2, y2

def compute_crop_bounds(source_w: int, source_h: int, fov_ratio: Tuple[float, float]) -> Tuple[int, int, int, int]:
    """Compute cropping bounds based on FOV ratio."""
    fx = float(np.clip(fov_ratio[0], 0.05, 1.0))
    fy = float(np.clip(fov_ratio[1], 0.05, 1.0))

    crop_w = max(1, int(round(source_w * fx)))
    crop_h = max(1, int(round(source_h * fy)))

    x0 = (source_w - crop_w) // 2
    y0 = (source_h - crop_h) // 2
    x1 = x0 + crop_w
    y1 = y0 + crop_h
    return x0, y0, x1, y1

def map_point_to_target(
    x: int,
    y: int,
    crop_bounds: Tuple[int, int, int, int],
    target_size: Tuple[int, int],
) -> Optional[Tuple[int, int]]:
    """Map a point from cropped source space to target canvas space."""
    x0, y0, x1, y1 = crop_bounds
    if x < x0 or x >= x1 or y < y0 or y >= y1:
        return None

    tw, th = target_size
    sx = tw / max(1, (x1 - x0))
    sy = th / max(1, (y1 - y0))

    tx = int(np.clip((x - x0) * sx, 0, tw - 1))
    ty = int(np.clip((y - y0) * sy, 0, th - 1))
    return tx, ty
