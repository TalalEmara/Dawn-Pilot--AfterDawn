import json
import cv2
import matplotlib.pyplot as plt
import os

def plot_obstacles_from_json(data):
    # Load image
    image_path = data["file_path"]
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(f"Image not found at: {image_path}")
    
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    # Plot setup
    plt.figure(figsize=(12, 8))
    plt.imshow(image)
    ax = plt.gca()

    # Draw bounding boxes
    for obj in data.get("obstacles", []):
        x, y, w, h = obj["bbox"]
        class_name = obj["class"]
        rect = plt.Rectangle((x, y), w, h, linewidth=2, edgecolor='red', facecolor='none')
        ax.add_patch(rect)
        ax.text(x, y - 5, class_name, color='white', fontsize=10,
                bbox=dict(facecolor='red', alpha=0.5, edgecolor='none', pad=1))

    plt.axis("off")
    plt.title(f"Frame: {data['frame_id']}")
    plt.show()

# Use
with open(r"pipeline1\outputs\detections_json\frame_0013.json", "r") as f:
    data = json.load(f)

plot_obstacles_from_json(data)