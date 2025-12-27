"""
Navigation Translator - Dynamic Visual Perception System

This module provides a sophisticated translator for converting navigation data into 
simplified visual representations for phosphene-based navigation systems.

Key Features:
- Dynamic image dimension detection and adaptation
- Flexible object rendering with canonical shape definitions
- Support for multiple dataset formats and image sizes
- Automatic fallback rendering for unknown object classes
- Special handling for architectural elements (doors, walls, etc.)

Author: Navigation Team
Date: October 2025
"""

import json
import os
import time
import numpy as np
import cv2
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
import matplotlib.patches as patches


class Translator:
    """
    Navigation Translator for converting object detection data into simplified visual representations.
    
    This class processes frame bundle data containing object detections and camera information,
    then renders simplified visual representations suitable for phosphene-based navigation systems.
    The translator automatically adapts to different input image dimensions and provides
    intelligent fallback rendering for unknown object classes.
    """
    
    def __init__(self, bundle_path, shapes_path, params_path, calib_path=None, output_dir="output"):
        """
        Initialize the Navigation Translator with configuration files.
        
        Args:
            bundle_path (str): Path to frame bundle JSON containing object detections
            shapes_path (str): Path to canonical shapes configuration JSON
            params_path (str): Path to selection parameters JSON
            calib_path (str, optional): DEPRECATED - no longer used
            output_dir (str): Directory for saving output images
            
        Raises:
            FileNotFoundError: If any required configuration file is missing
            ValueError: If bundle is missing required obstacle data
        """
        # Load configuration files
        with open(bundle_path) as f:
            self.bundle = json.load(f)

        with open(shapes_path) as f:
            self.shapes = json.load(f)

        with open(params_path) as f:
            self.params = json.load(f)

        # Create output directory if it doesn't exist
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

        # Detect obstacles key format (handles different bundle schemas)
        if "obstacles" in self.bundle:
            self.obstacles_key = "obstacles"
        elif "obstacle_list" in self.bundle:
            self.obstacles_key = "obstacle_list"
        else:
            raise ValueError("Bundle missing 'obstacles' or 'obstacle_list' field")

        # Dynamic Image Dimension Detection and Canvas Configuration
        # Auto-detect input image dimensions from metadata
        self.input_width, self.input_height = self._detect_input_image_size()
        
        # Configure canvas to dynamically match input image dimensions
        # This ensures the translator works with any input image size
        self.params["canvas_size"] = [self.input_height, self.input_width]  # Format: [H, W]
        self.canvas_size = (self.input_width, self.input_height)  # Format: (W, H) for easy access

    def _detect_input_image_size(self):
        """
        Detect input image dimensions from metadata.
        
        Detection methods (in priority order):
        1. Extract dimensions from bundle metadata (image_width, image_height)
        2. Infer from object bounding box extents with padding
        3. Fallback to reasonable default dimensions
        
        Returns:
            tuple: (width, height) of detected input image dimensions
        """
        
        # Method 1: Check if dimensions are explicitly provided in metadata
        metadata = self.bundle.get("metadata", {})
        if "image_width" in metadata and "image_height" in metadata:
            width = int(metadata["image_width"])
            height = int(metadata["image_height"])
            return width, height
            
        # Method 2: Check if dimensions are in bundle root
        if "image_width" in self.bundle and "image_height" in self.bundle:
            width = int(self.bundle["image_width"])
            height = int(self.bundle["image_height"])
            return width, height
            
        # Method 3: Infer from object bounding boxes (find maximum extent)
        max_x = max_y = 0
        obstacles_key = "obstacles" if "obstacles" in self.bundle else "obstacle_list"
        
        if obstacles_key in self.bundle:
            for obj in self.bundle[obstacles_key]:
                bbox = obj.get("bbox", [])
                if len(bbox) >= 4:
                    x, y, w, h = bbox[:4]
                    max_x = max(max_x, x + w)
                    max_y = max(max_y, y + h)
                
        # Also check free path center coordinates
        free_path = self.bundle.get("free_path", {})
        if "center" in free_path:
            center = free_path["center"]
            radius = free_path.get("radius", 0)
            max_x = max(max_x, center[0] + radius)
            max_y = max(max_y, center[1] + radius)
            
        if max_x > 0 and max_y > 0:
            # Add padding to account for objects extending to image edges
            width = int(max_x * 1.1)
            height = int(max_y * 1.1)
            return width, height
            
        # Method 4: Fallback to reasonable defaults for edge cases
        width = 1280
        height = 720
        return width, height

    # =====================================================================================
    # OBJECT SCORING AND SELECTION METHODS
    # =====================================================================================
    
    def score_object(self, obj):
        """
        Calculate importance score for an object based on multiple factors.
        
        Scoring considers:
        - Distance: Closer objects are more important for navigation
        - Semantics: Object class priority (person > car > furniture)
        - Motion: Moving objects require more attention
        - Confidence: Higher confidence detections are preferred  
        - Hazard: Dangerous objects get maximum priority
        
        Args:
            obj (dict): Object data with keys like distance_m, class, velocity, etc.
            
        Returns:
            float: Normalized importance score (0.0 to 1.0+)
        """
        weights = self.params.get("weights", {})
        
        # Distance scoring: closer objects are more important
        dist = float(obj.get("distance_m", obj.get("depth", obj.get("depth_z", 10.0))))
        score_distance = 1.0 / (1.0 + dist)
        
        # Semantic scoring: different object classes have different navigation importance
        object_class = obj.get("class", "")
        score_semantic = float(self.params.get("semantic_priority", {}).get(object_class, 0.5))
        
        # Motion scoring: moving objects require attention
        velocity = obj.get("velocity", 0.0)
        try:
            score_velocity = float(np.linalg.norm(velocity))  # Handle vector velocity
        except:
            score_velocity = float(velocity) if velocity is not None else 0.0
            
        # Confidence scoring: trust higher confidence detections
        score_confidence = float(obj.get("confidence", 1.0))
        
        # Hazard scoring: dangerous objects get maximum attention
        is_hazard = bool(obj.get("hazard", False) or obj.get("is_hazard", False))
        score_hazard = 1.0 if is_hazard else 0.0

        # Combine weighted scores
        total_score = (weights.get("dist", 0.4) * score_distance +
                      weights.get("sem", 0.3) * score_semantic +
                      weights.get("vel", 0.0) * score_velocity +
                      weights.get("conf", 0.0) * score_confidence +
                      weights.get("hazard", 0.0) * score_hazard)
        
        return total_score

    def select_objects(self):
        """
        Filter and rank obstacles based on scores and selection parameters.
        
        Selection process:
        1. Score all objects using multiple criteria
        2. Apply minimum score threshold filtering
        3. Limit total number of objects (K_min to K_max)
        4. Ensure objects fit within canvas bounds
        
        Returns:
            list: Selected and sorted objects for rendering
        """
        # Get canvas dimensions and scaling factors
        H, W = self.params.get("canvas_size", [1024, 2048])
        input_w = self.input_width
        input_h = self.input_height
        scale_x = W / input_w if input_w > 0 else 1.0
        scale_y = H / input_h if input_h > 0 else 1.0
        
        objs = []
        for o in self.bundle[self.obstacles_key]:
            # normalize some fields and compute centroid if missing
            bbox = o.get("bbox", None)
            if bbox and len(bbox) == 4:
                x,y,w,h = bbox
                # convert to ints
                x,y,w,h = int(x), int(y), int(w), int(h)
                
                # Store original bbox
                o["bbox_px"] = [x, y, x + w, y + h]
                
                # Scale centroid to canvas coordinates
                canvas_cx = int((x + w/2) * scale_x)
                canvas_cy = int((y + h/2) * scale_y)
                o["centroid_px"] = [canvas_cx, canvas_cy]
            else:
                # fallback centroid at image center (will be scaled to canvas)
                if "centroid_px" not in o:
                    o["centroid_px"] = [int((self.input_width / 2) * scale_x), int((self.input_height / 2) * scale_y)]

            # ensure distance field available
            if "distance_m" in o:
                o["depth"] = float(o["distance_m"])
            elif "depth_z" in o:
                o["depth"] = float(o["depth_z"])
            else:
                o["depth"] = float(o.get("depth", 10.0))

            o["score"] = self.score_object(o)
            objs.append(o)

        objs = sorted(objs, key=lambda x: x["score"], reverse=True)

        Kmin = int(self.params.get("K_min", 1))
        Kmax = int(self.params.get("K_max", max(1, Kmin)))
        Tmin = float(self.params.get("T_min", 0.0))
        
        print(f"[Translator] Total objects: {len(objs)}, Kmin={Kmin}, Kmax={Kmax}, Tmin={Tmin}")
        for obj in objs[:5]:  # Show first 5
            print(f"  - {obj.get('class')}: score={obj.get('score', 0):.3f}")

        selected = [o for o in objs if o["score"] > Tmin]
        if len(selected) > Kmax:
            selected = selected[:Kmax]
        if len(selected) < Kmin:
            selected = objs[:Kmin]
        return selected

    # ---------------- projection / sizing ----------------
    def project_size(self, shape_def, depth):
        """
        Convert real-world dimensions to pixel size using dynamic scaling.
        
        This method calculates object pixel sizes based on:
        - Real-world object dimensions (meters)
        - Distance from camera (depth in meters)
        - Image dimensions (for dynamic field of view estimation)
        
        No camera intrinsics needed - uses image dimensions to estimate FOV.
        """
        # shape_def.real_size_m is expected as [W, H, D]
        real = shape_def.get("real_size_m", [1.0, 1.0, 1.0])
        # ensure three values
        if len(real) < 2:
            real_w, real_h = float(real[0]), float(real[0])
        else:
            real_w, real_h = float(real[0]), float(real[1])
        
        # avoid division by zero
        z = max(float(depth), 0.01)
        
        # Estimate focal length from image dimensions
        # Assume typical horizontal FOV of ~60 degrees for navigation cameras
        fov_horizontal_deg = 60.0
        fov_horizontal_rad = np.deg2rad(fov_horizontal_deg)
        
        # Calculate effective focal length from image width and FOV
        # f = width / (2 * tan(FOV/2))
        fx_estimated = self.input_width / (2.0 * np.tan(fov_horizontal_rad / 2.0))
        
        # Assume square pixels (fx ≈ fy)
        fy_estimated = fx_estimated
        
        # Angular size approximation -> pixel
        wpx_raw = abs(2.0 * fx_estimated * np.tan((real_w / (2.0 * z))))
        hpx_raw = abs(2.0 * fy_estimated * np.tan((real_h / (2.0 * z))))
        
        # clamp
        min_px = int(shape_def.get("min_px", 4))
        max_px = int(shape_def.get("max_px", max(64, min_px)))
        wpx = int(np.clip(wpx_raw, min_px, max_px))
        hpx = int(np.clip(hpx_raw, min_px, max_px))
        
        return wpx, hpx

    # =====================================================================================
    # OBJECT RENDERING METHODS
    # =====================================================================================
    
    def draw_shape(self, canvas, obj, target_canvas_size=(128, 128), original_image_size=None):
        """
        Render an object on the canvas using canonical shape definitions with retinotopic mapping.
        
        This method provides intelligent rendering with:
        - Retinotopic coordinate mapping: normalizes coordinates from original resolution to target canvas
        - Minimum draw size enforcement (3x3 pixels) to prevent objects from disappearing
        - Automatic fallback for unknown object classes (green filled rectangles)
        - Special handling for architectural elements (doors as yellow outlines)
        - Respect for min/max pixel size constraints
        
        Args:
            canvas (numpy.ndarray): Target canvas for rendering (e.g., 128x128)
            obj (dict): Object data containing class, bbox, centroid_px, etc.
            target_canvas_size (tuple): Target canvas dimensions (width, height)
            original_image_size (tuple): Original image dimensions (width, height) for coordinate normalization
        """
        object_class = obj.get("class", "")
        # Make class name lookup case-insensitive by converting to lowercase
        object_class_lower = object_class.lower()
        shape_def = self.shapes.get(object_class_lower, None)
        
        # Handle missing shape definitions with intelligent fallback
        if shape_def is None:
            # Try using object's own 'shape' key as fallback
            fallback_shape = obj.get("shape", None)
            if fallback_shape:
                shape_def = {
                    "shape": fallback_shape, 
                    "real_size_m": [1.0, 1.0, 1.0], 
                    "min_px": 4, 
                    "max_px": 60, 
                    "render_style": "filled"
                }
            else:
                # Create default green rectangle for completely unknown classes
                shape_def = {
                    "shape": "box", 
                    "real_size_m": [1.0, 1.0, 1.0], 
                    "min_px": 4, 
                    "max_px": 800, 
                    "render_style": "filled",
                    "color": [0, 255, 0]  # Green for unknown objects
                }

        # Use provided original image size or fallback to instance attributes
        if original_image_size is None:
            orig_width, orig_height = self.input_width, self.input_height
        else:
            orig_width, orig_height = original_image_size
        
        target_width, target_height = target_canvas_size
        
        # RETINOTOPIC MAPPING: Normalize coordinates from original resolution to 0-1 range,
        # then scale to target canvas (e.g., 128x128)
        centroid = obj.get("centroid_px", [orig_width // 2, orig_height // 2])
        cx_original, cy_original = centroid[0], centroid[1]
        
        # Normalize to 0-1 range
        cx_normalized = cx_original / orig_width
        cy_normalized = cy_original / orig_height
        
        # Scale to target canvas
        cx = int(cx_normalized * target_width)
        cy = int(cy_normalized * target_height)
        
        # Calculate rendering dimensions from bounding box with retinotopic scaling
        bbox = obj.get("bbox", [0, 0, 50, 50])  # [x, y, w, h]
        bbox_w, bbox_h = bbox[2], bbox[3]
        
        # Scale bbox dimensions using retinotopic mapping
        scale_x = target_width / orig_width
        scale_y = target_height / orig_height
        wpx = int(bbox_w * scale_x)
        hpx = int(bbox_h * scale_y)
        
        # CRITICAL: Enforce minimum draw size (3x3 pixels) to prevent distant objects from disappearing
        MIN_DRAW_SIZE = 3
        wpx = max(MIN_DRAW_SIZE, wpx)
        hpx = max(MIN_DRAW_SIZE, hpx)
        
        # Apply size constraints from shape definition
        min_px = int(shape_def.get("min_px", MIN_DRAW_SIZE))
        max_px = int(shape_def.get("max_px", max(64, min_px)))
        wpx = max(min_px, min(wpx, max_px))
        hpx = max(min_px, min(hpx, max_px))

        render_style = shape_def.get("render_style", "filled")
        thickness = -1 if render_style == "filled" else int(shape_def.get("outline_thickness", 2))
        color = tuple(shape_def.get("color", [255,255,255]))

        # hazard blinking support: if object has hazard True, blink by toggling on odd/even frames
        hazard_flag = bool(obj.get("hazard", False) or obj.get("is_hazard", False))
        blink_period = int(self.params.get("blink_period", 6))
        if hazard_flag:
            # check frame counter in params memory (store if not present)
            frame_idx = int(self.params.get("_frame_idx", 0))
            # blink pattern: visible when (frame_idx // period) % 2 == 1
            visible = ((frame_idx // blink_period) % 2) == 1
            # increment stored frame counter
            self.params["_frame_idx"] = frame_idx + 1
            # TEMP FIX: Always show hazardous objects (disable blinking)
            # if not visible:
            #     return  # skip drawing on "off" frames
            color = (0,255,255)  # hazard color (yellowish)
            thickness = int(shape_def.get("hazard_thickness", 3))

        shape = shape_def.get("shape", "box")
        
        # Special handling for doorway and door objects - render as outline spanning exact bbox
        if object_class in ("doorway", "door"):
            bbox = obj.get("bbox", [0, 0, 50, 50])  # [x, y, w, h]
            x, y, w, h = bbox
            
            # Apply retinotopic mapping to bbox coordinates
            x_normalized = x / orig_width
            y_normalized = y / orig_height
            w_normalized = w / orig_width
            h_normalized = h / orig_height
            
            x_scaled = int(x_normalized * target_width)
            y_scaled = int(y_normalized * target_height)
            w_scaled = max(MIN_DRAW_SIZE, int(w_normalized * target_width))
            h_scaled = max(MIN_DRAW_SIZE, int(h_normalized * target_height))
            
            # Draw outline rectangle spanning exact bbox dimensions
            outline_thickness = 2
            door_color = (255, 255, 0)  # Yellow for doors
            cv2.rectangle(canvas, (x_scaled, y_scaled), (x_scaled + w_scaled, y_scaled + h_scaled), door_color, outline_thickness)
            return
        
        # Regular shape rendering for other objects
        if shape in ("oval", "vertical_oval", "ellipse"):
            cv2.ellipse(canvas, (cx, cy), (wpx//2, hpx//2), 0, 0, 360, color, thickness)
        elif shape in ("box", "rectangle"):
            cv2.rectangle(canvas, (cx - wpx//2, cy - hpx//2), (cx + wpx//2, cy + hpx//2), color, thickness)
        elif shape in ("thin_rectangle", "thin_rect", "pole"):
            cv2.rectangle(canvas, (cx - max(1,wpx//8), cy - hpx//2), (cx + max(1,wpx//8), cy + hpx//2), color, thickness)
        elif shape == "wedge":
            pts = np.array([[cx - wpx//2, cy + hpx//2],[cx + wpx//2, cy + hpx//2],[cx, cy - hpx//2]], np.int32)
            if thickness < 0:
                cv2.fillPoly(canvas, [pts], color)
            else:
                cv2.polylines(canvas, [pts], isClosed=True, color=color, thickness=thickness)
        elif shape in ("disk", "circle"):
            cv2.circle(canvas, (cx, cy), max(1, wpx//2), color, thickness)
        else:
            # fallback: draw bbox if available
            bbox_px = obj.get("bbox_px")
            if bbox_px:
                x1,y1,x2,y2 = bbox_px
                cv2.rectangle(canvas, (x1,y1), (x2,y2), color, thickness)

    def draw_freepath(self, canvas):
        """Draw the free path indicator on the canvas."""
        fp = self.bundle.get("free_path", None)
        if not fp:
            return
            
        center = fp.get("center", None) or fp.get("center_px", None)
        radius = fp.get("radius", None) or fp.get("corridor_width_px", None)
        
        # Skip drawing if center or radius is None
        if center is None or radius is None:
            return
        
        # Convert to int after null check
        radius = int(radius)
        
        if center and len(center) >= 2:
            # Scale free path coordinates to canvas
            H, W = canvas.shape[:2]
            input_w = self.input_width
            input_h = self.input_height
            scale_x = W / input_w if input_w > 0 else 1.0
            scale_y = H / input_h if input_h > 0 else 1.0
            
            cx = int(center[0] * scale_x)
            cy = int(center[1] * scale_y)
            scaled_radius = int(radius * min(scale_x, scale_y))
            
            # Ensure free path stays within canvas bounds
            cx = max(scaled_radius, min(cx, W - scaled_radius))
            cy = max(scaled_radius, min(cy, H - scaled_radius))
            
            # Draw white circle for free-path indicator (survives binarization)
            cv2.circle(canvas, (cx, cy), scaled_radius, (255, 255, 255), -1)

    # ---------------- debugging methods ----------------
    def visualize_bboxes(self, save_path="bbox_overlay.png"):
        """Visualize original bounding boxes on a canvas to verify detection accuracy."""
        # Use dynamic canvas size
        W, H = self.canvas_size
        
        # Calculate scaling factors from input to canvas
        input_w = self.input_width
        input_h = self.input_height
        scale_x = W / input_w if input_w > 0 else 1.0
        scale_y = H / input_h if input_h > 0 else 1.0
        
        # Create figure with exact canvas dimensions
        dpi = 80
        fig_width = W / dpi
        fig_height = H / dpi
        
        fig, ax = plt.subplots(1, 1, figsize=(fig_width, fig_height), dpi=dpi)
        fig.subplots_adjust(left=0, right=1, top=1, bottom=0)
        ax.set_position([0, 0, 1, 1])
        
        ax.set_xlim(0, W)
        ax.set_ylim(H, 0)  # Flip Y axis to match image coordinates
        ax.set_aspect('equal')
        ax.set_title(f'Original Bounding Boxes (scaled from {input_w}x{input_h} to {W}x{H})')
        
        # Create black canvas
        canvas = np.zeros((H, W, 3), dtype=np.uint8)
        ax.imshow(canvas, extent=[0, W, H, 0])
        
        # Draw bounding boxes for all objects
        colors = ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan', 'orange', 'purple']
        for i, obj in enumerate(self.bundle[self.obstacles_key]):
            bbox = obj.get("bbox", None)
            if bbox and len(bbox) == 4:
                x, y, w, h = bbox
                
                # Scale to canvas coordinates
                x_scaled = x * scale_x
                y_scaled = y * scale_y  
                w_scaled = w * scale_x
                h_scaled = h * scale_y
                
                color = colors[i % len(colors)]
                
                # Draw if bbox is within canvas bounds
                if (x_scaled + w_scaled > 0 and x_scaled < W and 
                    y_scaled + h_scaled > 0 and y_scaled < H):
                    
                    rect = Rectangle((x_scaled, y_scaled), w_scaled, h_scaled, 
                                   linewidth=3, edgecolor=color, facecolor='none', alpha=0.9)
                    ax.add_patch(rect)
                    
                    # Add label with class and distance
                    label = f"{obj.get('class', 'unknown')} ({obj.get('distance_m', 'N/A')}m)"
                    label_y = max(5, y_scaled - 5) if y_scaled > 20 else y_scaled + h_scaled + 15
                    ax.text(x_scaled, label_y, label, color=color, fontsize=12, fontweight='bold',
                           bbox=dict(boxstyle="round,pad=0.3", facecolor='white', alpha=0.8, edgecolor=color))
        
        # Save with exact dimensions
        bbox_path = os.path.join(self.output_dir, save_path)
        plt.savefig(bbox_path, dpi=dpi, bbox_inches=None, pad_inches=0)
        plt.close()
        return bbox_path

    def debug_object_scores(self):
        """Print detailed scoring information for each object."""
        # Debug method - disabled to reduce console output
        # Re-enable if detailed scoring analysis is needed
        pass

    def test_threshold_effects(self, threshold_values=[0.0, 0.2, 0.4, 0.6, 0.8]):
        """Test different T_min values to see how object selection changes."""
        # Debug method - disabled to reduce console output
        # Re-enable if threshold testing is needed
        return
        
        original_tmin = self.params.get("T_min", 0.0)
        
        # Get all objects with scores
        objs = []
        for o in self.bundle[self.obstacles_key]:
            obj_copy = o.copy()
            bbox = obj_copy.get("bbox", None)
            if bbox and len(bbox) == 4:
                x, y, w, h = bbox
                x, y, w, h = int(x), int(y), int(w), int(h)
                obj_copy["bbox_px"] = [x, y, x + w, y + h]
                obj_copy["centroid_px"] = [int(x + w/2), int(y + h/2)]
            else:
                if "centroid_px" not in obj_copy:
                    obj_copy["centroid_px"] = [self.input_width // 2, self.input_height // 2]

            if "distance_m" in obj_copy:
                obj_copy["depth"] = float(obj_copy["distance_m"])
            elif "depth_z" in obj_copy:
                obj_copy["depth"] = float(obj_copy["depth_z"])
            else:
                obj_copy["depth"] = float(obj_copy.get("depth", 10.0))

            obj_copy["score"] = self.score_object(obj_copy)
            objs.append(obj_copy)
        
        objs = sorted(objs, key=lambda x: x["score"], reverse=True)
        
        for tmin in threshold_values:
            self.params["T_min"] = tmin
            selected = self.select_objects()
            
            print(f"\nT_min = {tmin:.1f}:")
            print(f"  Selected {len(selected)} objects:")
            for obj in selected:
                print(f"    - {obj.get('class', 'unknown')} (score: {obj['score']:.3f})")
                
            # Generate image for this threshold
            W, H = self.canvas_size
            canvas = np.zeros((H, W, 3), dtype=np.uint8)
            self.draw_freepath(canvas)
            for obj in selected:
                self.draw_shape(canvas, obj)
                
            out_path = os.path.join(self.output_dir, f"threshold_test_T{tmin:.1f}.png")
            cv2.imwrite(out_path, canvas)
            print(f"    -> Saved visualization: {out_path}")
        
        # Restore original threshold
        self.params["T_min"] = original_tmin
        print("="*60 + "\n")

    # =====================================================================================
    # MAIN RENDERING PIPELINE
    # =====================================================================================
    
    def run(self, out_name="frame_simp.png", save_to_disk=True, target_canvas_size=(128, 128), draw_freepath=True):
        """
        Execute the complete navigation translation pipeline with retinotopic mapping.
        
        This is the main method that orchestrates the entire process:
        1. Creates 128x128 canvas directly (no center crop needed)
        2. Applies retinotopic coordinate mapping: normalizes from original resolution to 128x128
        3. Renders free path navigation area with coordinate transformation (optional)
        4. Selects most important objects based on scoring
        5. Renders selected objects with retinotopic mapping and minimum draw size
        6. Optionally saves the final simplified navigation image
        
        Args:
            out_name (str): Output filename for the rendered image
            save_to_disk (bool): Whether to save the image to disk (default: False for WebSocket)
            target_canvas_size (tuple): Target output dimensions (width, height), default (128, 128)
            draw_freepath (bool): Whether to draw the freepath area (default: True)
            
        Returns:
            tuple: (canvas_array, output_path) where canvas_array is 128x128 numpy image
        """
        # RETINOTOPIC MAPPING: Create target canvas directly (e.g., 128x128)
        # No center crop needed - full field of view is preserved through coordinate normalization
        target_width, target_height = target_canvas_size
        canvas = np.zeros((target_height, target_width, 3), dtype=np.uint8)
        
        # Store original image dimensions for coordinate transformation
        original_image_size = (self.input_width, self.input_height)

        
        start_time = time.time()
        # Step 1: Draw free path navigation area (background element) - optional
        if draw_freepath:
            self.draw_freepath(canvas)
        free_path_time = (time.time() - start_time) * 1000

        # Step 2: Select most important objects for navigation
        select_start = time.time()
        selected = self.select_objects()
        select_time = (time.time() - select_start) * 1000
        
        print(f"[Translator] Selected {len(selected)} objects to render")
        for obj in selected:
            print(f"  - class={obj.get('class')}, bbox={obj.get('bbox')}, score={obj.get('score', 0):.3f}")

        # Step 3: Render each selected object with retinotopic coordinate mapping
        render_start = time.time()
        for i, obj in enumerate(selected):
            object_class = obj.get("class", "unknown")
            centroid_original = obj.get("centroid_px", [self.input_width//2, self.input_height//2])
            print(f"[Translator] Drawing object {i}: class={object_class}, centroid_original={centroid_original}")
            # Apply retinotopic mapping: coordinates normalized and scaled to target canvas
            self.draw_shape(canvas, obj, target_canvas_size=target_canvas_size, original_image_size=original_image_size)
        render_time = (time.time() - render_start) * 1000
        print(f"[Translator] Timing (ms): free_path={free_path_time:.2f}, select={select_time:.2f}, render={render_time:.2f}")
        print(f"[Translator] Output canvas size: {target_width}x{target_height} (retinotopic mapping from {self.input_width}x{self.input_height})")
        
        # Step 5: Optionally save final simplified navigation image
        out_path = ""
        if save_to_disk:
            out_path = os.path.join(self.output_dir, out_name)
            cv2.imwrite(out_path, canvas)
            print(f"Saved simplified image at {out_path}")
        else:
            print(f"[Translator] Skipping disk save (WebSocket mode)")
        
        return canvas, out_path


# =====================================================================================
# USAGE EXAMPLES
# =====================================================================================
#
# Basic usage:
#   translator = Translator(
#       bundle_path="datasets/scene1_street/frame_bundle.json",
#       shapes_path="dummy_data/canonical_shapes.json", 
#       params_path="dummy_data/selection_params.json",
#       output_dir="output"
#   )
#   output_path = translator.run("navigation_output.png")
#
# Interactive GUI:
#   Run `python run_multi_gui.py` for a full interactive interface with
#   real-time threshold adjustments and multi-dataset support.
