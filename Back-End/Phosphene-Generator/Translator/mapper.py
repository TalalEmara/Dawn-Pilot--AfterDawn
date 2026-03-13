import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from .utils import bbox_to_xyxy, map_point_to_target

class Mapper:
    """Translate real-world 1280x720 coordinates into the 128x128 electrode canvas space."""

    def __init__(self, target_size: Tuple[int, int], shapes: Dict[str, Any], params: Dict[str, Any]):
        self.target_size = (int(target_size[0]), int(target_size[1]))
        self.shapes = shapes
        self.params = params

    def resolve_shape(self, class_name: str) -> Dict[str, Any]:
        class_key = (class_name or "").lower()
        shape_def = self.shapes.get(class_key)
        if shape_def:
            return shape_def

        return {
            "shape": "box",
            "render_style": "filled",
            "min_px": 4,
            "max_px": 64,
        }

    def map_bbox_to_target(
        self,
        bbox: List[int],
        crop_bounds: Tuple[int, int, int, int],
    ) -> Optional[List[int]]:
        x0, y0, x1, y1 = crop_bounds
        bx1, by1, bx2, by2 = bbox_to_xyxy(bbox)

        ix1 = max(bx1, x0)
        iy1 = max(by1, y0)
        ix2 = min(bx2, x1)
        iy2 = min(by2, y1)
        if ix2 <= ix1 or iy2 <= iy1:
            return None

        p1 = map_point_to_target(ix1, iy1, crop_bounds, self.target_size)
        p2 = map_point_to_target(ix2 - 1, iy2 - 1, crop_bounds, self.target_size)
        if p1 is None or p2 is None:
            return None

        tx1, ty1 = p1
        tx2, ty2 = p2
        tw = max(1, tx2 - tx1 + 1)
        th = max(1, ty2 - ty1 + 1)
        return [int(tx1), int(ty1), int(tw), int(th)]

    def build_freepath_ball(
        self,
        centerline: Optional[List[List[int]]],
        crop_bounds: Tuple[int, int, int, int],
    ) -> Optional[Dict[str, Any]]:
        if not centerline:
            return None

        mapped: List[Tuple[int, int]] = []
        for pt in centerline:
            if len(pt) < 2:
                continue
            mp = map_point_to_target(int(pt[0]), int(pt[1]), crop_bounds, self.target_size)
            if mp is not None:
                mapped.append(mp)

        if not mapped:
            return None

        bottom_y = max(y for _, y in mapped)
        bottom_candidates = [p for p in mapped if p[1] == bottom_y]
        cx = int(round(np.mean([p[0] for p in bottom_candidates])))
        cy = bottom_y

        return {
            "center": [cx, cy],
            "radius": int(self.params.get("freepath_ball_radius", 6)),
            "points": [[int(x), int(y)] for x, y in mapped],
        }