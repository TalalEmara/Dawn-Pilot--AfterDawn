from typing import List, Optional, Sequence, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision.models.segmentation import deeplabv3_resnet50


class FreepathDetector:
    """DeepLabV3-based freepath detector worker for Layer 3.

    Single responsibility: run segmentation on an RGB tensor and return
    standardized centerline coordinates.
    """

    _MEAN = torch.tensor([0.485, 0.456, 0.406], dtype=torch.float32).view(1, 3, 1, 1)
    _STD = torch.tensor([0.229, 0.224, 0.225], dtype=torch.float32).view(1, 3, 1, 1)

    def __init__(
        self,
        model_path: str,
        device: Optional[str] = None,
        input_size: Sequence[int] = (256, 256),
    ):
        if not model_path:
            raise ValueError("model_path is required")

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.input_size = (int(input_size[0]), int(input_size[1]))
        self.model = self._load_model(model_path)

    def _load_model(self, model_path: str) -> nn.Module:
        model = deeplabv3_resnet50(pretrained=False, num_classes=21, aux_loss=None)
        model.classifier[4] = nn.Conv2d(256, 2, kernel_size=1)

        state_dict = torch.load(model_path, map_location=self.device)
        state_dict = {k: v for k, v in state_dict.items() if not k.startswith("aux_classifier")}
        model.load_state_dict(state_dict, strict=True)
        model.to(self.device)
        model.eval()
        return model

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

    def _infer_mask(self, rgb_tensor: torch.Tensor) -> np.ndarray:
        x = self._prepare_rgb_input(rgb_tensor)
        original_h, original_w = int(x.shape[-2]), int(x.shape[-1])

        x = F.interpolate(x, size=self.input_size, mode="bilinear", align_corners=False)
        mean = self._MEAN.to(device=x.device)
        std = self._STD.to(device=x.device)
        x = (x - mean) / std
        x = x.to(self.device, non_blocking=True)

        with torch.no_grad():
            logits = self.model(x)["out"]
            pred = torch.argmax(logits, dim=1, keepdim=True).float()

        pred = F.interpolate(pred, size=(original_h, original_w), mode="nearest")
        mask = pred.squeeze(0).squeeze(0).detach().cpu().numpy().astype(np.uint8)
        return (mask > 0).astype(np.uint8)

    @staticmethod
    def _center_freepath(centerline: List[Tuple[int, int]]) -> List[List[int]]:
        if len(centerline) < 2:
            return []

        ys = np.array([pt[1] for pt in centerline], dtype=np.float32)
        xs = np.array([pt[0] for pt in centerline], dtype=np.float32)

        m, b = np.polyfit(ys, xs, 1)
        y_new = np.arange(int(ys.min()), int(ys.max()) + 1, dtype=np.int32)
        x_new = (m * y_new + b).astype(np.int32)

        return [[int(x), int(y)] for x, y in zip(x_new, y_new)]

    def _compute_centerline(self, mask: np.ndarray) -> List[List[int]]:
        if mask.ndim != 2:
            raise ValueError("mask must be a 2D array")

        h, _ = mask.shape
        points: List[Tuple[int, int]] = []
        for y in range(h):
            xs = np.where(mask[y, :] > 0)[0]
            if xs.size == 0:
                continue
            points.append((int(xs.mean()), int(y)))

        return self._center_freepath(points)

    def detect(self, rgb_tensor: torch.Tensor) -> List[List[int]]:
        """Run segmentation on one frame and return freepath centerline.

        Output format:
        [
            [x1, y1], [x2, y2]
        ]
        """
        mask = self._infer_mask(rgb_tensor)
        return self._compute_centerline(mask)
