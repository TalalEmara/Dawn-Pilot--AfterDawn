# FastAPI Service — Complete Technical Documentation

> **Phosphene Vision API** · Dawn Pilot Team · December 2025
>
> Full modular pipeline: _Object Detection → Freepath Detection → Translator → Phosphene Rendering_

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Directory Structure](#2-directory-structure)
3. [Startup & Initialization Process](#3-startup--initialization-process)
4. [Class Reference](#4-class-reference)
   - 4.1 [ConnectionManager](#41-connectionmanager)
   - 4.2 [NavigationDetectorService](#42-navigationdetectorservice)
   - 4.3 [TranslatorService](#43-translatorservice)
   - 4.4 [ObjectDetector](#44-objectdetector)
   - 4.5 [FreepathDetector](#45-freepathdetector)
   - 4.6 [Translator](#46-translator)
   - 4.7 [Pipeline2Integration](#47-pipeline2integration)
5. [API Endpoints Reference](#5-api-endpoints-reference)
   - 5.1 [REST Endpoints](#51-rest-endpoints)
   - 5.2 [WebSocket Endpoint](#52-websocket-endpoint)
6. [Full Pipeline Process Model](#6-full-pipeline-process-model)
   - 6.1 [Stage: passthrough](#61-stage-passthrough)
   - 6.2 [Stage: edge_mode](#62-stage-edge_mode)
   - 6.3 [Stage: detector](#63-stage-detector)
   - 6.4 [Stage: translator](#64-stage-translator)
   - 6.5 [Stage: pre_phosphene](#65-stage-pre_phosphene)
   - 6.6 [Stage: phosphene](#66-stage-phosphene)
7. [WebSocket Communication Protocol](#7-websocket-communication-protocol)
8. [Producer-Consumer Architecture](#8-producer-consumer-architecture)
9. [Data Flow Diagrams](#9-data-flow-diagrams)
10. [Configuration Reference](#10-configuration-reference)
11. [Error Handling & Decision Points](#11-error-handling--decision-points)

---

## 1. System Overview

The FastAPI service is the AI inference backend for the Dawn Pilot prosthetic vision system. It receives RGB and Depth camera frames from a frontend WebSocket client (game engine or browser), runs them through a multi-stage neural-network pipeline, and broadcasts the result as a base64-encoded phosphene image back to all connected clients.

### Core Responsibilities

| Concern                                | Component                                    |
| -------------------------------------- | -------------------------------------------- |
| HTTP server & routing                  | `main.py` + FastAPI                          |
| WebSocket connection management        | `ConnectionManager` in `nav_phosphene_ws.py` |
| Pipeline orchestration                 | `NavigationDetectorService`                  |
| Object detection (YOLO / Faster R-CNN) | `ObjectDetector`                             |
| Walkable-path detection (DeepLabV3)    | `FreepathDetector`                           |
| Canonical shape simplification         | `Translator`                                 |
| Phosphene neural-network rendering     | `Pipeline2Integration`                       |
| Image encoding / decoding utilities    | `core/image_utils.py`                        |

### Technology Stack

- **FastAPI** — async HTTP + WebSocket server
- **Uvicorn** — ASGI runner
- **PyTorch / CUDA** — GPU inference for all neural networks
- **Ultralytics YOLO** — object detection
- **Torchvision DeepLabV3** — semantic segmentation (freepath)
- **OpenCV** — image processing
- **asyncio** — concurrency (Producer-Consumer pattern)

---

## 2. Directory Structure

```
fast_api/
├── main.py                          # Application entry point
├── api/
│   ├── __init__.py                  # Exports: router, handlers
│   ├── routes.py                    # REST endpoints (root, health)
│   └── nav_phosphene_ws.py          # WebSocket handler + ConnectionManager
├── services/
│   ├── __init__.py
│   ├── navigation_detector_service.py   # Master pipeline service
│   └── translator_service.py            # Translator + Pipeline2 wrapper
├── translation/
│   ├── translator.py                    # Canonical shape renderer
│   ├── Pipeline2Integration.py          # Phosphene encoder + simulator
│   └── utils/
│       ├── utils.py                     # E2E_Simple_Encoder definition
│       ├── Differentiable_p2p.py        # P2P differentiable simulator
│       └── SavedCheckPoints/            # Pre-trained model weights
│           ├── scoreboardencoder.pth    # Phosphene encoder weights
│           ├── CNNencoder_model_nonSmart.pth  # Edge encoder weights
│           ├── BestencoderAllLosses_model.pth
│           └── ckpt_epoch_6.pth
├── object_path_detection/
│   ├── preprocessing/
│   │   ├── detector.py              # ObjectDetector class
│   │   ├── freepath_detector.py     # FreepathDetector class
│   │   └── depth_processing.py     # Depth map utilities
│   ├── path_planning/
│   │   └── occupancy_map.py        # OccupancyMapBuilder
│   └── yolo_class_mapping.json     # Class index → class name mapping
├── core/
│   ├── __init__.py
│   └── image_utils.py              # decode_base64_to_rgb, encode_ndarray_to_base64
├── config/
│   ├── navigation_config.json      # Model paths, pipeline parameters
│   └── detector_config.json        # Detector-specific settings
├── dummy_data/
│   ├── canonical_shapes.json       # Shape definitions for Translator
│   └── selection_params.json       # K_min, K_max, T_min defaults
└── static/
    └── navigation_phosphene_test.html  # WebSocket test page
```

---

## 3. Startup & Initialization Process

The server performs **eager loading** at startup — all neural network models are loaded, warmed up, and ready before the first request arrives.

### Step-by-Step Startup Sequence

```
main.py starts
    │
    ├─► [GPU Detection]
    │       Enumerate all CUDA devices
    │       Find NVIDIA GPU (GeForce/RTX/GTX)
    │       Set torch.cuda.set_device(nvidia_index)
    │       Set CUDA_VISIBLE_DEVICES environment variable
    │       ─ If no NVIDIA GPU → use first available CUDA device
    │       ─ If no CUDA at all → CPU mode
    │
    ├─► NavigationDetectorService(output_dir="api_output")
    │       ├─► _load_config("config/navigation_config.json")
    │       │       Load model paths, thresholds, cropping config
    │       │       Set defaults if config file not found
    │       │
    │       ├─► _load_models()
    │       │       ├─► Verify model files exist on disk (bail if missing)
    │       │       ├─► ObjectDetector(model_name, model_path, class_map_path)
    │       │       │       Load YOLO or Faster R-CNN model → eval mode
    │       │       └─► FreepathDetector(freepath_model_path, output_dir)
    │       │               Load DeepLabV3 model → eval mode
    │       │
    │       ├─► TranslatorService(eager_init=True)
    │       │       ├─► Pipeline2Integration()
    │       │       │       Load scoreboardencoder.pth  (phosphene encoder)
    │       │       │       Load CNNencoder_model_nonSmart.pth  (edge encoder)
    │       │       │       Load P2PDifferentiableSimulatorScoreboard (simulator)
    │       │       └─► _initialize_translator()
    │       │               Create dummy detection bundle
    │       │               Initialize Translator with dummy data
    │       │
    │       ├─► Pipeline2Integration() (second instance for full pipeline)
    │       │
    │       ├─► _warmup_models()
    │       │       Phosphene encoder: dummy 349x373 input
    │       │       Edge encoder: dummy 128x128 input
    │       │       Object detector: dummy 480x640 RGB frame
    │       │       Freepath detector: dummy 480x640 RGB frame
    │       │       torch.cuda.synchronize()
    │       │
    │       ├─► torch.cuda.empty_cache()   (if GPU memory optimization enabled)
    │       │
    │       └─► ThreadPoolExecutor(max_workers=2)   (for parallel detection)
    │
    ├─► Inject services into modules
    │       routes_module.set_navigation_service(service)
    │       nav_ws.navigation_detector_service = service
    │
    ├─► Create FastAPI app
    │       Add CORSMiddleware (allow_origins=["*"])
    │       Include REST router
    │
    └─► @app.on_event("startup") logs readiness status
```

---

## 4. Class Reference

### 4.1 `ConnectionManager`

**File:** `api/nav_phosphene_ws.py`

Manages the set of all active WebSocket connections and provides thread-safe broadcast capability. This enables the "one stream in, many streams out" pattern — a single desktop client sends frames, while both desktop and mobile clients receive the processed results.

#### Attributes

| Attribute            | Type             | Description                               |
| -------------------- | ---------------- | ----------------------------------------- |
| `active_connections` | `Set[WebSocket]` | All currently connected WebSocket clients |
| `_lock`              | `asyncio.Lock`   | Async lock protecting the connection set  |

#### Methods

| Method                 | Signature                             | Description                                                                                              |
| ---------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `connect`              | `async (websocket: WebSocket) → None` | Accepts and registers a new WebSocket connection. Logs total connection count.                           |
| `disconnect`           | `async (websocket: WebSocket) → None` | Removes a connection from the active set. Called on normal or abnormal close.                            |
| `broadcast`            | `async (message: dict) → None`        | Sends a JSON message to **every** connected client. Connections that raise on send are silently removed. |
| `get_connection_count` | `() → int`                            | Returns the current number of active connections.                                                        |

---

### 4.2 `NavigationDetectorService`

**File:** `services/navigation_detector_service.py`

The central orchestrator for the entire processing pipeline. Owns all neural network models, manages GPU resources, and exposes the `process_full_pipeline()` method used by the WebSocket handler.

#### Constructor

```python
NavigationDetectorService(output_dir: str = "api_output")
```

#### Key Attributes

| Attribute            | Type                   | Description                                                       |
| -------------------- | ---------------------- | ----------------------------------------------------------------- |
| `object_detector`    | `ObjectDetector`       | YOLO or Faster R-CNN model wrapper                                |
| `freepath_detector`  | `FreepathDetector`     | DeepLabV3 segmentation wrapper                                    |
| `translator_service` | `TranslatorService`    | Canonical shape simplification + Pipeline2                        |
| `pipeline2`          | `Pipeline2Integration` | Phosphene encoder + simulator                                     |
| `is_loaded`          | `bool`                 | True when all models loaded successfully                          |
| `executor`           | `ThreadPoolExecutor`   | Reusable thread pool (2 workers) for parallel detection           |
| `translator_lock`    | `threading.Lock`       | Prevents race conditions across parallel frames in translator     |
| `conf_threshold`     | `float`                | YOLO detection confidence threshold (default 0.5)                 |
| `t_min`              | `float`                | Translator minimum score (default 0.0)                            |
| `k_min`              | `int`                  | Minimum objects to render (default 1)                             |
| `k_max`              | `int`                  | Maximum objects to render (default 5)                             |
| `cropping_config`    | `dict`                 | FoV-based cropping parameters and camera intrinsics               |
| `_cached_image_dims` | `tuple`                | Cached (width, height) to avoid per-frame intrinsic recalculation |
| `_cached_intrinsics` | `tuple`                | Cached (fx, fy, cx, cy) scaled to image resolution                |

#### Methods

| Method                                    | Signature                                                                                                    | Description                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_load_config`                            | `(config_path: str) → None`                                                                                  | Reads `navigation_config.json` for model paths, thresholds, cropping settings. Falls back to hardcoded defaults if missing.                                                                         |
| `_load_models`                            | `() → None`                                                                                                  | Instantiates `ObjectDetector` and `FreepathDetector`. Sets `is_loaded=False` and returns early if any model file is missing.                                                                        |
| `_warmup_models`                          | `() → None`                                                                                                  | Runs one inference pass per model with dummy data to eliminate first-frame latency. Calls `torch.cuda.synchronize()` after.                                                                         |
| `is_ready`                                | `() → bool`                                                                                                  | Returns `is_loaded`. Used by health-check endpoints.                                                                                                                                                |
| `detect`                                  | `(frame, depth=None) → List[dict]`                                                                           | Convenience method: runs object detection only and returns standardized detections. Creates dummy depth if none given.                                                                              |
| `process_frame`                           | `(rgb, depth, frame_id, debug_mode=False) → dict`                                                            | Runs object detection and freepath detection **in parallel** using the thread pool. Returns combined result dict including detections, freepath coordinates, freepath circle, and timing breakdown. |
| `process_full_pipeline`                   | `(rgb, depth, frame_id, stop_at, debug_mode, cropping_config, depth_threshold, depth_threshold_mode) → dict` | Master pipeline method. Executes pipeline stages in order and returns early at `stop_at`. See [Section 6](#6-full-pipeline-process-model).                                                          |
| `_run_object_detection`                   | `(rgb, depth, frame_id) → Tuple[List, float]`                                                                | Thread-pool worker: calls `object_detector.detect_per_frame()`, returns (detections, elapsed_ms).                                                                                                   |
| `_run_freepath_detection`                 | `(rgb, frame_id, debug_mode) → Tuple[Tuple, float]`                                                          | Thread-pool worker: calls `_infer_freepath_from_array()` + `compute_centerline()` + `_calculate_freepath_circle()`. Falls back to file-based inference if array method fails.                       |
| `_infer_freepath_from_array`              | `(rgb_array, frame_id, save_debug) → Tuple[mask, path]`                                                      | Optimized freepath inference: PIL → transforms → DeepLabV3 → resize → binary mask. No file I/O by default.                                                                                          |
| `_calculate_freepath_circle`              | `(centerline, img_shape) → dict\|None`                                                                       | Computes a circle from the bottom-half centerline points. Returns `{center, radius}` or None if too few points.                                                                                     |
| `_calculate_freepath_ball_position`       | `(freepath_coords, original_size, cropping_config, frame_id, debug_mode) → Tuple\|None`                      | Runs smart selection of the best freepath point for ball placement inside the FoV crop. Prefers lowest point with margin; falls back to uppermost edge point.                                       |
| `_calculate_freepath_ball_position_smart` | `(...)`                                                                                                      | Generic smart selection variant for non-FoV crop types.                                                                                                                                             |
| `_update_cached_intrinsics`               | `(orig_w, orig_h, intrinsics) → Tuple`                                                                       | Scales reference camera intrinsics to the current image resolution. Caches result to avoid per-frame recalculation.                                                                                 |
| `_fov_based_crop`                         | `(image, cropping_config) → ndarray`                                                                         | Crops the image to the configured FoV region, accounting for camera principal point and offset_y_ratio.                                                                                             |
| `_central_crop_with_offset`               | `(image, crop_size, offset_y_ratio) → ndarray`                                                               | Simple center crop with optional vertical offset.                                                                                                                                                   |
| `draw_detections_on_rgb`                  | `(rgb, detections) → ndarray`                                                                                | Draws bounding boxes and class labels on the RGB image. Returns annotated RGB copy.                                                                                                                 |
| `draw_freepath_ball`                      | `(image, position, crop_size, radius) → ndarray`                                                             | Draws a filled white circle at `position` on the image representing walkable space.                                                                                                                 |
| `apply_edge_detection`                    | `(rgb) → ndarray`                                                                                            | Converts RGB to grayscale, applies Canny edge detection, returns single-channel edge map.                                                                                                           |
| `_visualize_freepath_points`              | `(rgb, freepath_coords, freepath_circle) → ndarray`                                                          | Debug only: draws freepath centerline and circle on the RGB image.                                                                                                                                  |

---

### 4.3 `TranslatorService`

**File:** `services/translator_service.py`

Singleton wrapper around `Translator` and `Pipeline2Integration`. Manages lazy/eager initialization and exposes the `translate()` method.

#### Constructor

```python
TranslatorService(eager_init: bool = True)
```

#### Key Attributes

| Attribute        | Type                   | Description                                                      |
| ---------------- | ---------------------- | ---------------------------------------------------------------- |
| `translator`     | `Translator\|None`     | Currently active Translator instance                             |
| `pipeline2`      | `Pipeline2Integration` | Phosphene neural network (shared with NavigationDetectorService) |
| `shapes_path`    | `str`                  | Path to `dummy_data/canonical_shapes.json`                       |
| `params_path`    | `str`                  | Path to `dummy_data/selection_params.json`                       |
| `temp_json_path` | `str`                  | Temp file path for translator initialization only                |

#### Methods

| Method                   | Signature                                                                                                                                   | Description                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `_verify_config_files`   | `() → None`                                                                                                                                 | Logs warnings if shapes or params files are missing. Does not raise.                                                         |
| `_initialize_translator` | `() → None`                                                                                                                                 | Creates a dummy detection bundle and initializes `Translator` at startup. Prevents first-request delay.                      |
| `translate`              | `(objects, image_width, image_height, t_min, k_min, k_max, depth_threshold, depth_threshold_mode, save_debug_images, return_bytes) → Tuple` | Full translation + phosphene simulation for an objects list. Returns `(phosphene_b64_or_bytes, selected_objects, metadata)`. |
| `_get_selected_objects`  | `() → List[dict]`                                                                                                                           | Reads selected objects from the current translator state after `translate()`.                                                |
| `is_ready`               | `() → bool`                                                                                                                                 | Returns True if both `shapes_path` and `params_path` files exist on disk.                                                    |
| `get_params`             | `() → dict`                                                                                                                                 | Returns current T_min, K_min, K_max, canvas_size values from translator state.                                               |

---

### 4.4 `ObjectDetector`

**File:** `object_path_detection/preprocessing/detector.py`

Wraps either a YOLO (Ultralytics) or Faster R-CNN (Torchvision) model for per-frame object detection. Returns detections in a normalized format with bounding boxes and raw depth pixel values.

#### Constructor

```python
ObjectDetector(model_name: str, model_path: str = None, class_map_path: str = "../yolo_class_mapping.json")
```

#### Key Attributes

| Attribute    | Type                | Description                            |
| ------------ | ------------------- | -------------------------------------- |
| `model_name` | `str`               | `"yolo"` or `"faster_rcnn"`            |
| `model`      | `YOLO\|nn.Module`   | Loaded model instance                  |
| `device`     | `torch.device\|str` | Active inference device                |
| `class_map`  | `dict`              | `{str(label_idx): class_name}` mapping |

#### Methods

| Method                       | Signature                                               | Description                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load_faster_rcnn_model`     | `(weights_path, num_classes, device) → (model, device)` | Loads a Faster R-CNN v2 checkpoint. Auto-detects `num_classes` from checkpoint's `cls_score.weight` shape. Returns model in eval mode.                                        |
| `load_faster_rcnn_model_old` | `(weights_path, num_classes, device) → (model, device)` | Legacy loader kept for backward compatibility (Faster R-CNN v1).                                                                                                              |
| `load_yolo_model`            | `(model_path, device) → (model, device)`                | Loads YOLO model via Ultralytics API. Returns model moved to device.                                                                                                          |
| `load_class_map`             | `() → dict`                                             | Reads `yolo_class_mapping.json`. Falls back to `{i: "class_i"}` dummy map if file missing.                                                                                    |
| `detect_per_frame`           | `(rgb_img, depth_img, conf_thresh=0.5) → List[dict]`    | Runs inference on a single RGB frame. Filters by confidence. Extracts median depth pixel value from the bounding-box ROI in the depth image. Returns list of detection dicts. |

**Detection Dict Format:**

```json
{
  "id": 1,
  "class": "person",
  "shape": null,
  "bbox": [x, y, w, h],
  "depth_pixel": 142.0,
  "mask_path": null,
  "velocity": null,
  "detection_score": 0.87,
  "hazard": null
}
```

**Depth Fallback Logic in `detect_per_frame`:**

1. Extract ROI from depth image using bounding box
2. Compute `np.median(roi[roi > 0])` (ignore zeros)
3. If ROI has no valid pixels → use image-wide median of non-zero pixels
4. If entire depth image has no valid pixels → `depth_pixel = None`

---

### 4.5 `FreepathDetector`

**File:** `object_path_detection/preprocessing/freepath_detector.py`

Semantic segmentation wrapper using a fine-tuned **DeepLabV3-ResNet50** (2-class: background vs. walkable path). Produces a binary mask and then computes a centerline of that mask.

#### Constructor

```python
FreepathDetector(model_path: str = None, output_dir: str = "api_output")
```

#### Key Attributes

| Attribute          | Type        | Description                         |
| ------------------ | ----------- | ----------------------------------- |
| `model`            | `nn.Module` | DeepLabV3-ResNet50 in eval mode     |
| `device`           | `str`       | `"cuda"` or `"cpu"`                 |
| `mask_output_dir`  | `str`       | Directory for debug mask PNGs       |
| `coord_output_dir` | `str`       | Directory for debug centerline PNGs |

#### Methods

| Method                         | Signature                                                                               | Description                                                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load_model`                   | `(model_path) → nn.Module`                                                              | Replaces the main classifier head with a 2-class Conv2d. Loads state dict (ignores aux_classifier keys). Returns model on device in eval mode.                                |
| `infer_per_frame`              | `(rgb_img_path, frame_id, save_debug=False) → (mask, path\|None)`                       | File-based inference path. Opens image from disk, resizes to 256×256 for model, resizes mask back to original size, binarizes. Falls back used when array-based method fails. |
| `compute_centerline`           | `(mask_array, half_image=True, save_debug=False, frame_id=None) → List[Tuple[int,int]]` | Scans each row of the binary mask; for each row with walkable pixels, appends `(x_mean, y)` to centerline. Calls `_center_freepath()` for final smoothing.                    |
| `compute_freepath_coordinates` | `(freepath_mask_path) → List[Tuple]`                                                    | File-based variant: skeletonizes mask via distance transform, DFS-orders skeleton points, returns ordered path.                                                               |
| `_skeletonize_cv`              | `(mask) → ndarray`                                                                      | Distance transform + threshold + iterative thinning to extract single-pixel skeleton.                                                                                         |
| `_center_freepath`             | `(path) → List`                                                                         | Smooths/centers the path coordinates (final refinement step).                                                                                                                 |
| `_get_neighbors`               | `(p, point_set) → List`                                                                 | Returns 8-connected neighbors of point `p` within a set. Used by DFS skeleton traversal.                                                                                      |

---

### 4.6 `Translator`

**File:** `translation/translator.py`

Converts a detection bundle (list of detected objects with classes, bboxes, depth) into a simplified **visual canvas** by rendering canonical geometric shapes. Implements retinotopic coordinate mapping so shapes are always correctly positioned on the target canvas regardless of input resolution.

#### Constructor

```python
Translator(bundle_path, shapes_path, params_path, calib_path=None,
           output_dir="output", depth_threshold=0.0, depth_threshold_mode="fallback")
```

#### Key Attributes

| Attribute              | Type    | Description                                                    |
| ---------------------- | ------- | -------------------------------------------------------------- |
| `bundle`               | `dict`  | Detection data (can be updated in-memory between frames)       |
| `shapes`               | `dict`  | Canonical shape definitions keyed by class name                |
| `params`               | `dict`  | Selection parameters: `K_min`, `K_max`, `T_min`, `canvas_size` |
| `input_width`          | `int`   | Auto-detected or provided input image width                    |
| `input_height`         | `int`   | Auto-detected or provided input image height                   |
| `canvas_size`          | `tuple` | `(W, H)` of the canvas to render onto                          |
| `depth_threshold`      | `float` | Filter objects nearer than this normalized depth (0.0–1.0)     |
| `depth_threshold_mode` | `str`   | `"fallback"` (keep K_min) or `"strict"` (allow empty scene)    |
| `obstacles_key`        | `str`   | `"obstacles"` or `"obstacle_list"` — auto-detected from bundle |

#### Methods

| Method                     | Signature                                                                                                        | Description                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_detect_input_image_size` | `() → (width, height)`                                                                                           | Probes bundle metadata, then bundle root, then bounding-box extents, then defaults 1280×720.                                                                                                                            |
| `score_object`             | `(obj) → float`                                                                                                  | Returns `depth_pixel / 255.0`. High pixel value (bright = near) yields high score.                                                                                                                                      |
| `select_objects`           | `() → List[dict]`                                                                                                | Scores all obstacles, applies depth threshold filter, applies T_min / K_min / K_max constraints, returns sorted selected list.                                                                                          |
| `project_size`             | `(shape_def, depth) → (wpx, hpx)`                                                                                | Estimates object pixel size using perspective projection with estimated focal length (assumes 60° FOV). Clamps to `[min_px, max_px]`.                                                                                   |
| `draw_shape`               | `(canvas, obj, target_canvas_size, original_image_size) → None`                                                  | Applies retinotopic mapping: normalizes centroid from original resolution to 0–1, then scales to target canvas. Draws canonical shape (circle, box, triangle, arch). Falls back to green rectangle for unknown classes. |
| `run`                      | `(output_filename, save_to_disk=True, target_canvas_size=(128,128), draw_freepath=False) → (canvas_array, path)` | Main execution method: creates blank canvas, selects objects, calls `draw_shape()` for each, optionally saves to disk. Returns numpy canvas array.                                                                      |

**Object Selection Decision Tree in `select_objects()`:**

```
All obstacles
    │
    ├─► depth_threshold > 0.0?
    │       YES → filter: keep only if depth_pixel/255 >= depth_threshold
    │       │       └─► filtered count < K_min AND mode=="fallback"?
    │       │               YES → use top-K_min objects regardless of depth
    │       │               NO  → use filtered list (may be empty in strict mode)
    │       NO  → use all objects
    │
    ├─► Score all objects (depth_pixel / 255)
    ├─► Sort descending by score
    ├─► Remove objects with score <= T_min
    ├─► Truncate to K_max
    └─► If result < K_min → pad with highest-scored objects
```

---

### 4.7 `Pipeline2Integration`

**File:** `translation/Pipeline2Integration.py`

Neural-network phosphene simulator. Loads two encoders (phosphene and edge) and one shared differentiable simulator. Converts a normalized grayscale image to a phosphene output image.

#### Constructor

```python
Pipeline2Integration()
```

#### Key Attributes

| Attribute             | Type                                   | Description                                            |
| --------------------- | -------------------------------------- | ------------------------------------------------------ |
| `device`              | `torch.device`                         | CUDA if available, else CPU                            |
| `encoder_phosphene`   | `E2E_Simple_Encoder`                   | Full prosthetic vision encoder; expects 349×373 input  |
| `encoder_edge`        | `E2E_Simple_Encoder`                   | Low-resolution edge encoder; expects 128×128 input     |
| `simulator`           | `P2PDifferentiableSimulatorScoreboard` | Shared differentiable phosphene point-spread simulator |
| `edge_transform`      | `T.Compose`                            | Resize to 128×128, ToTensor                            |
| `phosphene_transform` | `T.Compose`                            | Resize to 349×373, ToTensor                            |

#### Methods

| Method             | Signature                                                          | Description                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input2phosphenes` | `(input_image: ndarray, use_edge_encoder: bool = False) → ndarray` | End-to-end inference: ndarray → PIL → transform → encoder → simulator → squeeze → numpy. Returns `(H, W)` float array in approximately 0–1 range. |

**Inference Path Inside `input2phosphenes()`:**

```
input_image (np.ndarray, float32 0-1)
    │
    ├─► use_edge_encoder=True  → encoder_edge  + edge_transform  (128×128)
    └─► use_edge_encoder=False → encoder_phosphene + phosphene_transform (349×373)

    → img_pil = Image.fromarray(input_image)
    → img_t = transform(img_pil).unsqueeze(0).to(device)   # (1, 1, H, W)
    → amplitudes = encoder(img_t)                           # (B, n_electrodes)
    → phosphene = simulator(amplitudes)                     # (1, 1, H, W)
    → output = phosphene.cpu().numpy().squeeze()            # (H, W)
```

---

## 5. API Endpoints Reference

### 5.1 REST Endpoints

#### `GET /`

**File:** `api/routes.py`

Returns service identification string.

**Response:**

```json
{
  "service": "Phosphene Vision API",
  "version": "1.0.0",
  "status": "running",
  "docs": "/docs"
}
```

---

#### `GET /api/health`

**File:** `api/routes.py`

Checks whether `NavigationDetectorService.is_ready()` is True.

**Response:**

```json
{
  "status": "healthy",
  "navigation_detector_loaded": true,
  "timestamp": "2026-03-12T10:00:00.000000"
}
```

---

#### `GET /health`

**File:** `main.py`

Duplicate health check at root level.

**Response:**

```json
{
  "status": "healthy",
  "navigation_detector": true,
  "timestamp": "2026-03-12T10:00:00.000000"
}
```

---

#### `POST /api/configure_new`

**File:** `main.py`

Dynamically reconfigures pipeline parameters at runtime without restarting the server.

**Request Body:**

```json
{
  "conf_threshold": 0.2,
  "t_min": 0.3,
  "k_min": 1,
  "k_max": 5
}
```

All fields are optional. Only provided fields are updated.

**Response (success):**

```json
{
  "status": "configured",
  "parameters": {
    "conf_threshold": 0.2,
    "t_min": 0.3,
    "k_min": 1,
    "k_max": 5
  }
}
```

**Response (service not initialized):**

```json
{
  "status": "error",
  "message": "Navigation detector service not initialized"
}
```

---

### 5.2 WebSocket Endpoint

#### `WS /ws/navigation-phosphene`

**File:** `main.py` + `api/nav_phosphene_ws.py`

**MAIN PRODUCTION ENDPOINT**

Full navigation + phosphene pipeline with broadcasting to all connected clients.

See [Section 7 — WebSocket Communication Protocol](#7-websocket-communication-protocol) and [Section 8 — Producer-Consumer Architecture](#8-producer-consumer-architecture) for full detail.

---

## 6. Full Pipeline Process Model

`process_full_pipeline()` in `NavigationDetectorService` is the master method. It runs a sequential pipeline but stops at the requested `stop_at` stage, returning the intermediate result.

### Pipeline Stage Overview

```
Input: RGB frame + optional Depth frame
         │
   ┌─────▼──────────────┐
   │   passthrough       │  FoV crop only → Cropped RGB
   └─────┬───────────────┘
         │  (if stop_at != 'passthrough')
   ┌─────▼──────────────┐
   │   edge_mode         │  FoV crop + Canny edges + Edge-encoder + Simulator → Phosphene
   └─────┬───────────────┘
         │  (depth REQUIRED from here on)
   ┌─────▼──────────────┐
   │   detector          │  Parallel: Object Detection (YOLO) + Freepath (DeepLabV3) → Annotated RGB
   └─────┬───────────────┘
   ┌─────▼──────────────┐
   │   translator        │  Canonical shape rendering → Simplified binary canvas (full size)
   └─────┬───────────────┘
   ┌─────▼──────────────┐
   │   pre_phosphene     │  FoV crop + freepath ball overlay → 128×128 binary image
   └─────┬───────────────┘
   ┌─────▼──────────────┐
   │   phosphene         │  Phosphene encoder (scoreboardencoder) + Simulator → Final phosphene
   └─────────────────────┘
Output: base64-encoded image + detections JSON + freepath JSON
```

---

### 6.1 Stage: `passthrough`

**Purpose:** Provide a normal cropped view without any AI processing. Used for reference / debugging.

**Steps:**

1. Merge provided `cropping_config` with service defaults (preserving `freepath_ball` and `camera_intrinsics`).
2. Call `_fov_based_crop(rgb, effective_cropping_config)`:
   - Calculate square bounding box centered on image
   - Apply FoV angle to compute pixel extents using `fx, fy` from camera intrinsics
   - Apply `offset_y_ratio` vertical shift
   - Crop the square subregion
3. Optionally save debug JPEG.
4. Encode result as JPEG base64 via `encode_ndarray_to_base64(cropped, color_space='RGB')`.
5. Return result dict with `output_image`.

**Requirements:** RGB only. Depth not needed.

---

### 6.2 Stage: `edge_mode`

**Purpose:** Lightweight phosphene using Canny edge detection + edge encoder instead of the full object-detection pipeline. ~3× faster than full phosphene mode.

**Steps:**

1. `_fov_based_crop(rgb, config)` → `cropped`
2. `apply_edge_detection(cropped)`:
   - Convert RGB → grayscale
   - Apply `cv2.Canny()` → single-channel edge map
3. Ensure edge map is grayscale → `edges_gray`
4. `pipeline2.input2phosphenes(edges_gray, use_edge_encoder=True)`:
   - Resize to 128×128
   - Pass through `encoder_edge` → stimulation amplitudes
   - Pass through `simulator` → phosphene image
5. Scale output to 0–255 uint8.
6. Optionally save debug images.
7. Encode as JPEG base64.
8. Return result dict.

**Requirements:** RGB only. Depth not needed.

---

### 6.3 Stage: `detector`

**Purpose:** Visualize the raw detection results: bounding boxes on the original RGB frame plus the freepath centerline.

**Steps:**

1. Verify depth image is present (else return error).
2. Optionally save input RGB and depth to debug directory.
3. Call `process_frame(rgb, depth, frame_id, debug_mode)`:

   **`process_frame()` internal steps:**

   ```
   ┌──────────────────────────────────────────────────────────────┐
   │  PARALLEL (via ThreadPoolExecutor, 2 workers)                │
   │                                                              │
   │  Worker A: _run_object_detection(rgb, depth, frame_id)       │
   │      └─► object_detector.detect_per_frame(rgb, depth, conf)  │
   │          Returns: (List[detection_dict], elapsed_ms)         │
   │                                                              │
   │  Worker B: _run_freepath_detection(rgb, frame_id, debug)     │
   │      └─► _infer_freepath_from_array(rgb, frame_id)           │
   │              PIL RGB → resize 256×256 → DeepLabV3            │
   │              → argmax mask → resize back to original         │
   │              → binary mask (0/255)                           │
   │      └─► freepath_detector.compute_centerline(mask)          │
   │              Row-scan → (x_mean, y) per row                  │
   │              → _center_freepath() smoothing                  │
   │      └─► _calculate_freepath_circle(centerline, img_shape)   │
   │              Filter bottom-half points                       │
   │              center = mean(xs, ys), radius = mean(distances) │
   │          Returns: ((mask, coords, circle), elapsed_ms)       │
   └──────────────────────────────────────────────────────────────┘
   both results awaited → combined into result dict
   ```

4. Standardize detection dicts (int bbox, float confidence, float depth_pixel).
5. `draw_detections_on_rgb(rgb, detections)` → annotated RGB image.
6. Optionally save detector output and freepath visualization JPEGs.
7. Encode annotated RGB as JPEG base64.
8. Return result with `detections`, `freepath_coordinates`, `freepath_circle`.

**Requirements:** RGB + Depth.

---

### 6.4 Stage: `translator`

**Purpose:** Render the scene as a simplified symbolic canvas — objects become white canonical shapes (circles, rectangles, arcs) on a black background.

**Continues from detector stage, then:**

1. Acquire `translator_lock` (prevents race conditions for parallel frames).
2. Convert detections to `translator_objects` list (class, confidence, bbox, centroid_px, depth_pixel).
3. Build `detection_data` bundle (in-memory, no file I/O).
4. Update `translator.bundle` with new detection data.
5. Set canvas to full image size `[h, w]`.
6. Update `translator.params`: T_min, K_min, K_max, depth_threshold, depth_threshold_mode.
7. `translator.run(filename, save_to_disk=False, target_canvas_size=(w, h), draw_freepath=True)`:

   **`run()` internal steps:**

   ```
   Create black canvas (H, W, 3)
       │
   select_objects()
       Score all objects (depth_pixel / 255)
       Apply depth_threshold filter
       Apply T_min filter
       Apply K_min/K_max limits
       Return sorted list
       │
   For each selected object:
       draw_shape(canvas, obj, target_canvas_size=(w,h), original_image_size=(w,h))
           Look up class in canonical_shapes.json
           Fallback → green rectangle if class unknown
           Retinotopic mapping:
               cx = (centroid_x / orig_w) * target_w
               cy = (centroid_y / orig_h) * target_h
               scale bbox proportionally
           Project size via perspective math
           Draw shape (circle / box / triangle / arch)
               Minimum 3×3 px enforced
   ```

8. Convert canvas BGR → grayscale → binary threshold at 127.
9. Optionally save debug JPEG.
10. Encode full-sized simplified binary image as JPEG base64.
11. Return result with `detections`, `freepath_coordinates`, `freepath_circle`.

**Requirements:** RGB + Depth.

---

### 6.5 Stage: `pre_phosphene`

**Purpose:** Apply FoV crop to the translated canvas and overlay the freepath navigation ball. This is the direct input to the phosphene encoder.

**Continues from translator stage, then:**

1. Apply cropping based on `crop_type`:
   - `fov_based` → `_fov_based_crop(simplified_binary, config)` → variable-size crop
   - `central_crop` → `_central_crop_with_offset(simplified_binary, size, offset_y_ratio)` → fixed-size crop
   - Other → `cv2.resize(simplified_binary, crop_size)` → resampled

2. Validate crop result is not empty.

3. Calculate freepath ball position via `_calculate_freepath_ball_position()`:

   **Smart Ball Selection Logic:**

   ```
   All freepath centerline coordinates
       │
   Convert to square-crop coordinates
   Filter to FoV region (using camera intrinsics + FoV angle)
       │
   Filter to bottom half only (Y >= crop_height * BOTTOM_HALF_THRESHOLD)
       │
   No points in bottom half → return None (no ball drawn)
       │
   Separate points:
       WITH margin:     MIN_MARGIN ≤ x ≤ crop_w-MIN_MARGIN
                        MIN_MARGIN ≤ y ≤ crop_h-MIN_MARGIN
       WITHOUT margin:  edge/boundary points
       │
   Decision:
       points_with_margin exist?
           YES → Select LOWEST point (highest Y = nearest to user)
           NO  → Select UPPERMOST edge point (lowest Y = avoids bottom clipping)
       │
   Multiple points at same Y → prefer center-most (closest to horizontal midpoint)
       │
   Return (x, y) in crop coordinates
   ```

4. If ball position found → `draw_freepath_ball(cropped_image, position, crop_size, radius)`:
   - Draw filled white circle at `(x, y)` with configured radius

5. Optionally save debug JPEG.
6. Encode cropped image with ball as JPEG base64.
7. Return result with `detections`, `freepath_coordinates`, `freepath_circle`.

**Requirements:** RGB + Depth.

---

### 6.6 Stage: `phosphene`

**Purpose:** Final phosphene rendering — the full output designed for visual prosthesis simulation.

**Continues from pre_phosphene stage, then:**

1. Convert cropped image to grayscale if 3-channel.
2. Normalize to `[0, 1]` float32: `image / 255.0`.
3. `pipeline2.input2phosphenes(pre_phosphene_normalized, use_edge_encoder=False)`:
   - Resize to 349×373 (phosphene encoder input size)
   - Pass through `encoder_phosphene` → stimulation amplitudes
   - Pass through `simulator` → phosphene image (1, 1, H, W)
   - Squeeze → `(H, W)` float numpy array
4. Scale output: `np.clip(output * 255, 0, 255).astype(uint8)`
5. Optionally save PNG debug output.
6. Encode as JPEG base64.
7. Return final result dict.

**Requirements:** RGB + Depth.

---

## 7. WebSocket Communication Protocol

### Connection Handshake

```
Client connects to ws://host:8000/ws/navigation-phosphene
    │
Server:
    websocket.accept()
    connection_manager.connect(websocket)   ← adds to broadcast set
    │
    service available?
        NO  → send error message, disconnect, close
        YES → send welcome message:
              {
                "type": "connected",
                "message": "Navigation-Phosphene WebSocket ready",
                "service_ready": true,
                "total_connections": N
              }
```

### Frame Message (Client → Server)

```json
{
  "type": "frame",
  "frame_id": "42",
  "rgb": "<base64-encoded PNG/JPEG>",
  "depth": "<base64-encoded grayscale PNG>",
  "stage": "phosphene",
  "debug": false,
  "cropping_config": { "type": "fov_based", "fov_degrees": 30 },
  "depth_threshold": 0.0,
  "depth_threshold_mode": "fallback"
}
```

| Field                  | Required    | Description                                                                                |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `type`                 | Yes         | Must be `"frame"` (or `"ping"` for heartbeat)                                              |
| `frame_id`             | Yes         | String identifier for this frame                                                           |
| `rgb`                  | Yes         | Base64-encoded RGB image (data-URL prefix optional)                                        |
| `depth`                | Conditional | Required for stages: `detector`, `translator`, `pre_phosphene`, `phosphene`                |
| `stage`                | Yes         | One of: `passthrough`, `edge_mode`, `detector`, `translator`, `pre_phosphene`, `phosphene` |
| `debug`                | No          | Save intermediate images to disk (default: `false`)                                        |
| `cropping_config`      | No          | Override default FoV cropping config                                                       |
| `depth_threshold`      | No          | Normalized depth filter 0.0–1.0 (default: `0.0`)                                           |
| `depth_threshold_mode` | No          | `"fallback"` or `"strict"` (default: `"fallback"`)                                         |

### Result Message (Server → All Clients)

```json
{
  "type": "result",
  "data": {
    "frame_id": "42",
    "stage": "phosphene",
    "success": true,
    "output_image": "<base64-encoded output image>",
    "detections": [
      {
        "class": "car",
        "confidence": 0.87,
        "bbox": [100, 150, 80, 60],
        "centroid_px": [140, 180],
        "depth_pixel": 200.0
      }
    ],
    "freepath_coordinates": [[320, 480], [322, 460], ...],
    "freepath_circle": {
      "center": [320, 500],
      "radius": 45
    },
    "stats": {
      "detection_ms": 120.5,
      "translator_ms": 45.2,
      "phosphene_ms": 380.0
    },
    "error": null
  }
}
```

### Error Message

```json
{
  "type": "error",
  "frame_id": "42",
  "error": "Depth image is required for stage 'detector'."
}
```

### Heartbeat (Client → Server)

```json
{ "type": "ping" }
```

Server ignores ping messages (no pong sent).

---

## 8. Producer-Consumer Architecture

The WebSocket handler uses an **asyncio Producer-Consumer** pattern to avoid blocking the event loop during GPU inference (which typically takes 300–700 ms).

```
┌────────────────────────────────────────────────────────────────────┐
│  WebSocket Handler (handle_navigation_phosphene_websocket)         │
│                                                                    │
│   shared_state = {                                                 │
│       "latest_payload": None,      ← overwritten on new frame      │
│       "new_data_event": Event(),   ← signaled when new frame ready │
│       "is_running": True                                           │
│   }                                                                │
│                                                                    │
│  ┌─────────────────────┐    ┌──────────────────────────────────┐  │
│  │   PRODUCER           │    │   CONSUMER                       │  │
│  │   asyncio.Task       │    │   asyncio.Task                   │  │
│  │                      │    │                                  │  │
│  │  websocket.receive_json()│  │  await new_data_event.wait()    │  │
│  │  ↓                   │    │  ↓                               │  │
│  │  validate message    │    │  grab payload (latest frame)     │  │
│  │  ↓                   │    │  clear event                     │  │
│  │  update shared_state │───►│  ↓                               │  │
│  │  set new_data_event  │    │  asyncio.to_thread(              │  │
│  │                      │    │    run_heavy_inference, payload)  │  │
│  │  ← non-blocking      │    │    ↑ GPU inference in thread pool│  │
│  │  ← automatic frame   │    │    ↑ does NOT block event loop   │  │
│  │    dropping when     │    │  ↓                               │  │
│  │    GPU is busy       │    │  connection_manager.broadcast()  │  │
│  └─────────────────────┘    └──────────────────────────────────┘  │
│                                                                    │
│  asyncio.wait([producer, consumer], return_when=FIRST_COMPLETED)  │
│  Cancel remaining tasks on exit                                    │
│  connection_manager.disconnect(websocket)                          │
└────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision                            | Rationale                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `asyncio.to_thread()` for inference | GPU inference blocks for 300–700 ms. Running it in a thread pool keeps the event loop free to accept new frames.                          |
| `latest_payload` overwrites         | Latest frame wins. When GPU is slower than the incoming frame rate, older frames are silently dropped.                                    |
| `asyncio.Event` (not Queue)         | Simple flag: producer signals, consumer wakes and takes whatever is current. No backlog builds up.                                        |
| `asyncio.wait(FIRST_COMPLETED)`     | If either producer or consumer crashes, the other is cancelled and the connection is cleaned up.                                          |
| Reusable `ThreadPoolExecutor`       | Avoids per-frame thread creation overhead at 30 FPS. Fixed 2 workers matches parallel object+freepath detection inside `process_frame()`. |

### Frame Lifecycle

```
Client sends frame N
    Producer receives it
    shared_state["latest_payload"] = frame_N  (overwrites any pending frame)
    new_data_event.set()

Consumer wakes
    payload = frame_N
    new_data_event.clear()
    run_heavy_inference(payload)            ← blocks thread (not event loop)
        decode_base64_to_rgb(rgb_b64)       ← base64 decode + Y-flip
        decode depth if present
        navigation_detector_service.process_full_pipeline(...)
    connection_manager.broadcast(result)    ← sends to Desktop + Mobile
```

---

## 9. Data Flow Diagrams

### Full Phosphene Pipeline Data Flow

```
[Client]
  RGB (base64 PNG)  ──────────────────────────────────────────┐
  Depth (base64 PNG)  ────────────────────────────────────┐   │
                                                           │   │
[WebSocket Handler]                                        │   │
  base64 → np array (uint8, RGB, Y-flipped)  ◄────────────┘   │
  base64 → np array (uint8, grayscale)  ◄────────────────────┘
                           │
[NavigationDetectorService.process_full_pipeline()]
                           │
          ┌────────────────┴──────────────────┐
          │ PARALLEL (ThreadPoolExecutor)      │
          │                                   │
  [ObjectDetector]               [FreepathDetector]
  RGB → YOLO/FRCNN model         RGB → resize 256×256
  filter by conf_threshold       → DeepLabV3
  extract depth_pixel per bbox   → binary mask
  return List[detection]         → compute_centerline
                          │      → circle
          └────────────────┴──────────────────┘
                           │
                 [Translator.run()]
                 create black canvas (H × W)
                 score objects (depth_pixel/255)
                 filter (T_min, K_min, K_max, depth_threshold)
                 draw canonical shapes with retinotopic mapping
                 → simplified_canvas (H × W, grayscale binary)
                           │
               [_fov_based_crop()]
               apply camera intrinsics + FoV angle
               → cropped_canvas (variable size)
                           │
        [_calculate_freepath_ball_position()]
        filter centerline to FoV + bottom-half
        smart selection (lowest with margin / uppermost edge)
        → ball_position (x, y)
                           │
        [draw_freepath_ball()]
        draw white circle at ball_position
        → pre_phosphene_image (128×128 binary)
                           │
          [Pipeline2Integration.input2phosphenes()]
          normalize 0→1
          resize 349×373 (phosphene encoder)
          → E2E_Simple_Encoder(img_t) → stimulation_amplitudes
          → P2PDifferentiableSimulator(amplitudes) → phosphene_img
          scale 0→255 uint8
          → phosphene_output (H × W)
                           │
          [encode_ndarray_to_base64()]
          → output_image (JPEG base64 string)
                           │
          [ConnectionManager.broadcast()]
          → send to ALL connected WebSocket clients
```

---

## 10. Configuration Reference

### `config/navigation_config.json`

```json
{
  "navigation_detector": {
    "model_type": "yolo",
    "model_path": "object_path_detection/models/yolo_our_data_50.pt",
    "class_map_path": "object_path_detection/yolo_class_mapping.json",
    "freepath_model_path": "object_path_detection/models/final_deeplabv3_footpath.pth",
    "debug_mode": false,
    "parallel_processing": true,
    "gpu_memory_optimization": true
  },
  "cropping": {
    "type": "fov_based",
    "fov_degrees": 30,
    "offset_y_ratio": 0.5,
    "size": [128, 128],
    "camera_intrinsics": {
      "fx": 696.0,
      "fy": 649.5,
      "cx": 640.0,
      "cy": 360.0,
      "width": 1280,
      "height": 720,
      "horizontal_fov": 85.2,
      "vertical_fov": 58.0
    },
    "freepath_fallback": "clamp_with_warning",
    "freepath_ball": {
      "radius": 50,
      "margin_buffer": 10,
      "bottom_half_threshold": 0.5
    }
  }
}
```

### Runtime-Configurable Parameters (`POST /api/configure_new`)

| Parameter        | Default | Description                       |
| ---------------- | ------- | --------------------------------- |
| `conf_threshold` | `0.5`   | YOLO detection confidence filter  |
| `t_min`          | `0.0`   | Translator minimum object score   |
| `k_min`          | `1`     | Minimum shapes rendered per frame |
| `k_max`          | `5`     | Maximum shapes rendered per frame |

### `depth_threshold` (per-frame in WebSocket message)

| Value | Effect                                                         |
| ----- | -------------------------------------------------------------- |
| `0.0` | All objects included regardless of depth                       |
| `0.5` | Only objects with depth_pixel ≥ 0.5 × 255 = 127 (medium-close) |
| `1.0` | Only the very nearest objects (depth_pixel near 255)           |

### `depth_threshold_mode` (per-frame)

| Mode         | Behavior when filtered count < K_min                 |
| ------------ | ---------------------------------------------------- |
| `"fallback"` | Keep top K_min objects regardless of depth (default) |
| `"strict"`   | Allow empty scene (no shapes rendered)               |

---

## 11. Error Handling & Decision Points

### Startup Failures

| Condition                    | Behavior                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Model file not found on disk | `is_loaded = False`, service starts but all pipeline calls raise `RuntimeError` |
| Config JSON missing          | Default values used, warning logged                                             |
| GPU not available            | Automatic CPU fallback, all models on CPU                                       |
| Translator pre-init fails    | Warning logged, translator lazy-initialized on first request                    |

### Per-Frame Decision Points

```
Incoming WebSocket message
    │
    type == "ping" ?
        YES → discard silently
        NO  → continue
    │
    type == "frame" ?
        NO  → ignored
        YES → validate
    │
    stage in valid_stages ?
        NO  → broadcast error {"type": "error", "error": "Invalid stage ..."}
        YES → continue
    │
    rgb present ?
        NO  → broadcast error "Missing rgb image"
        YES → continue
    │
    stage requires depth AND depth missing ?
        YES → broadcast error "Depth image required for stage X"
        NO  → continue
    │
    Store in shared_state (overwrites any queued frame)
    Signal consumer
```

```
Consumer wakes, calls run_heavy_inference()
    │
    decode_base64_to_rgb() fails ?
        YES → broadcast error "Invalid image data"
        NO  → continue
    │
    decode depth fails ?
        YES → broadcast error "Failed to decode depth image"
        NO  → continue
    │
    process_full_pipeline() raises exception ?
        YES → broadcast error with exception message
        NO  → continue
    │
    broadcast result to all clients
```

### GPU Memory Management

| Trigger                                              | Action                                                    |
| ---------------------------------------------------- | --------------------------------------------------------- |
| Every 50 frames                                      | `torch.cuda.synchronize()` (prevents Windows TDR timeout) |
| Every 100 frames (if `gpu_memory_optimization=True`) | `torch.cuda.empty_cache()`                                |
| Startup (if `gpu_memory_optimization=True`)          | `torch.cuda.empty_cache()` after model loading            |

### FreepathDetector Fallback Mode

```
_run_freepath_detection()
    │
    _infer_freepath_from_array() fails (exception) ?
        YES → fallback to file-based method:
                Convert RGB → BGR
                Write temp .png to disk
                freepath_detector.infer_per_frame(temp_path)
                Delete temp file when done
        NO  → continue with in-memory result
```

---

_Documentation generated: March 2026 · Dawn Pilot Team_
