import json
import numpy as np
import matplotlib.pyplot as plt
import math
import os

class OccupancyMapBuilder:
    def __init__(self, img_shape, detections, resolution=1):
        # self.map_size = map_size
        # self.resolution = resolution
        # self.map_cells = int(map_size / resolution)
        height, width = img_shape[:2]
        self.occupancy = -1 * np.ones((height, width), dtype=np.int8)
        # self.map_center = (self.map_cells // 2, self.map_cells // 2)  # camera position
        self.detections = detections
        # self.occupancy, map_img = self._build_map()

    def build_map(self, json_path=None):
        # with open(json_path, "r") as f:
        #     data = json.load(f)
        # fx = data["camera_intrinsics"]["fx"]
        # cx = data["camera_intrinsics"]["cx"]
        # fx = 1050
        # "fy": 1050.0,
        # cx = 960
        # "cy": 540.0
        # obstacles = data["obstacles"]
        # free_path = data["free_path"]

        for obj in self.detections:
            bbox = obj["bbox"]
            x_min, y_min, x_max, y_max = bbox
            self.occupancy[y_min:y_max, x_min:x_max] = 1
            # distance = obj["distance_m"]
            # x_pixel = bbox[0] + bbox[2] / 2

            # theta = math.atan((x_pixel - cx) / fx)
            # X = distance * math.sin(theta)
            # Y = distance * math.cos(theta)

            # cell_x = int(self.map_center[0] + X / self.resolution)
            # cell_y = int(self.map_center[1] + Y / self.resolution)

            # if 0 <= cell_x < self.map_cells and 0 <= cell_y < self.map_cells:
            #     self.occupancy[cell_y, cell_x] = 1  # occupied

        # free path region
        # fp_center, fp_distance = free_path["center"], free_path["distance_m"]
        # fp_theta = math.atan((fp_center[0] - cx) / fx)
        # X = fp_distance * math.sin(fp_theta)
        # Y = fp_distance * math.cos(fp_theta)
        # cell_x = int(self.map_center[0] + X / self.resolution)
        # cell_y = int(self.map_center[1] + Y / self.resolution)
        # radius_cells = int(free_path["radius"] / 100)  # dummy scaling

        # for dx in range(-radius_cells, radius_cells):
        #     for dy in range(-radius_cells, radius_cells):
        #         if dx**2 + dy**2 <= radius_cells**2:
        #             x = cell_x + dx
        #             y = cell_y + dy
        #             if 0 <= x < self.map_cells and 0 <= y < self.map_cells:
        #                 self.occupancy[y, x] = 0  # free
        # map_img = (1 - self.occupancy) * 255  # invert for visualization
        map_img = None

        # output_path = "occupancy_map.png"
        # cv2.imwrite(output_path, map_img)
        return self.occupancy, map_img

    def visualize(self):
        plt.imshow(self.occupancy, cmap="gray", origin="lower")
        plt.title("Occupancy Map")
        plt.xlabel("X")
        plt.ylabel("Y")
        plt.show()


# builder = OccupancyMapBuilder()
# builder.process_json(r"pipeline1\outputs\detections_json\frame_0000.json")
# builder.visualize()

# SEQUENCE

# builder = OccupancyMapBuilder()
# builder.process_json("output/json/frame_0001.json")
# builder.visualize()

# for json_file in sorted(os.listdir("output/json")):
#     builder.process_json(os.path.join("output/json", json_file))
# builder.visualize()
