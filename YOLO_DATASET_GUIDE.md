# 🎯 YOLO Dataset Generator - Complete Guide

## 📋 Overview

This system generates synthetic YOLO training datasets from A-Frame VR scenes by automatically detecting entities, projecting 3D bounding boxes to 2D screen space, checking occlusions, and exporting labeled images with annotations.

**Created Files:**
- YoloDatasetGenerator.ts - Main A-Frame component
- yolo_visualization_tool.py - Python batch visualizer
- yolo-visualizer.html - Interactive browser visualizer
- sync_class_mapping.py - Backend↔Frontend sync utility

---

## 🏗️ System Architecture

```
A-Frame Scene (3D World)
         ↓
YoloDatasetGenerator Component
    ├─ Entity Detection (via [gltf-model] selector)
    ├─ 3D → 2D Projection (Box3 corners)
    ├─ Occlusion Check (raycasting)
    ├─ Frustum Culling (behind camera)
    └─ YOLO Format Conversion
         ↓
Output (Auto-download every ~1 second)
    ├─ frame_0000.jpg (screenshot)
    ├─ frame_0000.txt (YOLO format)
    └─ frame_0000.json (JSON format)
```

---

## 📁 File Structure & Purpose

### **Core Component**
```
Front-End/Main-Main-App/DawnPilotFrontEnd/src/AFrameComponents/
└── YoloDatasetGenerator.ts (470 lines)
```
**Purpose:** A-Frame component that runs every frame to detect entities and generate annotations
**Key Features:**
- Automatic entity detection from loaded scenarios
- 3D bounding box → 2D screen projection
- Occlusion detection via raycasting
- Dual output format (YOLO + JSON)
- Queued downloads to reduce browser prompts

### **Visualization Tools**
```
Back-End/fast_api/object_path_detection/
└── yolo_visualization_tool.py (350 lines)

Front-End/
└── yolo-visualizer.html (600 lines)
```

**yolo_visualization_tool.py:**
- Python CLI tool for batch processing
- Reads YOLO .txt or JSON format
- Draws bounding boxes with OpenCV
- Generates statistics and reports
- Usage: `python yolo_visualization_tool.py --dataset-dir ./dataset --format yolo`

**yolo-visualizer.html:**
- Interactive browser-based viewer
- Frame-by-frame navigation
- Real-time statistics dashboard
- Class distribution charts
- Supports both YOLO and JSON formats
- Usage: Open in browser, select dataset folder

### **Sync Utility**
```
scripts/
└── sync_class_mapping.py (100 lines)
```
**Purpose:** Keeps backend JSON in sync with frontend TypeScript constant
- Reads: `Back-End/fast_api/object_path_detection/yolo_class_mapping.json`
- Updates: `YoloDatasetGenerator.ts` YOLO_CLASS_MAPPING constant
- Usage: `python scripts/sync_class_mapping.py`

### **Class Mapping (Backend)**
```
Back-End/fast_api/object_path_detection/
└── yolo_class_mapping.json
```
```json
{
  "0": "Car",
  "1": "Pole",
  "3": "Bus station",
  "5": "Tree Trunk",
  "6": "Person",
  "15": "Potted Plant"
}
```
**Purpose:** Single source of truth for class IDs

---

## ⚙️ Configuration & Setup

### **Step 1: Chrome Browser Setup** (One-Time)

**Problem:** Chrome prompts for permission on each download

**Solution:**

1. **Disable Download Prompts:**
   - Open Chrome Settings (`chrome://settings/`)
   - Search "Downloads"
   - **Turn OFF**: "Ask where to save each file before downloading"
   - Set default folder: `D:\YOLO_Dataset` (or your choice)

2. **Allow Automatic Downloads:**
   - Settings → Privacy and Security → Site Settings
   - Scroll to "Automatic downloads"
   - Add `http://localhost:5173`
   - Set to **"Allow"**

### **Step 2: Integration in Researcher.tsx**

The component is already integrated:

```typescript
// 1. Import component
import "../../AFrameComponents/YoloDatasetGenerator";

// 2. Add to Scene
<Scene
  yolo-dataset-generator="enabled: true; captureInterval: 60; outputFormat: both"
  renderer="preserveDrawingBuffer: true"
>
  {/* Entities must have gltf-model attribute */}
  <Entity
    gltf-model="models/Car/Car.glb"
    data-entity-name="Car"
    position="0 0 -5"
  />
</Scene>
```

**Component Parameters:**
- `enabled: true` - Turn on/off dataset generation
- `captureInterval: 60` - Capture every N frames (~1 second at 60fps)
- `outputFormat: both` - 'yolo', 'json', or 'both'
- `autoDownload: true` - Auto-download files (default)
- `minVisiblePixels: 10` - Minimum bbox size threshold

### **Step 3: Entity Requirements**

For entities to be detected:

✅ **Required:**
- Must have `gltf-model` attribute (fallback selector)
- OR have `[ecs-entity]` attribute (primary selector)

✅ **Optional but Recommended:**
- `data-entity-name="Car"` - Explicit name for class mapping
- Should match names in `yolo_class_mapping.json`

✅ **Automatically Excluded:**
- Elements with class `depth-ignore` (camera hitbox)
- Entities not in DETECTABLE_MODELS list
- Entities behind camera (frustum culled)
- Occluded entities (raycasting check)

---

## 🚀 Usage Workflow

### **1. Start Development Server**

```bash
cd Front-End/Main-Main-App/DawnPilotFrontEnd
pnpm dev
```

### **2. Navigate to Researcher Page**

- Open browser: `http://localhost:5173`
- Go to Researcher View
- Load a scenario (📂 Load Scenario button)

### **3. Generate Dataset**

- Move around with **WASD**
- Look at entities with **Mouse**
- Files auto-download every ~1 second:
  - `frame_0000.jpg` (screenshot)
  - `frame_0000.txt` (YOLO annotations)
  - `frame_0000.json` (JSON detections)

**Console Output:**
```
🎯 YOLO Dataset Generator initialized
📊 YOLO Class Mapping: {Car: 0, Pole: 1, ...}
🔄 Using fallback selector [gltf-model], found: 8
✅ Detected "Car" [class 0]: 0 0.234567 0.456789 0.123456 0.234567
📸 Frame 0000 (3 detections)
```

### **4. Organize Files**

Files download to your set folder. Organize them:

```powershell
# Create structure
mkdir D:\YOLO_Dataset\images
mkdir D:\YOLO_Dataset\labels_yolo
mkdir D:\YOLO_Dataset\labels_json

# Move files
Move-Item D:\YOLO_Dataset\frame_*.jpg D:\YOLO_Dataset\images\
Move-Item D:\YOLO_Dataset\frame_*.txt D:\YOLO_Dataset\labels_yolo\
Move-Item D:\YOLO_Dataset\frame_*.json D:\YOLO_Dataset\labels_json\
```

### **5. Visualize & Verify**

**Option A: Python Tool (Batch)**
```bash
cd Back-End/fast_api/object_path_detection
python yolo_visualization_tool.py --dataset-dir D:\YOLO_Dataset --format yolo
```

**Option B: HTML Tool (Interactive)**
- Open `Front-End/yolo-visualizer.html` in browser
- Click "Select Dataset Folder"
- Choose `D:\YOLO_Dataset\images\`
- Navigate with arrow keys
- Check statistics panel

---

## 📊 Output Formats

### **YOLO Format (.txt)**
```
class_id x_center y_center width height
0 0.234567 0.456789 0.123456 0.234567
1 0.567890 0.345678 0.089012 0.456789
```
- All values normalized to [0, 1]
- Coordinates are center-based
- One line per detection

### **JSON Format (.json)**
```json
{
  "frame_id": "frame_0000",
  "file_path": "frame_0000.jpg",
  "timestamp": 1737000000000,
  "camera_intrinsics": {
    "fx": null,
    "fy": null,
    "cx": null,
    "cy": null
  },
  "obstacles": [
    {
      "id": 1,
      "class": "Car",
      "shape": null,
      "bbox": [234, 456, 123, 234],
      "distance_m": null,
      "mask_path": null,
      "velocity": null,
      "hazard": null
    }
  ]
}
```
- Compatible with existing backend detection format
- Pixel coordinates (not normalized)
- Includes metadata and extensible fields

---

## 🔧 Troubleshooting

### **Issue: No entities detected**
```
⚠️ No detectable entities found in scene
```
**Solutions:**
- Entities must have `gltf-model` attribute
- Check entity names match `yolo_class_mapping.json`
- Verify entities are not in DETECTABLE_MODELS exclusion list
- Ensure scenario is loaded (not empty scene)

### **Issue: Black screenshots**
**Solution:** Fixed in latest version
- Component now forces render before screenshot
- `preserveDrawingBuffer: true` set in Scene renderer
- JPEG quality set to 95%

### **Issue: Too many download prompts**
**Solution:** 
- Configure Chrome as described in Step 1
- Component now uses download queue (200ms delay between files)
- Batch processing reduces simultaneous downloads

### **Issue: Wrong bounding boxes**
**Causes:**
- Entity too far (move closer)
- Entity behind camera (look at entity)
- Occlusion by walls (check visibility)
- Scale issues (verify entity scale is reasonable)

**Debug:**
Enable console logging to see detection pipeline:
```typescript
yolo-dataset-generator="logToConsole: true"
```

### **Issue: Collision warnings in console**
**Solution:** Already fixed
- Disabled debug logging in Collision.ts
- Increased movement threshold (0.000001 → 0.0001)
- Reduced log frequency (60 ticks → 300 ticks)

---

## 🎓 Best Practices

### **Dataset Quality**

✅ **Capture Strategy:**
- Walk around objects (360° coverage)
- Multiple distances (close, medium, far)
- Vary camera height (ground level, eye level)
- Include partial occlusions
- Different lighting conditions

✅ **Quantity Guidelines:**
- Minimum: 100 frames per class
- Recommended: 500-1000 frames per class
- Production: 5000+ frames per class

✅ **Quality Checks:**
- Tight bounding boxes (boxes fit objects closely)
- No false positives (only visible objects annotated)
- Consistent class labels
- Variety of viewing angles

### **Performance Optimization**

**Adjust Capture Rate:**
```typescript
// Faster (every 30 frames = ~0.5 sec)
captureInterval: 30

// Slower (every 120 frames = ~2 sec)
captureInterval: 120
```

**Reduce Output:**
```typescript
// Only YOLO format
outputFormat: "yolo"

// Only JSON format
outputFormat: "json"
```

**Temporarily Disable:**
```typescript
enabled: false
```

---

## 🔄 Maintenance

### **Update Class Mapping**

When adding new detectable objects:

1. **Update backend mapping:**
   ```json
   // Back-End/fast_api/object_path_detection/yolo_class_mapping.json
   {
     "0": "Car",
     "16": "NewObject"  // Add new class
   }
   ```

2. **Sync to frontend:**
   ```bash
   python scripts/sync_class_mapping.py
   ```

3. **Update detectable models list:**
   ```typescript
   // YoloDatasetGenerator.ts
   const DETECTABLE_MODELS = [
     "Car", "Pole", "Person", 
     "NewObject"  // Add here
   ];
   ```

### **Version Control**

Commit class mapping changes together:
```bash
git add Back-End/fast_api/object_path_detection/yolo_class_mapping.json
git add Front-End/.../YoloDatasetGenerator.ts
git commit -m "Add NewObject to YOLO class mapping"
```

---

## 🎯 Training YOLO Model

After generating dataset:

### **1. Create dataset.yaml**
```yaml
path: D:\YOLO_Dataset
train: images
val: images

names:
  0: Car
  1: Pole
  3: Bus station
  5: Tree Trunk
  6: Person
  15: Potted Plant
```

### **2. Train Model**
```bash
yolo train data=dataset.yaml model=yolov8n.pt epochs=100 imgsz=640
```

### **3. Validate**
```bash
yolo val model=runs/detect/train/weights/best.pt data=dataset.yaml
```

### **4. Deploy**
Integrate trained model in FastAPI backend for real-time detection

---

## 🔍 Technical Details

### **Detection Pipeline**

```
1. Query Entities
   └─ Selector: [gltf-model] (fallback from [ecs-entity])

2. Filter Detectables
   └─ Check: DETECTABLE_MODELS array
   └─ Skip: depth-ignore, Unknown entities

3. Get Class ID
   └─ Lookup: entity name in YOLO_CLASS_MAPPING
   └─ Skip if not found

4. Check Occlusion
   └─ Raycast: camera → object center
   └─ Collision: .collidable elements
   └─ Skip if occluded

5. Project 3D → 2D
   └─ Get Box3 (3D bounding box)
   └─ Project 8 corners to screen space
   └─ Find min/max X/Y

6. Frustum Cull
   └─ Check: projected.z > 1 (behind camera)
   └─ Skip if all corners behind

7. Size Check
   └─ Area: (x_max - x_min) * (y_max - y_min)
   └─ Skip if < minVisiblePixels

8. Format Conversion
   └─ YOLO: normalized center + size
   └─ JSON: pixel coordinates + metadata

9. Render & Capture
   └─ Force render (updates canvas)
   └─ toBlob() with JPEG quality 95%

10. Queue Download
    └─ Add to queue (200ms delay between files)
    └─ Batch download reduces browser prompts
```

### **Coordinate Systems**

**3D World Space (A-Frame):**
- Origin: Scene center
- Units: Meters
- Y-up coordinate system

**2D Screen Space (YOLO):**
- Origin: Top-left corner
- Units: Normalized [0, 1]
- Center-based coordinates

**Conversion:**
```typescript
// Pixel → Normalized
x_center = (x_min + x_max) / 2 / width
y_center = (y_min + y_max) / 2 / height
box_width = (x_max - x_min) / width
box_height = (y_max - y_min) / height
```

---

## 📞 Support & Next Steps

### **Common Tasks**

**Add new detectable class:**
1. Update `yolo_class_mapping.json`
2. Run `sync_class_mapping.py`
3. Add to DETECTABLE_MODELS

**Change capture rate:**
- Modify `captureInterval` parameter
- 60 = ~1 second, 30 = ~0.5 second

**Disable during navigation:**
- Set `enabled: false` in component

**Export to different format:**
- Modify `outputFormat` parameter

### **Future Enhancements**

- [ ] Depth map integration (distance_m field)
- [ ] Segmentation masks (mask_path field)
- [ ] Velocity tracking (velocity field)
- [ ] Hazard classification (hazard field)
- [ ] Camera intrinsics calculation
- [ ] Dataset augmentation options
- [ ] Real-time preview overlay

---

## 🎉 Summary

You now have a complete synthetic YOLO dataset generator that:
- ✅ Automatically detects entities from loaded scenarios
- ✅ Projects 3D bounding boxes to 2D screen space
- ✅ Handles occlusions and frustum culling
- ✅ Exports in standard YOLO format + JSON
- ✅ Includes visualization tools for verification
- ✅ Integrates seamlessly with existing pipeline

**Start generating datasets and training your custom vision models!** 🚀
