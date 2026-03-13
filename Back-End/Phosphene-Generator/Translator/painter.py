from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np


class Painter:
    """Layer 5 painter scaffold.

    This class is intentionally simple for now. It consumes translator output
    (already filtered/ranked/mapped to 128x128) and paints canonical shapes.
    """

    def __init__(self, canvas_size: Tuple[int, int] = (128, 128)) -> None:
        self.canvas_size = (int(canvas_size[0]), int(canvas_size[1]))

    def paint(
        self,
        selected_objects: List[Dict[str, Any]],
        freepath_ball: Optional[Dict[str, Any]] = None,
    ) -> np.ndarray:
        w, h = self.canvas_size
        canvas = np.zeros((h, w), dtype=np.uint8)

        for obj in selected_objects:
            bbox = obj.get("bbox_128")
            if not bbox or len(bbox) != 4:
                continue

            x, y, bw, bh = [int(v) for v in bbox]
            shape = str(obj.get("shape", "box")).lower()
            style = str(obj.get("render_style", "filled")).lower()
            thickness = -1 if style == "filled" else 2

            if shape in ("disk", "circle"):
                cx = x + bw // 2
                cy = y + bh // 2
                radius = max(1, min(bw, bh) // 2)
                cv2.circle(canvas, (cx, cy), radius, 255, thickness)
            elif shape in ("oval", "ellipse", "vertical_oval"):
                cx = x + bw // 2
                cy = y + bh // 2
                ax = max(1, bw // 2)
                ay = max(1, bh // 2)
                cv2.ellipse(canvas, (cx, cy), (ax, ay), 0, 0, 360, 255, thickness)
            else:
                cv2.rectangle(canvas, (x, y), (x + max(1, bw) - 1, y + max(1, bh) - 1), 255, thickness)

        if freepath_ball:
            center = freepath_ball.get("center")
            radius = int(freepath_ball.get("radius", 6))
            if isinstance(center, list) and len(center) >= 2:
                cv2.circle(canvas, (int(center[0]), int(center[1])), max(1, radius), 255, -1)

        return canvas
