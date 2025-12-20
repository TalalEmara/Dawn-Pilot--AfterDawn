"""
visualization.py
----------------
Handles visualization of RGB, depth, detections, and free-path overlays
for the offline navigation pipeline.
"""

import cv2
import numpy as np
import matplotlib.pyplot as plt

class Visualizer:
    def __init__(self, show_depth=True, show_detections=True, save=False, output_dir=None):
        self.show_depth = show_depth
        self.show_detections = show_detections
        self.save = save
        self.output_dir = output_dir

    def visualize_frame(self, rgb_image, depth_map=None, detections=None, free_space_mask=None, freepath_coordinates=None, occupancy_map=None, frame_id=None):
        """
        Visualize a single frame with available data.
        - rgb_image: np.ndarray, RGB image (H, W, 3)
        - depth_map: np.ndarray, depth image (H, W)
        - detections: list of dicts [{'bbox': (x1, y1, x2, y2), 'label': str, 'conf': float}, ...]
        - free_space_mask: np.ndarray, binary mask of walkable area
        - frame_id: int or str, optional identifier for saving
        """

        vis_img = rgb_image.copy()

        # Overlay depth map
        if self.show_depth and depth_map is not None:
            vis_img = self._overlay_depth(vis_img, depth_map)

        # Draw detections
        if self.show_detections and detections is not None:
            vis_img = self._draw_detections(vis_img, detections)

        # Overlay free space
        if free_space_mask is not None:
            vis_img = self._overlay_free_space(vis_img, free_space_mask)

        # Overlay freepath coordinates
        if freepath_coordinates is not None:
            vis_img = self._overlay_free_coordinates(vis_img, freepath_coordinates)

        if occupancy_map is not None:
            vis_img = self._overlay_occupancy_map(vis_img, occupancy_map)

        # Show or save
        self._display(vis_img, frame_id)

    def _overlay_depth(self, image, depth_map):
        """Overlay depth information as a color map."""
        depth_normalized = cv2.normalize(depth_map, None, 0, 255, cv2.NORM_MINMAX)
        depth_colored = cv2.applyColorMap(depth_normalized.astype(np.uint8), cv2.COLORMAP_JET)
        return cv2.addWeighted(image, 0.7, depth_colored, 0.3, 0)

    def _draw_detections(self, image, detections):
        """Draw bounding boxes and labels for detected objects."""
        print(f"LENGTH OF DETECTIONS: {len(detections)}")
        for det in detections:
            # x1, y1, x2, y2 = det['bbox']
            # label = det.get('label', 'object')
            # conf = det.get('conf', 0.0)
            # color = (0, 255, 0)
            # # cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
            # cv2.rectangle(image, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
            # cv2.putText(image, f"{label} {conf:.2f}", (x1, y1 - 5),
            #             cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
            x, y, w, h = map(int, det["bbox"])
            class_name = det["class"]

            # Draw rectangle (red, thickness 2)
            cv2.rectangle(image, (x, y), (x + w, y + h), (0, 0, 255), 2)

            # Draw label background (semi-transparent red)
            label_size, _ = cv2.getTextSize(class_name, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            label_w, label_h = label_size
            overlay = image.copy()
            cv2.rectangle(overlay, (x, y - label_h - 4), (x + label_w + 4, y), (0, 0, 255), -1)
            alpha = 0.5
            cv2.addWeighted(overlay, alpha, image, 1 - alpha, 0, image)

            # Draw label text (white)
            cv2.putText(image, class_name, (x + 2, y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        return image

    def _overlay_free_space(self, image, mask):
        """Overlay free-space mask on image."""
        mask_colored = np.zeros_like(image)
        mask_colored[mask > 0] = (255, 0, 0)  # blue overlay for free space
        return cv2.addWeighted(image, 0.8, mask_colored, 0.3, 0)
    
    def _overlay_free_coordinates(self, img, centerline):
        """Overlay free-space coordinates on image."""
        if len(img.shape) == 2 or img.shape[2] == 1:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        for i in range(len(centerline)-1):
            x1, y1 = centerline[i]
            x2, y2 = centerline[i+1]
            cv2.line(img, (x1, y1), (x2, y2), color=(0,225,0), thickness=2)
        return img
    
    def _overlay_occupancy_map(self, image, mask):
        """Overlay free-space mask on image."""
        mask_colored = np.zeros_like(image)
        mask_colored[mask > 0] = (0, 0, 255)  # green overlay for free space
        return cv2.addWeighted(image, 0.8, mask_colored, 0.3, 0)

    def _display(self, image, frame_id):
        """Display or save the visualization."""
        if self.save and self.output_dir:
            filename = f"{self.output_dir}/frame_{frame_id}.png"
            cv2.imwrite(filename, image)
        else:
            cv2.imshow("Visualization", image)
            cv2.waitKey(1)

    def close(self):
        """Close all visualization windows."""
        cv2.destroyAllWindows()
