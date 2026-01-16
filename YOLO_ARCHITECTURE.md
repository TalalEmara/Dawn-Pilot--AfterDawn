# 🎯 YOLO Dataset Generator - System Architecture

## 📐 Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        A-Frame VR Scene                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │   Car    │  │   Pole   │  │TreeTrunk │  │ BusStop  │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
│         [ecs-entity] + data-entity-name attributes                  │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────────────┐
        │   YoloDatasetGenerator Component              │
        │   (Runs every captureInterval frames)         │
        └───────────────────────────────────────────────┘
                            ↓
    ┌───────────────────────────────────────────────────────┐
    │         Entity Detection & Filtering                  │
    │  1. Query: document.querySelectorAll("[ecs-entity]")  │
    │  2. Filter: DETECTABLE_MODELS list                    │
    │  3. Lookup: YOLO_CLASS_MAPPING (from backend)        │
    └───────────────────────────────────────────────────────┘
                            ↓
    ┌───────────────────────────────────────────────────────┐
    │              3D → 2D Projection                       │
    │  1. Get Box3 (3D bounding box)                        │
    │  2. Project 8 corners to 2D screen space              │
    │  3. Find min/max X/Y → 2D bbox                        │
    └───────────────────────────────────────────────────────┘
                            ↓
    ┌───────────────────────────────────────────────────────┐
    │              Visibility Checks                        │
    │  1. Frustum Check: Behind camera?                     │
    │  2. Occlusion Check: Raycasting                       │
    │  3. Size Check: Min visible pixels                    │
    └───────────────────────────────────────────────────────┘
                            ↓
    ┌───────────────────────────────────────────────────────┐
    │           Format Conversion                           │
    │  • YOLO: [class_id x_c y_c w h] (normalized)         │
    │  • JSON: {id, class, bbox, ...} (backend format)     │
    └───────────────────────────────────────────────────────┘
                            ↓
    ┌───────────────────────────────────────────────────────┐
    │              Output Generation                        │
    │  • frame_0000.jpg  ← Screenshot                       │
    │  • frame_0000.txt  ← YOLO annotations                 │
    │  • frame_0000.json ← JSON detections                  │
    └───────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

```
Backend                          Frontend                    Output
────────                         ────────                    ──────

┌──────────────┐
│modelsDeclare │
│   .ts        │────────┐
└──────────────┘        │
                        ├──→ Entity List
┌──────────────┐        │     (Car, Pole, etc.)
│yolo_class_   │        │
│mapping.json  │────────┘
└──────────────┘
                                    ↓
                        ┌─────────────────────┐
                        │  Scene Rendering    │
                        │  (Three.js/WebGL)   │
                        └─────────────────────┘
                                    ↓
                        ┌─────────────────────┐
                        │ YoloDatasetGenerator│
                        │   (A-Frame Comp)    │
                        └─────────────────────┘
                                    ↓
                        ┌─────────────────────┐
                        │  Detection Loop     │
                        │  - Project          │
                        │  - Filter           │
                        │  - Convert          │
                        └─────────────────────┘
                                    ↓
                                          ┌──────────────┐
                                          │ frame_XX.jpg │
                                          ├──────────────┤
                                          │ frame_XX.txt │
                                          ├──────────────┤
                                          │ frame_XX.json│
                                          └──────────────┘
```

---

## 🎯 Detection Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Entity Discovery                                    │
├─────────────────────────────────────────────────────────────┤
│ Input:  A-Frame Scene DOM                                   │
│ Query:  [ecs-entity] attribute                              │
│ Output: Array of entity elements                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Model Filtering                                     │
├─────────────────────────────────────────────────────────────┤
│ Input:  entity.data-entity-name                             │
│ Check:  DETECTABLE_MODELS array                             │
│ Filter: Car, Pole, TreeTrunk, BusStop, Person, etc.        │
│ Reject: Box, Sphere, Light, etc.                           │
│ Output: Filtered detectable entities                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Class ID Lookup                                     │
├─────────────────────────────────────────────────────────────┤
│ Input:  Entity name (e.g., "Car")                           │
│ Lookup: YOLO_CLASS_MAPPING                                  │
│ Result: Class ID (e.g., 0)                                  │
│ Skip:   If not in mapping                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: 3D Bounding Box                                     │
├─────────────────────────────────────────────────────────────┤
│ Input:  entity.object3D                                     │
│ Compute: THREE.Box3.setFromObject()                         │
│ Result:  box3 with min/max 3D coordinates                   │
│ 8 Corners: [min.xyz, max.xyz] combinations                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 5: 2D Projection                                       │
├─────────────────────────────────────────────────────────────┤
│ For each corner:                                            │
│   projected = corner.clone().project(camera)                │
│   x = ((projected.x + 1) / 2) * width                       │
│   y = ((-projected.y + 1) / 2) * height                     │
│                                                              │
│ Find: min/max X and Y                                       │
│ Result: 2D bbox [x_min, y_min, x_max, y_max]               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 6: Frustum Check                                       │
├─────────────────────────────────────────────────────────────┤
│ Check: projected.z > 1 ?                                    │
│ If yes: Corner behind camera → skip                        │
│ If all corners behind: Object not visible → skip            │
│ Else: Continue                                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 7: Occlusion Check                                     │
├─────────────────────────────────────────────────────────────┤
│ 1. Get object center (box3.getCenter())                     │
│ 2. Direction = center - cameraPosition                      │
│ 3. Raycast from camera to object                            │
│ 4. Check intersection with "collidable" objects             │
│ 5. If hit before object → Occluded → skip                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 8: Size Check                                          │
├─────────────────────────────────────────────────────────────┤
│ Area = (x_max - x_min) * (y_max - y_min)                    │
│ If area < minVisiblePixels → Too small → skip              │
│ Else: Valid detection                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 9: Format Conversion                                   │
├─────────────────────────────────────────────────────────────┤
│ YOLO Format:                                                │
│   x_center = (x_min + x_max) / 2 / width                    │
│   y_center = (y_min + y_max) / 2 / height                   │
│   box_width = (x_max - x_min) / width                       │
│   box_height = (y_max - y_min) / height                     │
│   Output: "class_id x_c y_c w h"                            │
│                                                              │
│ JSON Format:                                                │
│   {                                                          │
│     "id": detection_id,                                     │
│     "class": class_name,                                    │
│     "bbox": [x_min, y_min, width, height]                  │
│   }                                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 10: File Generation                                    │
├─────────────────────────────────────────────────────────────┤
│ 1. Screenshot:  canvas.toBlob() → frame_XXXX.jpg           │
│ 2. YOLO:        annotations.join('\n') → frame_XXXX.txt    │
│ 3. JSON:        JSON.stringify() → frame_XXXX.json         │
│ 4. Auto-download via browser API                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Visualization Pipeline

```
Generated Dataset
─────────────────
  frame_0000.jpg
  frame_0000.txt
  frame_0000.json
       ↓
       ├─────────────────┐
       ↓                 ↓
Python Visualizer   HTML Visualizer
─────────────────   ───────────────
 Load image          Load image
 Parse .txt/.json    Parse .txt/.json
 Draw bboxes         Draw bboxes (Canvas)
 Save/show           Interactive view
       ↓                 ↓
   ┌──────────────────────┐
   │  Visual Verification │
   │  ✅ Correct labels?  │
   │  ✅ Bbox accurate?   │
   │  ✅ No occlusions?   │
   └──────────────────────┘
```

---

## 🔄 Configuration Flow

```
User Settings
─────────────
  captureInterval: 60
  outputFormat: both
  enabled: true
       ↓
  ┌─────────────────┐
  │  A-Frame Scene  │
  │   Attribute     │
  └─────────────────┘
       ↓
  ┌─────────────────┐
  │   Component     │
  │   .data props   │
  └─────────────────┘
       ↓
  ┌─────────────────┐
  │  tick() method  │
  │  Check interval │
  └─────────────────┘
       ↓
  ┌─────────────────┐
  │ captureFrame()  │
  │   Execute       │
  └─────────────────┘
```

---

## 📊 Class Mapping Synchronization

```
Backend                          Sync Script              Frontend
───────                          ───────────              ────────

yolo_class_mapping.json              ↓
{                               Read JSON              YoloDatasetGenerator.ts
  "0": "Car",                        ↓
  "1": "Pole",                 Parse mappings          const YOLO_CLASS_MAPPING = {
  ...                                ↓                   "0": "Car",
}                              Generate TS code          "1": "Pole",
                                     ↓                   ...
                               Update .ts file         };
                                     ↓
                           ✅ Synchronized!
```

---

## 🎯 Entity Detection Logic

```
For each entity in scene:
  ↓
  Has [ecs-entity]?
  ├─ No → Skip
  └─ Yes ↓
         ↓
  Get data-entity-name
  ↓
  Name in DETECTABLE_MODELS?
  ├─ No → Skip (Box, Sphere, Light, etc.)
  └─ Yes ↓
         ↓
  Name in YOLO_CLASS_MAPPING?
  ├─ No → Warn & Skip
  └─ Yes ↓
         ↓
  Get Object3D
  ↓
  Calculate 3D → 2D
  ↓
  Visible?
  ├─ No → Skip
  └─ Yes ↓
         ↓
  Occluded?
  ├─ Yes → Skip
  └─ No ↓
        ↓
  Size OK?
  ├─ No → Skip
  └─ Yes ↓
         ↓
  ✅ VALID DETECTION
  ↓
  Add to annotations
```

---

## 📁 File Output Structure

```
dataset/
├── images/
│   ├── frame_0000.jpg  ←─┐
│   ├── frame_0001.jpg  ←─┤
│   └── ...             ←─┤  Screenshots
│                         │
├── labels_yolo/          │
│   ├── frame_0000.txt  ←─┤  YOLO format
│   ├── frame_0001.txt  ←─┤  (class_id x y w h)
│   └── ...             ←─┤
│                         │
└── labels_json/          │
    ├── frame_0000.json ←─┤  JSON format
    ├── frame_0001.json ←─┤  (backend compatible)
    └── ...             ←─┘
```

---

## 🎮 User Interaction Flow

```
1. Developer Integrates
   ├─ Import component
   ├─ Add to <Scene>
   └─ Set configuration

2. User Starts Scene
   ├─ Navigate with WASD
   ├─ Look with mouse
   └─ Click "Start Capture"

3. Component Activates
   ├─ tick() checks interval
   ├─ Every N frames
   └─ captureFrame()

4. Files Download
   ├─ Browser download API
   ├─ frame_XXXX.jpg
   ├─ frame_XXXX.txt
   └─ frame_XXXX.json

5. Developer Verifies
   ├─ Open visualizer
   ├─ Check annotations
   └─ Train model
```

---

## 🔧 Component Lifecycle

```
init()
  ├─ Get scene reference
  ├─ Get camera reference
  ├─ Get renderer reference
  ├─ Initialize raycaster
  ├─ Load class mapping
  └─ Set counters to 0

tick(time, timeDelta)
  ├─ Check if enabled
  ├─ Increment frameCount
  ├─ frameCount % captureInterval == 0?
  └─ Yes → captureFrame()

captureFrame()
  ├─ Query entities
  ├─ Filter detectables
  ├─ For each entity:
  │   ├─ Project 3D→2D
  │   ├─ Check visibility
  │   ├─ Check occlusion
  │   └─ Convert format
  ├─ Generate files
  └─ Increment captureCount

remove()
  └─ Cleanup (if needed)
```

---

This architecture diagram shows how all components work together to generate your synthetic YOLO dataset! 🚀
