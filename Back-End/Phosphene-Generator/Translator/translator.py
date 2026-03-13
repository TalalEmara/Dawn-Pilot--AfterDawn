import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .depth_analyzer import DepthAnalyzer
from .scene_selector import SceneSelector
from .mapper import Mapper
from .utils import compute_crop_bounds, map_point_to_target


class SceneTranslator:
    """Layer 4 scene translator.

    This class orchestrates three specialized components:
    1. DepthAnalyzer: Handles 3D data and extraction.
    2. Mapper: Handles coordinate scaling and mapping.
    3. SceneSelector: Handles object scoring and filtering.
    """

    def __init__(
        self,
        shapes_path: Optional[str] = None,
        params_path: Optional[str] = None,
        target_size: Tuple[int, int] = (128, 128),
    ) -> None:
        base_dir = Path(__file__).resolve().parent
        shapes_file = Path(shapes_path) if shapes_path else base_dir / "canonical_shapes.json"
        params_file = Path(params_path) if params_path else base_dir / "selection_params.json"

        self.shapes = self._load_json(shapes_file, default={})
        self.params = self._load_json(params_file, default={})
        self.target_size = (int(target_size[0]), int(target_size[1]))

        semantic_priority = self.params.get("semantic_priority", {})
        weights = self.params.get("weights", {})
        k_min = int(self.params.get("K_min", 1))
        k_max = int(self.params.get("K_max", 5))
        t_min = float(self.params.get("T_min", 0.0))

        self.depth_analyzer = DepthAnalyzer()
        self.mapper = Mapper(target_size=self.target_size, shapes=self.shapes, params=self.params)
        self.scene_selector = SceneSelector(
            semantic_priority=semantic_priority,
            weights=weights,
            t_min=t_min,
            k_min=k_min,
            k_max=k_max
        )

    @staticmethod
    def _load_json(path: Path, default: Dict[str, Any]) -> Dict[str, Any]:
        if not path.exists():
            return default
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def translate(
        self,
        detections: List[Dict[str, Any]],
        depth_numpy: np.ndarray,
        centerline: Optional[List[List[int]]] = None,
        image_size: Optional[Tuple[int, int]] = None,
        t_min: Optional[float] = None,
        k_min: Optional[int] = None,
        k_max: Optional[int] = None,
        depth_threshold: float = 0.0,
        depth_threshold_mode: str = "fallback",
        fov_ratio: Tuple[float, float] = (1.0, 1.0),
    ) -> Dict[str, Any]:
        """Enrich detections and produce the final object list for painting."""
        depth_plane = self.depth_analyzer._to_depth_plane(depth_numpy)
        source_h, source_w = depth_plane.shape[:2]

        if image_size:
            source_w, source_h = int(image_size[0]), int(image_size[1])

        current_t_min = self.scene_selector.t_min
        current_k_min = self.scene_selector.k_min
        current_k_max = self.scene_selector.k_max
        
        if t_min is not None: self.scene_selector.t_min = t_min
        if k_min is not None: self.scene_selector.k_min = k_min
        if k_max is not None: self.scene_selector.k_max = k_max

        crop_bounds = compute_crop_bounds(source_w, source_h, fov_ratio)

        enriched: List[Dict[str, Any]] = []
        for detection in detections:
            bbox = detection.get("bbox", [0, 0, 0, 0])
            if len(bbox) != 4:
                continue

            class_name = str(detection.get("class", "unknown"))
            confidence = float(detection.get("confidence", 0.5))

            depth_pixel = self.depth_analyzer._median_depth_in_bbox(depth_plane, bbox)
            proximity = float(np.clip(depth_pixel / 255.0, 0.0, 1.0))
            class_weight = float(self.scene_selector.semantic_priority.get(class_name.lower(), 1.0))

            x, y, bw, bh = [int(v) for v in bbox]
            centroid = [int(x + bw / 2), int(y + bh / 2)]

            obj = {
                "class": class_name,
                "confidence": confidence,
                "bbox": [x, y, bw, bh],
                "centroid_px": centroid,
                "depth_pixel": depth_pixel,
                "proximity": proximity,
                "class_weight": class_weight,
            }

            shape_def = self.mapper.resolve_shape(class_name)
            obj["shape"] = shape_def.get("shape", "box")
            obj["render_style"] = shape_def.get("render_style", "filled")

            scaled_bbox = self.mapper.map_bbox_to_target(obj["bbox"], crop_bounds)
            scaled_centroid = map_point_to_target(
                obj["centroid_px"][0], obj["centroid_px"][1], crop_bounds, self.target_size
            )

            obj["bbox_128"] = scaled_bbox
            obj["centroid_128"] = list(scaled_centroid) if scaled_centroid else None
            enriched.append(obj)

        selected = self.scene_selector.select(enriched, depth_threshold, depth_threshold_mode)

        freepath_ball = self.mapper.build_freepath_ball(centerline, crop_bounds)

        result = {
            "selected_objects": selected,
            "enriched_objects": enriched,
            "freepath_ball": freepath_ball,
            "target_size": list(self.target_size),
            "crop_bounds": list(crop_bounds),
            "thresholds": {
                "T_min": float(self.scene_selector.t_min),
                "K_min": int(self.scene_selector.k_min),
                "K_max": int(self.scene_selector.k_max),
                "depth_threshold": float(depth_threshold),
                "depth_threshold_mode": depth_threshold_mode,
            },
        }

        self.scene_selector.t_min = current_t_min
        self.scene_selector.k_min = current_k_min
        self.scene_selector.k_max = current_k_max

        return result
