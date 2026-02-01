import os
import cv2
import json
import time
import torch
import torchvision
from torchvision.models.detection import fasterrcnn_resnet50_fpn, fasterrcnn_resnet50_fpn_v2
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.transforms.functional import to_tensor
import matplotlib.pyplot as plt
import numpy as np
from ultralytics import YOLO
import sys
import os as os_module

# Add parent directories to path to import logger_config
sys.path.insert(0, os_module.path.join(os_module.path.dirname(__file__), '../../translation'))
from logger_config import get_depth_logger


class ObjectDetector:
    def __init__(self, model_name, model_path=None, class_map_path="../yolo_class_mapping.json"):
        self.model_path = model_path
        self.class_map_path = class_map_path
        self.class_map = self.load_class_map()
        self.model_name = model_name
        # Initialize depth logger (writes to depth_debug.log)
        self.logger = get_depth_logger()
        if self.model_name == "faster_rcnn":
            self.model, self.device = self.load_faster_rcnn_model(weights_path=self.model_path)
        else:
            self.model, self.device = self.load_yolo_model(model_path=self.model_path)

    def load_faster_rcnn_model(self, weights_path, num_classes=29, device=None):
        """Load Faster R-CNN model with support for model_state_dict checkpoints"""
        if device is None:
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        print(f"ObjectDetector (Faster R-CNN) using device: {device}")
        
        # Load checkpoint first to determine num_classes
        print(f"Loading checkpoint: {weights_path}")
        ckpt = torch.load(weights_path, map_location=device)
        
        # Extract num_classes from checkpoint
        if "model_state_dict" in ckpt:
            state_dict = ckpt["model_state_dict"]
        else:
            state_dict = ckpt
        
        # Determine num_classes from the cls_score layer shape
        if "roi_heads.box_predictor.cls_score.weight" in state_dict:
            num_classes = state_dict["roi_heads.box_predictor.cls_score.weight"].shape[0]
            print(f"Detected {num_classes} classes from checkpoint")
        else:
            print(f"Using default num_classes={num_classes}")
        
        # Build empty model with FPN v2
        model = fasterrcnn_resnet50_fpn_v2(weights=None, weights_backbone=None)
        
        # Replace head for correct num_classes
        in_features = model.roi_heads.box_predictor.cls_score.in_features
        model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)

        # Load the state dict
        if "model_state_dict" in ckpt:
            model.load_state_dict(ckpt["model_state_dict"])
            print("Loaded FULL checkpoint (model only for eval).")
        else:
            model.load_state_dict(ckpt)
            print("Loaded weights-only checkpoint.")

        model.to(device)
        model.eval()
        print(f"Model loaded from: {weights_path}")
        return model, device
    
    def load_faster_rcnn_model_old(self, weights_path, num_classes=29, device=None):
        """Old version of Faster R-CNN loader (kept for backward compatibility)"""
        if device is None:
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        print(f"ObjectDetector (Faster R-CNN) using device: {device}")
        model = fasterrcnn_resnet50_fpn(weights=None)
        try:
            in_features = model.roi_heads.box_predictor.cls_score.in_features
        except AttributeError:
            raise RuntimeError("Could not extract in_features from model. Check model architecture.")

        if not isinstance(num_classes, int) or num_classes < 1:
            raise ValueError(f"Invalid num_classes: {num_classes}. Must be a positive integer.")

        model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)

        try:
            state_dict = torch.load(weights_path, map_location=device)
            model.load_state_dict(state_dict)
        except Exception as e:
            raise RuntimeError(f"Failed to load weights from {weights_path}: {e}")

        model.to(device)
        model.eval()
        print(f"Model loaded from: {weights_path}")
        return model, device
    
    def load_yolo_model(self, model_path, device=None):
        """
        Loads a YOLO model using Ultralytics.

        Args:
            model_path (str): Path to the model file or model name (e.g., 'yolov8n.pt').
            device (str): 'cpu' or 'cuda' for GPU.

        Returns:
            YOLO: Loaded YOLO model object.
        """
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        
        print(f"ObjectDetector (YOLO) using device: {device}")
        model = YOLO(model_path)
        # YOLO model.to() expects string 'cuda' or 'cpu', not torch.device
        if isinstance(device, torch.device):
            device = str(device)
        model.to(device)
        return model, device

    
    def load_class_map(self):
        if os.path.exists(self.class_map_path):
            with open(self.class_map_path, "r") as f:
                return json.load(f)
        return {i: f"class_{i}" for i in range(1, 30)}  # fallback dummy map



    def detect_per_frame(self, rgb_img, depth_img, conf_thresh=0.5):
        """
        Run object detection on an RGB frame and attach depth information.

        IMPORTANT COORDINATE RULE:
        --------------------------
        - Detection happens in RGB space
        - Depth lookup happens in DEPTH space
        - NEVER overwrite RGB bbox with depth bbox
        """

        # ==============================================================
        # 1. MODEL INFERENCE (RGB SPACE)
        # ==============================================================

        with torch.no_grad():
            if self.model_name == "faster_rcnn":
                tensor = to_tensor(rgb_img).to(self.device, non_blocking=True)
                outputs = self.model([tensor])[0]

                boxes = outputs["boxes"].detach().cpu().numpy()   # RGB coords
                scores = outputs["scores"].detach().cpu().numpy()
                labels = outputs["labels"].detach().cpu().numpy()
            else:
                rgb_np = np.asarray(rgb_img)
                outputs = self.model(rgb_np, verbose=False)[0]

                boxes = outputs.boxes.xyxy.detach().cpu().numpy()  # RGB coords
                scores = outputs.boxes.conf.detach().cpu().numpy()
                labels = outputs.boxes.cls.detach().cpu().numpy().astype(int)

        # ==============================================================
        # 2. CONFIDENCE FILTERING
        # ==============================================================

        keep = scores >= conf_thresh
        boxes, scores, labels = boxes[keep], scores[keep], labels[keep]
        # ==============================================================
        # 3. PREPARE RGB → DEPTH COORDINATE MAPPING
        # ==============================================================

        rgb_h, rgb_w = rgb_img.shape[:2]
        depth_h, depth_w = depth_img.shape[:2]

        # Scale factors between coordinate spaces
        sx = depth_w / rgb_w
        sy = depth_h / rgb_h

        if (rgb_h, rgb_w) != (depth_h, depth_w):
            self.logger.info(
                "RGB/Depth resolution mismatch: RGB=%s Depth=%s Scale=(%.3f, %.3f)",
                (rgb_h, rgb_w),
                (depth_h, depth_w),
                sx, sy
            )

        detections = []

        # ==============================================================
        # 4. PER-OBJECT PROCESSING
        # ==============================================================

        for i, (box, score, label) in enumerate(zip(boxes, scores, labels)):

            # ----------------------------------------------------------
            # A. RGB BBOX (DO NOT MODIFY)
            # ----------------------------------------------------------
            x1, y1, x2, y2 = map(int, box)

            # ----------------------------------------------------------
            # B. MAP RGB BBOX → DEPTH SPACE (FOR DEPTH LOOKUP ONLY)
            # ----------------------------------------------------------
            dx1 = int(x1 * sx)
            dx2 = int(x2 * sx)
            dy1 = int(y1 * sy)
            dy2 = int(y2 * sy)

            # Clamp ONLY in depth space to avoid invalid slicing
            dx1 = max(0, min(dx1, depth_w - 1))
            dx2 = max(0, min(dx2, depth_w))
            dy1 = max(0, min(dy1, depth_h - 1))
            dy2 = max(0, min(dy2, depth_h))

            if dx2 <= dx1 or dy2 <= dy1:
                self.logger.warning(
                    "Empty depth ROI after scaling: RGB=%s DEPTH=%s",
                    (x1, y1, x2, y2),
                    (dx1, dy1, dx2, dy2)
                )
                roi = None
            else:
                roi = depth_img[dy1:dy2, dx1:dx2]

            # ----------------------------------------------------------
            # C. DEPTH EXTRACTION
            # ----------------------------------------------------------
            depth_pixel = None
            reason = None

            if roi is None or roi.size == 0:
                reason = "empty_roi"
            else:
                # IMPORTANT:
                # depth_img contains NO None values
                # BUT depth sensors encode INVALID depth as 0
                valid = roi[roi > 0]

                if valid.size > 0:
                    depth_pixel = float(np.median(valid))
                else:
                    reason = "all_zero_roi"

            # ----------------------------------------------------------
            # D. FALLBACK LOGIC (EXPECTED IN REAL DEPTH DATA)
            # ----------------------------------------------------------
            if depth_pixel is None:
                all_valid = depth_img[depth_img > 0]

                if all_valid.size > 0:
                    depth_pixel = float(np.median(all_valid))
                    self.logger.warning(
                        "Depth fallback (%s): RGB=%s DEPTH=%s fallback=%.1f",
                        reason,
                        (x1, y1, x2, y2),
                        (dx1, dy1, dx2, dy2),
                        depth_pixel
                    )
                else:
                    self.logger.error(
                        "No valid depth in entire frame! RGB=%s",
                        (x1, y1, x2, y2)
                    )

            # ----------------------------------------------------------
            # E. DEBUG (FIRST OBJECT ONLY)
            # ROI: shape of the region of interest in depth space
            # valid: number of non-zero (valid) depth pixels in the ROI
            # total: total number of pixels in the ROI
            # ----------------------------------------------------------
            if i == 0:
                self.logger.debug("Depth stats: ROI=%s valid=%d/%d",
                    None if roi is None else roi.shape,
                    0 if roi is None else np.count_nonzero(roi),
                    0 if roi is None else roi.size
                )

            # ----------------------------------------------------------
            # F. RETURN RGB BBOX (NOT DEPTH BBOX!)
            # ----------------------------------------------------------
            detections.append({
                "id": i + 1,
                "class": self.class_map[str(label)],
                "bbox": [x1, y1, x2 - x1, y2 - y1],  # RGB SPACE
                "depth_pixel": depth_pixel,          # DEPTH INFO
                "detection_score": float(score),
                "shape": None,
                "mask_path": None,
                "velocity": None,
                "hazard": None
            })

        return detections



    # def save_json_output(self, detections, rgb_img, frame_id, file_path, output_dir=r"pipeline1\outputs\detections_json", intrinsics=None):
    #     os.makedirs(output_dir, exist_ok=True)
    #     # detections = self.detect_per_frame(rgb_img, depth_img)

    #     # Dummy free space info
    #     free_path = {
    #         "shape": None,
    #         "center": None,
    #         "radius": None,
    #         "mask_path": None,
    #         "distance_m": None
    #     }

    #     # Default intrinsics if not provided
    #     if intrinsics is None:
    #         intrinsics = {
    #             "fx": None,
    #             "fy": None,
    #             "cx": None,
    #             "cy": None
    #         }

    #     data = {
    #         "frame_id": f"frame_{frame_id:04d}",
    #         "file_path": file_path,
    #         "timestamp": int(time.time()),
    #         "camera_intrinsics": intrinsics,
    #         "obstacles": detections,
    #         "free_path": free_path,
    #         "metadata": {
    #             "source_image": f"frame_{frame_id:04d}.png",
    #             "segmentation_combined": None,
    #             "generator": "detector_output_v1",
    #             "note": "Dummy depth estimated via bbox height heuristic",
    #             "image_width": rgb_img.shape[1],
    #             "image_height": rgb_img.shape[0]
    #         }
    #     }

    #     output_path = os.path.join(output_dir, f"{data['frame_id']}.json")
    #     with open(output_path, "w") as f:
    #         json.dump(data, f, indent=2)

    #     print(f"JSON saved: {output_path}")
    #     return data
