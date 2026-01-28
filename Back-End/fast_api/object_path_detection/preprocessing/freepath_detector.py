import os
from glob import glob
from pathlib import Path
from random import sample
import torch
import torch.nn as nn
from torchvision import transforms
from torchvision.models.segmentation import deeplabv3_resnet50
from PIL import Image
import numpy as np
import cv2
from scipy.spatial import KDTree

class FreepathDetector:
    def __init__(self, model_path=None, output_dir="api_output"):
        self.model_path = model_path
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        # print(f"FreepathDetector using device: {self.device}")  # Reduced logging
        self.output_dir = output_dir
        self.mask_output_dir = os.path.join(output_dir, "freepath_masks")
        self.coord_output_dir = os.path.join(output_dir, "freepath_coordinates")
        # Create directories if they don't exist
        os.makedirs(self.mask_output_dir, exist_ok=True)
        os.makedirs(self.coord_output_dir, exist_ok=True)
        self.model = self.load_model(self.model_path)

    def load_model(self, model_path):
        model = deeplabv3_resnet50(
            pretrained=False,
            num_classes=21,
            aux_loss=None
        )

        # Replace main classifier head with 2 classes
        model.classifier[4] = nn.Conv2d(256, 2, kernel_size=1)

        state_dict = torch.load(model_path, map_location=self.device)
        state_dict = {k: v for k, v in state_dict.items() if not k.startswith("aux_classifier")}
        model.load_state_dict(state_dict, strict=True)
        model.to(self.device)
        model.eval()
        # print("Deeplab Model loaded successfully.")  # Reduced logging
        return model

    def infer_per_frame(self, rgb_img_path, frame_id, save_debug=False):
        # print("Inferring per frame.")  # Reduced logging
        rgb_img = Image.open(rgb_img_path).convert("RGB")
        original_size = rgb_img.size
        infer_tf = transforms.Compose([
            transforms.Resize((256,256), interpolation=Image.BILINEAR),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                std=[0.229, 0.224, 0.225])
        ])
        img_t = infer_tf(rgb_img).unsqueeze(0).to(self.device)
        with torch.no_grad():
            pred = self.model(img_t)['out']
            mask = torch.argmax(pred[0], dim=0).cpu().numpy()
        mask_resized = cv2.resize(mask.astype(np.uint8), original_size, interpolation=cv2.INTER_NEAREST)
        binary_mask = (mask_resized > 0).astype(np.uint8) * 255
        
        # Only save mask if debug mode is enabled
        freepath_mask_path = None
        if save_debug:
            freepath_mask_path = os.path.join(self.mask_output_dir, f"{frame_id:04d}.png")
            cv2.imwrite(freepath_mask_path, binary_mask)
        
        return mask_resized, freepath_mask_path
    
    def compute_centerline(self, mask_array, half_image=True, save_debug=False, frame_id=None):
        """Compute centerline from mask array
            Args:
            mask_array: Binary mask as numpy array
            half_image: If True, only use bottom half
            save_debug: If True, save visualization
            frame_id: Frame ID for saving debug output
        """
        # Convert to binary mask if needed
        if len(mask_array.shape) == 3:
            mask = cv2.cvtColor(mask_array, cv2.COLOR_BGR2GRAY)
        else:
            mask = mask_array
        mask = (mask > 0).astype(np.uint8)
        h, w = mask.shape[:2]
        
        centerline = []
        for y in range(h):
            xs = np.where(mask[y, :] > 0)[0]
            if len(xs) == 0:
                continue
            x_center = int(xs.mean())
            centerline.append((x_center, y))
                                        
        # print("Centerline length:", len(centerline))  # Reduced logging
        centerline = self._center_freepath(centerline)
        
        # Only save visualization if debug mode is enabled
        if save_debug and frame_id is not None:
            mask_visual = (mask * 255).astype(np.uint8)
            save_path = os.path.join(self.coord_output_dir, f"{frame_id:04d}_centerline.png")
            self._visualize_centerline_from_array(mask_visual, centerline, save_path=save_path)
            
        return centerline


    def compute_freepath_coordinates(self, freepath_mask_path):
        # print("Computing Coordinates")  # Reduced logging
        # print(freepath_mask_path)  # Reduced logging
        # Load mask 
        mask = cv2.imread(freepath_mask_path, cv2.IMREAD_GRAYSCALE)
        if mask is None:
            print("ERROR: Could not load mask")
            return []
        mask = (mask > 0).astype(np.uint8)

        # Skeletonize
        skeleton = self._skeletonize_cv(mask).astype(np.uint8)
        if skeleton.sum() == 0:
            print("ERROR: Skeleton is empty")
            return []

        # Extract skeleton points
        coords = np.column_stack(np.where(skeleton > 0))
        point_set = set((int(r), int(c)) for r, c in coords)

        # Find endpoints
        endpoints = [p for p in point_set if len(self._get_neighbors(p, point_set)) == 1]
        if len(endpoints) == 0:
            print("WARNING: No endpoints found. Path may be a loop.")
            return []

        # Start from one endpoint
        start = endpoints[0]

        # Depth-first ordering
        path = []
        visited = set()
        stack = [start]

        while stack:
            p = stack.pop()
            if p in visited:
                continue
            visited.add(p)
            path.append((p[1], p[0]))  # (x, y)
            for nbr in self._get_neighbors(p, point_set):
                if nbr not in visited:
                    stack.append(nbr)

        # print("Centerline length:", len(path))  # Reduced logging
        # print(path[:20])  # Reduced logging
        
        path = self._center_freepath(path)

        save_path = os.path.join(self.coord_output_dir, os.path.basename(freepath_mask_path).replace(".png", "_centerline.png"))
        self._visualize_centerline(freepath_mask_path, path, save_path=save_path)
        return path

    def _get_neighbors(self, p, point_set):
        r, c = p
        nbrs = []
        for dr in [-1,0,1]:
            for dc in [-1,0,1]:
                if dr == 0 and dc == 0:
                    continue
                rr, cc = r + dr, c + dc
                if (rr, cc) in point_set:
                    nbrs.append((rr, cc))
        return nbrs

    def _skeletonize_cv(self, mask):
        """
        Compute a skeleton / centerline of a binary mask using distance transform.
        Returns a binary skeleton with 1 where centerline is, 0 elsewhere.
        """
        # Ensure binary 0/1
        mask = (mask > 0).astype(np.uint8)

        # Compute distance transform
        dist = cv2.distanceTransform(mask, distanceType=cv2.DIST_L2, maskSize=5)

        # Normalize for visualization (optional)
        # dist_norm = cv2.normalize(dist, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

        # Threshold to get the ridge (centerline)
        max_val = dist.max()
        skeleton = (dist > 0.5 * max_val).astype(np.uint8)

        # Optionally, thin the skeleton with 1-pixel erosion iterations
        prev = np.zeros_like(skeleton)
        while True:
            eroded = cv2.erode(skeleton, cv2.getStructuringElement(cv2.MORPH_CROSS, (3,3)))
            temp = cv2.dilate(eroded, cv2.getStructuringElement(cv2.MORPH_CROSS, (3,3)))
            temp = skeleton - temp
            skeleton = eroded + temp
            if np.array_equal(skeleton, prev):
                break
            prev = skeleton.copy()

        return skeleton

    def _center_freepath(self, centerline):
        # print("Centering Freepath")  # Reduced logging
        if len(centerline) < 2:
            print("Not enough points for line fit")
            return []

        ys = np.array([pt[1] for pt in centerline])
        xs = np.array([pt[0] for pt in centerline])

        # Fit line: x = m*y + b
        m, b = np.polyfit(ys, xs, 1)

        # Generate smooth centerline along the y-range
        y_new = np.arange(ys.min(), ys.max() + 1)
        x_new = (m * y_new + b).astype(int)
        centerline_straight = list(zip(x_new, y_new))
        return centerline_straight
    
    def _center_freepath_polynomial(self, centerline):
        # print("Centering Freepath (Polynomial)")  # Reduced logging
        if len(centerline) < 2:
            print("Not enough points for line fit")
            return []

        ys = np.array([pt[1] for pt in centerline])
        xs = np.array([pt[0] for pt in centerline])

        # Fit quadratic: x = a*y^2 + b*y + c
        coeffs = np.polyfit(ys, xs, 2)

        # Generate smooth centerline along the y-range
        y_new = np.arange(ys.min(), ys.max() + 1)
        x_new = np.polyval(coeffs, y_new).astype(int)

        centerline_curve = list(zip(x_new, y_new))
        return centerline_curve


    def _visualize_centerline(self, mask_path, centerline, save_path, color=(0,255,0), thickness=2):
        # print("Visualizing Freepath Coordinates")  # Reduced logging
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        img = cv2.imread(mask_path)
        if len(img.shape) == 2 or img.shape[2] == 1:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        for i in range(len(centerline)-1):
            x1, y1 = centerline[i]
            x2, y2 = centerline[i+1]
            cv2.line(img, (x1, y1), (x2, y2), color, thickness)
        cv2.imwrite(save_path, img)
    
    def _visualize_centerline_from_array(self, mask_array, centerline, save_path, color=(0,255,0), thickness=2):
        """Visualize centerline on mask array (without loading from disk)"""
        print("Visualizing Freepath Coordinates")
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        if len(mask_array.shape) == 2 or mask_array.shape[2] == 1:
            img = cv2.cvtColor(mask_array, cv2.COLOR_GRAY2BGR)
        else:
            img = mask_array.copy()
        for i in range(len(centerline)-1):
            x1, y1 = centerline[i]
            x2, y2 = centerline[i+1]
            cv2.line(img, (x1, y1), (x2, y2), color, thickness)
        cv2.imwrite(save_path, img)
