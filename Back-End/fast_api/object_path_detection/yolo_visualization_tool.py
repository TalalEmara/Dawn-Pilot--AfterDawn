"""
YOLO Dataset Visualization Tool
--------------------------------
Visualize YOLO annotations (.txt) or JSON detections on images
to verify correctness of the dataset generated from A-Frame scene.

Usage:
    python yolo_visualization_tool.py --input dataset/ --format yolo
    python yolo_visualization_tool.py --input dataset/ --format json
"""

import os
import cv2
import numpy as np
import argparse
import json
from pathlib import Path

# Load YOLO class mapping from existing file
YOLO_CLASS_MAPPING_FILE = "yolo_class_mapping.json"

class YoloVisualizer:
    def __init__(self, class_mapping_file=None):
        """
        Initialize visualizer with class mapping.
        """
        if class_mapping_file and os.path.exists(class_mapping_file):
            with open(class_mapping_file, 'r') as f:
                self.class_map = json.load(f)
        else:
            # Default mapping if file not found
            self.class_map = {
                "0": "Car",
                "1": "Pole",
                "3": "Bus station",
                "5": "Tree Trunk",
                "6": "Person",
                "15": "Potted Plant"
            }
        
        print(f"📊 Loaded class mapping: {self.class_map}")

    def visualize_yolo_format(self, image_path, annotation_path, output_path=None, show=True):
        """
        Visualize YOLO format annotations (.txt file)
        
        YOLO format: class_id x_center y_center width height (all normalized 0-1)
        """
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            print(f"❌ Failed to load image: {image_path}")
            return None
        
        h, w = image.shape[:2]
        
        # Read YOLO annotations
        if not os.path.exists(annotation_path):
            print(f"⚠️ Annotation file not found: {annotation_path}")
            return image
        
        with open(annotation_path, 'r') as f:
            lines = f.readlines()
        
        detection_count = 0
        
        for line in lines:
            parts = line.strip().split()
            if len(parts) != 5:
                continue
            
            class_id, x_center, y_center, box_w, box_h = map(float, parts)
            class_id = int(class_id)
            
            # Convert normalized coordinates to pixel coordinates
            x_center_px = x_center * w
            y_center_px = y_center * h
            box_w_px = box_w * w
            box_h_px = box_h * h
            
            # Calculate top-left corner
            x1 = int(x_center_px - box_w_px / 2)
            y1 = int(y_center_px - box_h_px / 2)
            x2 = int(x_center_px + box_w_px / 2)
            y2 = int(y_center_px + box_h_px / 2)
            
            # Get class name
            class_name = self.class_map.get(str(class_id), f"Class_{class_id}")
            
            # Draw bounding box (red)
            cv2.rectangle(image, (x1, y1), (x2, y2), (0, 0, 255), 2)
            
            # Draw label background
            label = f"{class_name}"
            label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            label_w, label_h = label_size
            
            # Draw semi-transparent background
            overlay = image.copy()
            cv2.rectangle(overlay, (x1, y1 - label_h - 10), (x1 + label_w + 10, y1), (0, 0, 255), -1)
            cv2.addWeighted(overlay, 0.6, image, 0.4, 0, image)
            
            # Draw label text (white)
            cv2.putText(image, label, (x1 + 5, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            detection_count += 1
        
        # Add info text
        info_text = f"Detections: {detection_count}"
        cv2.putText(image, info_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        # Save or show
        if output_path:
            cv2.imwrite(output_path, image)
            print(f"✅ Saved visualization to: {output_path}")
        
        if show:
            cv2.imshow(f"YOLO Visualization - {os.path.basename(image_path)}", image)
            cv2.waitKey(0)
            cv2.destroyAllWindows()
        
        return image

    def visualize_json_format(self, json_path, output_path=None, show=True):
        """
        Visualize JSON format detections (compatible with existing backend format)
        """
        # Load JSON
        with open(json_path, 'r') as f:
            data = json.load(f)
        
        # Load image
        image_path = data.get("file_path")
        
        # If relative path, try to find image in same directory as JSON
        if not os.path.isabs(image_path):
            json_dir = os.path.dirname(json_path)
            image_filename = os.path.basename(image_path)
            image_path = os.path.join(json_dir, image_filename)
        
        image = cv2.imread(image_path)
        if image is None:
            print(f"❌ Failed to load image: {image_path}")
            return None
        
        # Draw detections
        obstacles = data.get("obstacles", [])
        
        for obj in obstacles:
            x, y, w, h = obj["bbox"]
            class_name = obj["class"]
            
            # Draw rectangle (red, thickness 2)
            cv2.rectangle(image, (x, y), (x + w, y + h), (0, 0, 255), 2)
            
            # Draw label background
            label_size, _ = cv2.getTextSize(class_name, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            label_w, label_h = label_size
            
            overlay = image.copy()
            cv2.rectangle(overlay, (x, y - label_h - 10), (x + label_w + 10, y), (0, 0, 255), -1)
            cv2.addWeighted(overlay, 0.6, image, 0.4, 0, image)
            
            # Draw label text (white)
            cv2.putText(image, class_name, (x + 5, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Add info
        frame_id = data.get("frame_id", "unknown")
        info_text = f"Frame: {frame_id} | Detections: {len(obstacles)}"
        cv2.putText(image, info_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        
        # Save or show
        if output_path:
            cv2.imwrite(output_path, image)
            print(f"✅ Saved visualization to: {output_path}")
        
        if show:
            cv2.imshow(f"JSON Visualization - {frame_id}", image)
            cv2.waitKey(0)
            cv2.destroyAllWindows()
        
        return image

    def process_dataset_directory(self, dataset_dir, output_dir=None, format='yolo', show_each=False):
        """
        Process entire dataset directory and visualize all frames.
        
        Args:
            dataset_dir: Path to dataset directory
            output_dir: Path to save visualizations (optional)
            format: 'yolo' or 'json'
            show_each: Show each frame individually (press key to continue)
        """
        dataset_path = Path(dataset_dir)
        
        if output_dir:
            output_path = Path(output_dir)
            output_path.mkdir(parents=True, exist_ok=True)
        
        if format == 'yolo':
            # Find all .txt files
            annotation_files = sorted(dataset_path.glob("*.txt"))
            
            print(f"📂 Found {len(annotation_files)} YOLO annotation files")
            
            for ann_file in annotation_files:
                # Find corresponding image
                image_name = ann_file.stem + ".jpg"
                image_path = dataset_path / image_name
                
                if not image_path.exists():
                    print(f"⚠️ Image not found for {ann_file.name}, skipping")
                    continue
                
                # Visualize
                output_file = None
                if output_dir:
                    output_file = output_path / f"vis_{image_name}"
                
                print(f"🎨 Visualizing {ann_file.name}...")
                self.visualize_yolo_format(
                    str(image_path), 
                    str(ann_file), 
                    str(output_file) if output_file else None,
                    show=show_each
                )
        
        elif format == 'json':
            # Find all .json files
            json_files = sorted(dataset_path.glob("*.json"))
            
            print(f"📂 Found {len(json_files)} JSON detection files")
            
            for json_file in json_files:
                output_file = None
                if output_dir:
                    output_file = output_path / f"vis_{json_file.stem}.jpg"
                
                print(f"🎨 Visualizing {json_file.name}...")
                self.visualize_json_format(
                    str(json_file),
                    str(output_file) if output_file else None,
                    show=show_each
                )
        
        print(f"✅ Processed all files!")
        if output_dir:
            print(f"📁 Visualizations saved to: {output_dir}")


def main():
    parser = argparse.ArgumentParser(description="Visualize YOLO dataset annotations")
    parser.add_argument("--input", "-i", required=True, help="Input dataset directory")
    parser.add_argument("--output", "-o", help="Output directory for visualizations")
    parser.add_argument("--format", "-f", choices=['yolo', 'json'], default='yolo', 
                       help="Annotation format (yolo or json)")
    parser.add_argument("--show", "-s", action="store_true", 
                       help="Show each frame individually (press key to continue)")
    parser.add_argument("--class-map", "-c", 
                       default="../object_path_detection/yolo_class_mapping.json",
                       help="Path to YOLO class mapping JSON file")
    
    args = parser.parse_args()
    
    # Initialize visualizer
    visualizer = YoloVisualizer(class_mapping_file=args.class_map)
    
    # Process dataset
    visualizer.process_dataset_directory(
        dataset_dir=args.input,
        output_dir=args.output,
        format=args.format,
        show_each=args.show
    )


if __name__ == "__main__":
    main()


"""
Example Usage:
--------------

1. Visualize YOLO format (.txt) and save to output folder:
   python yolo_visualization_tool.py --input ./dataset --output ./visualized --format yolo

2. Visualize JSON format and show each frame:
   python yolo_visualization_tool.py --input ./dataset --format json --show

3. Visualize with custom class mapping:
   python yolo_visualization_tool.py --input ./dataset --class-map ./my_mapping.json --format yolo

4. Quick check (YOLO format, no saving):
   python yolo_visualization_tool.py --input ./dataset --format yolo --show
"""
