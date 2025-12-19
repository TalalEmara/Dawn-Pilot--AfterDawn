"""
main.py
-------
Entry point for running the offline RGB-D navigation pipeline.
"""

from dataset.loader import DatasetLoader
from preprocessing.detector import ObjectDetector
# from preprocessing.depth_processing import DepthProcessor
from preprocessing.visualization import Visualizer
from preprocessing.freepath_detector import FreepathDetector
from path_planning.occupancy_map import OccupancyMapBuilder
from utils.save_json_output import save_json_output


def main():
    # Initialize all components
    data_loader = DatasetLoader(sequences=["11"])
def process_frame(rgb, depth, frame_id, rgb_path, object_detector, freepath_detector, visualizer=None):
    """
    Process a single frame through the navigation pipeline.
    
    Args:
        rgb: RGB image as numpy array
        depth: Depth image as numpy array
        frame_id: Frame identifier
        rgb_path: Path to the RGB image file (for freepath detection)
        object_detector: ObjectDetector instance
        freepath_detector: FreepathDetector instance
        visualizer: Optional Visualizer instance for visualization
    
    Returns:
        dict: Contains detections, freepath_mask, freepath_coordinates, and freepath_mask_path
    """
    print(f"Processing frame {frame_id}...")
    
    # Run object detection
    detections = object_detector.detect_per_frame(rgb, depth)
    print(f"Detections found: {len(detections)}")

    # Run freepath detection
    free_path, freepath_mask_path = freepath_detector.infer_per_frame(rgb_path, frame_id=frame_id)
    
    # Compute freepath centerline coordinates
    freepath_coordinates = freepath_detector.compute_centerline(freepath_mask_path)
    print(f"Freepath coordinates: {freepath_coordinates}")

    # Save JSON output
    save_json_output(
        detections, 
        rgb, 
        frame_id=frame_id, 
        file_path=rgb_path, 
        freepath_mask_path=freepath_mask_path, 
        freepath_coordinates=freepath_coordinates
    )

    # Visualize if visualizer is provided
    if visualizer is not None:
        visualizer.visualize_frame(
            rgb_image=rgb,
            depth_map=None,
            detections=detections,
            free_space_mask=free_path,
            freepath_coordinates=freepath_coordinates,
            occupancy_map=None,
            frame_id=frame_id
        )

    return {
        "frame_id": frame_id,
        "detections": detections,
        "free_path": free_path,
        "freepath_coordinates": freepath_coordinates,
        "freepath_mask_path": freepath_mask_path
    }


def main():
    """Entry point for offline processing - iterates through dataset."""
    # Initialize all components
    data_loader = DatasetLoader(sequences=["11"])
    object_detector = ObjectDetector(
        model_name="faster_rcnn", 
        model_path=r"D:\College\Year Four\GP\Technical Phase\Main Repo\Now_You_See_Me_Phosphenes\pipeline1\train\models\fasterrcnn_nav_5.pth"
    )
    freepath_detector = FreepathDetector(
        model_path=r"D:\College\Year Four\GP\Technical Phase\Main Repo\Now_You_See_Me_Phosphenes\pipeline1\train\models\final_deeplabv3_footpath.pth"
    )
    visualizer = Visualizer(show_depth=True, show_detections=True, save=False)

    # Iterate over dataset frames
    for frame_id, (rgb, depth, label_file, rgb_path) in enumerate(data_loader):
        process_frame(rgb, depth, frame_id, rgb_path, object_detector, freepath_detector, visualizer)

    visualizer.close()

if __name__ == "__main__":
    main()