import os
import cv2
import glob
import xml.etree.ElementTree as ET
import numpy as np

class DatasetLoader:
    def __init__(self, config_path=None, base_path=r"D:\College\Year Four\GP\Technical Phase\Main Repo\Now_You_See_Me_Phosphenes\pipeline1\data\sequences", sequences=None):
        self.base_path = base_path
        if sequences:
            self.sequences = sequences
        else:
            self.sequences = sorted(os.listdir(base_path))
        self.current_seq = 0
        self.current_idx = 0
        self.frame_paths = self._get_frame_paths()

    def _numeric_sort(self, path):
        # Extract base name without extension, then convert to int
        return int(os.path.splitext(os.path.basename(path))[0])

    def _get_frame_paths(self):
        """
        Collects all frame paths for RGB, depth, and labels from the dataset.
        """
        paths = []
        for seq in self.sequences:
            # print(seq)
            # non-nested structure
            # rgb_files = sorted(glob.glob(os.path.join(self.base_path, seq, "Color", "*.png")))
            # depth_files = sorted(glob.glob(os.path.join(self.base_path, seq, "Depth", "*.png")))
            # label_files = sorted(glob.glob(os.path.join(self.base_path, seq, "Labels", "*.xml")))

            # nested structure
            inner = seq  # because structure is seq/seq/Color
            rgb_files = sorted(glob.glob(os.path.join(self.base_path, seq, inner, "Color", "*.png")), key=self._numeric_sort)
            depth_files = sorted(glob.glob(os.path.join(self.base_path, seq, inner, "Depth", "*.png")), key=self._numeric_sort)
            label_files = sorted(glob.glob(os.path.join(self.base_path, seq, inner, "Labels", "*.xml")), key=self._numeric_sort)
            
            seq_data = list(zip(rgb_files, depth_files, label_files))
            paths.extend(seq_data)
        # print(paths)
        return paths

    def parse_label(self, label_path):
        """
        Parses an XML annotation file and returns object bounding boxes.
        """
        objects = []
        tree = ET.parse(label_path)
        root = tree.getroot()
        for obj in root.findall('object'):
            class_id = int(obj.find('name').text)
            bbox = obj.find('bndbox')
            xmin = int(bbox.find('xmin').text)
            ymin = int(bbox.find('ymin').text)
            xmax = int(bbox.find('xmax').text)
            ymax = int(bbox.find('ymax').text)
            objects.append({"class_id": class_id, "bbox": (xmin, ymin, xmax, ymax)})
        return objects

    def __iter__(self):
        return self

    def __next__(self):
        if self.current_idx >= len(self.frame_paths):
            raise StopIteration
        rgb_path, depth_path, label_path = self.frame_paths[self.current_idx]
        rgb = cv2.imread(rgb_path)
        depth = cv2.imread(depth_path, cv2.IMREAD_UNCHANGED)
        labels = self.parse_label(label_path)
        self.current_idx += 1
        return rgb, depth, labels, rgb_path
