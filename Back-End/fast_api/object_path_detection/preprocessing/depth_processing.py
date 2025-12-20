"""
depth_processing.py
-------------------
Handles depth map processing
"""


import cv2
import numpy as np
import open3d as o3d
import matplotlib.pyplot as plt

class DepthProcessor:
    def __init__(self):
        pass

    def read_depth(path):
        """Read ushort depth PNG (cm) -> return float32 meters depth, zeros = invalid."""
        d = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        if d is None:
            raise FileNotFoundError(path)
        if d.ndim == 3:
            d = d[:,:,0]
        print(d)
        depth_m = (d.astype(np.float32) / 1000.0)  # mm -> m
        return depth_m
    
    def depth_sobel_clean(depth, ksize=5, factor=2.0):
        """Sobel gradient on depth, remove pixels with gradient > factor * median(g)."""
        # Prepare depth for gradient: convert to mm float for sensitivity
        d = depth.copy()
        scaled = (d * 1000.0).astype(np.float32)
        # median blur to reduce spike noise
        scaled = cv2.medianBlur(scaled, 5)
        gx = cv2.Sobel(scaled, cv2.CV_64F, 1, 0, ksize=ksize)
        gy = cv2.Sobel(scaled, cv2.CV_64F, 0, 1, ksize=ksize)
        g = np.sqrt(gx*gx + gy*gy)
        med = np.median(g[g>0]) if np.any(g>0) else 0.0
        thr = med * factor if med>0 else np.inf
        bad = (g > thr) #remove pixels where depth changes too abruptly compared to the rest of the scene
        cleaned = depth.copy()
        cleaned[bad] = 0.0
        return cleaned, bad
    
    def visualize_depth(self, cleaned_depth, original_depth):
        fig, axes = plt.subplots(1, 2, figsize=(10, 10))

        im1 = axes[0].imshow(cleaned_depth, cmap="plasma")
        axes[0].set_title("cleaned_depth")
        axes[0].axis("off")
        fig.colorbar(im1, ax=axes[0], fraction=0.046, pad=0.04)

        im1 = axes[1].imshow(original_depth, cmap="plasma")
        axes[1].set_title("Original Depth (meters)")
        axes[1].axis("off")
        fig.colorbar(im1, ax=axes[1], fraction=0.046, pad=0.04)

        plt.tight_layout()
        plt.show()

    def backproject_depth_to_pointcloud(depth, camera_intrinsics=(615.0,615.0,320.0,240.0)):
        """
        Backproject an HxW depth image (meters) to Nx3 points and return u,v indices.
            fx, fy: focal lengths in x and y (pixels)
            cx, cy: principal point (optical center in pixel coords)
        Returns:
            pts = Nx3 array of 3D point coordinates.
            u_valid, v_valid = original pixel coordinates in the depth map that correspond to each 3D point.
        """
        fx, fy, cx, cy = camera_intrinsics
        H, W = depth.shape
        u, v = np.meshgrid(np.arange(W), np.arange(H))
        Z = depth.flatten()
        valid = (Z > 0) & np.isfinite(Z)
        if not np.any(valid):
            return np.zeros((0,3)), np.array([],int), np.array([],int)
        u_valid = u.flatten()[valid].astype(np.float32)
        v_valid = v.flatten()[valid].astype(np.float32)
        Zv = Z[valid].astype(np.float32)
        # This transforms pixel coordinates (u,v) back into 3D coordinates (X,Y,Z) in camera space
        X = (u_valid - cx) * Zv / fx
        Y = (v_valid - cy) * Zv / fy
        pts = np.vstack((X,Y,Zv)).T
        return pts, u_valid.astype(int), v_valid.astype(int)


   

    def visualize_pointcloud(points, rgb, valid_mask=None, voxel_size=0.02):
        """
        Visualize 3D points with color using Open3D.
        
        Args:
            points (np.ndarray): Nx3 array of 3D points in meters.
            rgb (np.ndarray): HxWx3 RGB image (uint8) aligned with depth.
            valid_mask (np.ndarray): HxW boolean mask of valid depth pixels. 
                                    If None, assumes all are valid.
            voxel_size (float): optional downsampling for faster rendering.
        """
        # --- handle colors ---
        H, W, _ = rgb.shape
        rgb_flat = rgb.reshape(-1, 3)

        if valid_mask is not None:
            colors = rgb_flat[valid_mask.flatten()]
        else:
            colors = rgb_flat[:len(points)]

        # --- create Open3D point cloud ---
        pc = o3d.geometry.PointCloud()
        pc.points = o3d.utility.Vector3dVector(points)
        pc.colors = o3d.utility.Vector3dVector(colors.astype(np.float32) / 255.0)

        # --- optional downsampling ---
        if voxel_size:
            pc = pc.voxel_down_sample(voxel_size)

        # --- estimate normals (optional but improves lighting) ---
        pc.estimate_normals(search_param=o3d.geometry.KDTreeSearchParamKNN(knn=30))

        # --- visualize ---
        o3d.visualization.draw_geometries([pc],
                                        window_name="3D Point Cloud",
                                        width=1280, height=720,
                                        point_show_normal=False)
# ------- PLACEHOLDER FUNCTIONS FOR TESTING (DO NOT REMOVE PLS) ------- #
    def compute_free_space_placeholder(self, depth_map):
        """
        Estimate walkable free space from the given depth map.

        Args:
            depth_map (np.ndarray): depth image (H, W) with depth values.

        Returns:
            np.ndarray: binary mask (H, W), where 1 = free space, 0 = obstacle.
        """
        self.depth_threshold=2000
        self.smoothing=True
        if depth_map is None:
            print("Warning: Empty depth map provided.")
            return None
        depth_clean = self._preprocess_depth(depth_map)

        free_space_mask = self._threshold_depth(depth_clean)

        if self.smoothing:
            free_space_mask = self._refine_mask(free_space_mask)

        return free_space_mask
    
    def _preprocess_depth(self, depth_map):
        """
        Preprocess the depth map:
        - Handle invalid values (0 or NaN)
        - Normalize if necessary
        """
        depth = depth_map.copy().astype(np.float32)

        # Replace invalid or missing values
        depth[depth == 0] = np.nanmedian(depth)

        # Optionally normalize to [0, 255] if your data is 16-bit
        if depth.max() > 255:
            depth = cv2.normalize(depth, None, 0, 255, cv2.NORM_MINMAX)

        return depth.astype(np.uint8)

    def _threshold_depth(self, depth):
        """
        Generate a binary mask of free space based on depth.
        Pixels closer than a threshold = obstacles,
        farther pixels = potentially walkable.
        """
        # Assume lower depth values = closer objects (obstacles)
        _, mask = cv2.threshold(depth, self.depth_threshold, 255, cv2.THRESH_BINARY_INV)
        return mask

    def _refine_mask(self, mask):
        """
        Apply morphological filtering to smooth and fill gaps in the free-space mask.
        """
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        return mask

