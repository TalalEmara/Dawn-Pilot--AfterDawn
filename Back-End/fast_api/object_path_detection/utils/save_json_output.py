import os
import time
import json
def save_json_output(detections, rgb_img, frame_id, file_path, freepath_mask_path, freepath_coordinates, output_dir=r"pipeline1\outputs\detections_json", intrinsics=None):
    os.makedirs(output_dir, exist_ok=True)
    # detections = self.detect_per_frame(rgb_img, depth_img)

    freepath_coordinates = [list(map(int, tup)) for tup in freepath_coordinates]

    # Dummy free space info
    free_path = {
        "shape": None,
        "center": None,
        "radius": None,
        "mask_path": freepath_mask_path,
        "freepath_coordinates": freepath_coordinates,
        "distance_m": None
    }

    # Default intrinsics if not provided
    if intrinsics is None:
        intrinsics = {
            "fx": None,
            "fy": None,
            "cx": None,
            "cy": None
        }

    data = {
        "frame_id": f"frame_{frame_id:04d}",
        "file_path": file_path,
        "timestamp": int(time.time()),
        "camera_intrinsics": intrinsics,
        "obstacles": detections,
        "free_path_mask_path": free_path,
        # "freepath_coordinates": freepath_coordinates,
        "metadata": {
            "source_image": f"frame_{frame_id:04d}.png",
            "segmentation_combined": None,
            "generator": "detector_output_v1",
            "note": "Dummy depth estimated via bbox height heuristic",
            "image_width": rgb_img.shape[1],
            "image_height": rgb_img.shape[0]
        }
    }

    output_path = os.path.join(output_dir, f"{data['frame_id']}.json")
    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"JSON saved: {output_path}")
    return data
