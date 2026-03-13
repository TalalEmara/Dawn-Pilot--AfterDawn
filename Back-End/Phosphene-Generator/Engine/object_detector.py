import json
import os
from typing import Dict, List, Optional
import numpy as np

import torch
from ultralytics import YOLO


class ObjectDetector:
    """YOLO-based object detector worker for Layer 3.

    Single responsibility: run object detection on an RGB tensor.
    """

    def __init__(self, model_path: str, class_map_path: Optional[str] = None, device: Optional[str] = None):
        if not model_path:
            raise ValueError("model_path is required")

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = YOLO(model_path)
        self.model.to(self.device)

        print(f"Loaded YOLO model from {model_path} on device {self.device}")

        self.class_map = self._load_class_map(class_map_path)

    @staticmethod
    def _load_class_map(class_map_path: Optional[str]) -> Dict[str, str]:
        if class_map_path and os.path.exists(class_map_path):
            with open(class_map_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            return {str(k): str(v) for k, v in loaded.items()}

        # Fallback map if class file is absent.
        return {str(i): f"class_{i}" for i in range(1000)}

    @staticmethod
    def _prepare_rgb_input(rgb_tensor: torch.Tensor) -> torch.Tensor:
        if rgb_tensor is None:
            raise ValueError("rgb_tensor is required")

        x = rgb_tensor
        if x.dim() == 4:
            if x.shape[0] != 1:
                raise ValueError("Expected batch size 1 for rgb_tensor")
            x = x[0]

        if x.dim() != 3:
            raise ValueError("rgb_tensor must be [H,W,C] or [C,H,W] or [1,C,H,W]")

        # Support HWC input.
        if x.shape[-1] in (3, 4):
            x = x[..., :3].permute(2, 0, 1)
        elif x.shape[0] in (3, 4):
            x = x[:3]
        else:
            raise ValueError("rgb_tensor must have 3 or 4 channels")

        x = x.contiguous().to(dtype=torch.float32)
        if torch.max(x) > 1.0:
            x = x / 255.0

        return x.unsqueeze(0)

    def detect(self, rgb_tensor: np.ndarray, conf_threshold: float = 0.5) -> List[Dict]:
        """Run YOLO on one frame and return standardized detections.

        Output format:
        [
            {"class": "person", "bbox": [x, y, w, h]}
        ]
        """
        # It's a numpy array now
        rgb_np = rgb_tensor
        if rgb_np.shape[-1] == 4:
            rgb_np = rgb_np[..., :3]

        with torch.no_grad():
            result = self.model(rgb_np, verbose=False)[0]

        boxes = result.boxes.xyxy.detach().cpu().numpy()
        scores = result.boxes.conf.detach().cpu().numpy()
        labels = result.boxes.cls.detach().cpu().numpy().astype(int)

        keep = scores >= conf_threshold
        boxes = boxes[keep]
        labels = labels[keep]

        output: List[Dict] = []
        for box, label in zip(boxes, labels):
            x1, y1, x2, y2 = [int(v) for v in box]

            class_name = self.class_map.get(str(label), f"class_{label}")
            output.append(
                {
                    "class": class_name,
                    "bbox": [x1, y1, max(0, x2 - x1), max(0, y2 - y1)],
                }
            )

        return output
