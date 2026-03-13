import numpy as np
from typing import Dict, Any, List

class SceneSelector:
    """Score, sort, and filter the objects to prevent overload."""

    def __init__(self, semantic_priority: Dict[str, Any], weights: Dict[str, Any], t_min: float, k_min: int, k_max: int):
        self.semantic_priority = semantic_priority
        self.weights = weights
        self.t_min = float(t_min)
        self.k_min = int(k_min)
        self.k_max = int(k_max)

    def _score(self, obj: Dict[str, Any]) -> float:
        proximity = float(obj.get("proximity", 0.0))
        class_weight = float(obj.get("class_weight", 1.0))
        confidence = float(obj.get("confidence", 0.5))

        w_dist = float(self.weights.get("dist", 0.7))
        w_sem = float(self.weights.get("sem", 0.2))
        w_conf = float(self.weights.get("conf", 0.1))

        max_sem = max([1.0] + [float(v) for v in self.semantic_priority.values()])
        semantic_norm = class_weight / max_sem

        denom = max(1e-6, w_dist + w_sem + w_conf)
        score = (w_dist * proximity + w_sem * semantic_norm + w_conf * confidence) / denom
        return float(np.clip(score, 0.0, 1.0))

    def select(self, enriched: List[Dict[str, Any]], depth_threshold: float = 0.0, depth_threshold_mode: str = "fallback") -> List[Dict[str, Any]]:
        for obj in enriched:
            obj["score"] = self._score(obj)
        
        enriched.sort(key=lambda o: o["score"], reverse=True)

        if depth_threshold > 0.0:
            depth_filtered = [o for o in enriched if o["proximity"] >= depth_threshold]
            if len(depth_filtered) < self.k_min and depth_threshold_mode == "fallback":
                depth_filtered = enriched[:self.k_min]
            enriched_for_selection = depth_filtered
        else:
            enriched_for_selection = enriched

        selected = [o for o in enriched_for_selection if o["score"] >= self.t_min]
        selected = [o for o in selected if o.get("bbox_128") is not None and o.get("centroid_128") is not None]

        if len(selected) > self.k_max:
            selected = selected[:self.k_max]
        if len(selected) < self.k_min:
            fallback = [o for o in enriched_for_selection if o.get("bbox_128") is not None and o.get("centroid_128") is not None]
            selected = fallback[:self.k_min]
            
        return selected