"""
Real-time Object Detector Module

Provides unified interface for different object detection models
that can be plugged into the real-time camera system.
"""

import cv2
import numpy as np
import os
import torch
from ultralytics import YOLO


class BaseDetector:
    """Base class for object detectors"""
    
    def __init__(self):
        self.classes = []
        self.is_loaded = False
    
    def detect(self, frame):
        """
        Detect objects in frame
        
        Args:
            frame: OpenCV BGR image
            
        Returns:
            List of detections in format:
            [{
                'class': str,
                'confidence': float,
                'bbox': [x, y, w, h],
                'distance_m': float (optional),
                'centroid_px': [x, y]
            }]
        """
        raise NotImplementedError


class MockDetector(BaseDetector):
    """Mock detector for testing - analyzes frame content to generate realistic detections"""
    
    def __init__(self):
        super().__init__()
        self.classes = ['person', 'car', 'bicycle', 'tree', 'bench', 'trash_can']
        self.is_loaded = True
    
    def detect(self, frame):
        """Generate mock detections based on actual frame content"""
        h, w = frame.shape[:2]
        
        # Analyze frame to determine if it's mostly black/empty
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mean_brightness = np.mean(gray)
        std_brightness = np.std(gray)
        
        # If frame is very dark or uniform (like blocked camera), return no detections
        if mean_brightness < 30 or std_brightness < 20:
            return []
        
        # Detect edges to estimate complexity
        edges = cv2.Canny(gray, 50, 150)
        edge_density = np.sum(edges > 0) / (h * w)
        
        # Generate detections based on frame complexity
        if edge_density < 0.01:
            # Very simple scene, few objects
            num_objects = np.random.randint(0, 2)
        elif edge_density < 0.05:
            # Moderate scene
            num_objects = np.random.randint(1, 4)
        else:
            # Complex scene
            num_objects = np.random.randint(2, 6)
        
        detections = []
        
        for i in range(num_objects):
            # Random position and size, but more reasonable
            obj_w = np.random.randint(60, min(w//3, 200))
            obj_h = np.random.randint(60, min(h//3, 200))
            x = np.random.randint(0, max(1, w - obj_w))
            y = np.random.randint(0, max(1, h - obj_h))
            
            detection = {
                'class': np.random.choice(self.classes),
                'confidence': np.random.uniform(0.6, 0.95),
                'bbox': [x, y, obj_w, obj_h],
                'distance_m': np.random.uniform(2.0, 8.0),
                'centroid_px': [x + obj_w//2, y + obj_h//2]
            }
            detections.append(detection)
        
        return detections


class YOLODetector(BaseDetector):
    """YOLO detector wrapper using Ultralytics"""
    
    def __init__(self, model_path, conf_threshold=0.5):
        super().__init__()
        
        try:
            # Determine device
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            
            # Load YOLO model using Ultralytics
            self.model = YOLO(model_path)
            self.model.to(self.device)
            
            # Get class names from model
            self.classes = list(self.model.names.values())
            
            self.conf_threshold = conf_threshold
            
            self.is_loaded = True
            print(f"✓ YOLO detector loaded successfully on {self.device}")
            print(f"  Model: {model_path}")
            print(f"  Classes ({len(self.classes)}): {', '.join(self.classes[:5])}{'...' if len(self.classes) > 5 else ''}")
            
        except Exception as e:
            print(f"Failed to load YOLO detector: {e}")
            self.is_loaded = False
    
    def detect(self, frame):
        """Detect objects using YOLO (Ultralytics)"""
        if not self.is_loaded:
            return []
        
        try:
            # Run inference
            with torch.no_grad():
                results = self.model(frame, verbose=False)[0]
            
            # Get detections
            boxes_xyxy = results.boxes.xyxy.cpu().numpy()  # (x1, y1, x2, y2)
            confidences = results.boxes.conf.cpu().numpy()
            class_ids = results.boxes.cls.cpu().numpy().astype(int)
            
            # Format detections
            detections = []
            for box, conf, cls_id in zip(boxes_xyxy, confidences, class_ids):
                if conf >= self.conf_threshold:
                    x1, y1, x2, y2 = map(int, box)
                    w = x2 - x1
                    h = y2 - y1
                    
                    detection = {
                        'class': self.classes[cls_id],
                        'confidence': float(conf),
                        'bbox': [x1, y1, w, h],
                        'centroid_px': [x1 + w//2, y1 + h//2]
                    }
                    detections.append(detection)
            
            return detections
            
        except Exception as e:
            print(f"Error during YOLO detection: {e}")
            return []


class FasterRCNNDetector(BaseDetector):
    """Faster R-CNN detector wrapper (requires PyTorch)"""
    
    def __init__(self, model_path=None, conf_threshold=0.5):
        super().__init__()
        
        try:
            import torch
            import torchvision
            from torchvision.models.detection import fasterrcnn_resnet50_fpn
            
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            
            if model_path and os.path.exists(model_path):
                # Load custom trained model
                self.model = torch.load(model_path, map_location=self.device)
            else:
                # Load pre-trained COCO model
                self.model = fasterrcnn_resnet50_fpn(pretrained=True)
            
            self.model.to(self.device)
            self.model.eval()
            
            # COCO class names
            self.classes = [
                '__background__', 'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus',
                'train', 'truck', 'boat', 'traffic light', 'fire hydrant', 'N/A', 'stop sign',
                'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
                'elephant', 'bear', 'zebra', 'giraffe', 'N/A', 'backpack', 'umbrella', 'N/A', 'N/A',
                'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
                'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
                'bottle', 'N/A', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl',
                'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza',
                'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', 'N/A', 'dining table',
                'N/A', 'N/A', 'toilet', 'N/A', 'tv', 'laptop', 'mouse', 'remote', 'keyboard',
                'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'N/A', 'book',
                'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
            ]
            
            self.conf_threshold = conf_threshold
            self.is_loaded = True
            print(f"✓ Faster R-CNN detector loaded successfully on {self.device}")
            
        except Exception as e:
            print(f"Failed to load Faster R-CNN detector: {e}")
            self.is_loaded = False
    
    def detect(self, frame):
        """Detect objects using Faster R-CNN"""
        if not self.is_loaded:
            return []
        
        import torch
        import torchvision.transforms as T
        
        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Transform
        transform = T.Compose([T.ToTensor()])
        image_tensor = transform(frame_rgb).to(self.device)
        
        # Run inference
        with torch.no_grad():
            predictions = self.model([image_tensor])[0]
        
        # Process detections
        detections = []
        
        boxes = predictions['boxes'].cpu().numpy()
        labels = predictions['labels'].cpu().numpy()
        scores = predictions['scores'].cpu().numpy()
        
        for box, label, score in zip(boxes, labels, scores):
            if score > self.conf_threshold:
                x1, y1, x2, y2 = box.astype(int)
                w = x2 - x1
                h = y2 - y1
                
                detection = {
                    'class': self.classes[label],
                    'confidence': float(score),
                    'bbox': [int(x1), int(y1), int(w), int(h)],
                    'centroid_px': [int(x1 + w//2), int(y1 + h//2)]
                }
                detections.append(detection)
        
        return detections


def create_detector(detector_type, **kwargs):
    """
    Factory function to create detector instances
    
    Args:
        detector_type: 'mock', 'yolo', or 'fasterrcnn'
        **kwargs: Additional arguments for specific detectors
        
    Returns:
        Detector instance
    """
    if detector_type == 'mock':
        return MockDetector()
    
    elif detector_type == 'yolo':
        model_path = kwargs.get('model_path', 'yolov8n.pt')
        conf_threshold = kwargs.get('conf_threshold', 0.5)
        
        return YOLODetector(model_path, conf_threshold)
    
    elif detector_type == 'fasterrcnn':
        model_path = kwargs.get('model_path', None)
        conf_threshold = kwargs.get('conf_threshold', 0.5)
        
        return FasterRCNNDetector(model_path, conf_threshold)
    
    else:
        raise ValueError(f"Unknown detector type: {detector_type}")
