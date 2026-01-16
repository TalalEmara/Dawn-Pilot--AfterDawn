# YOLO Dataset Generator - Implementation Summary

## 📁 Files Created

```
Front-End/Main-Main-App/DawnPilotFrontEnd/src/
├── AFrameComponents/
│   ├── YoloDatasetGenerator.ts          ← Main component
│   ├── YOLO_DATASET_GENERATOR_README.md ← Full documentation
│   └── YoloIntegrationGuide.ts          ← Quick snippets
└── examples/
    └── YoloDatasetExample.tsx           ← Complete working example
```

---

## ✅ What It Does

1. **Captures frames** from your A-Frame VR scene at configurable intervals
2. **Detects objects** with `class="detectable"` 
3. **Projects 3D bounding boxes** to 2D screen coordinates
4. **Checks occlusion** using raycasting (ignores hidden objects)
5. **Filters frustum** (ignores objects behind camera or off-screen)
6. **Outputs YOLO format** annotations: `class_id x_center y_center width height`
7. **Auto-downloads** paired `.jpg` + `.txt` files

---

## 🚀 Quick Start (3 Steps)

### Step 1: Import the Component

Add to your page (e.g., `Researcher.tsx`):

```typescript
import '../AFrameComponents/YoloDatasetGenerator';
```

### Step 2: Configure the Scene

```tsx
<Scene
  embedded
  renderer="preserveDrawingBuffer: true; antialias: false"  // ← Required!
  yolo-dataset-generator="
    enabled: true;
    targetClass: detectable;
    captureInterval: 60;
  "
>
```

### Step 3: Mark Your Entities

```tsx
<Entity
  primitive="a-box"
  className="detectable"           // ← Target class
  data-entity-name="Box"          // ← Must match classMapping
  position="0 1 -5"
/>
```

**✅ Done!** Files will download automatically as you move around.

---

## 🎛️ Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Start/stop capture |
| `targetClass` | `"detectable"` | CSS class to target |
| `captureInterval` | `60` | Frames between captures (~1/sec) |
| `autoDownload` | `true` | Auto-download files |
| `logToConsole` | `true` | Print to console |
| `occlusionCheckLayers` | `"collidable"` | Classes that block view |
| `classMapping` | `{"Box": 0, ...}` | Entity name → class ID |
| `minVisiblePixels` | `10` | Min bbox size to detect |

---

## 📊 Example Output

### Console (when `logToConsole: true`):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📸 Frame 0000 (3 detections):
0 0.512345 0.498765 0.123456 0.234567
1 0.789012 0.345678 0.098765 0.156789
2 0.234567 0.678901 0.234567 0.345678
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Files Downloaded:

- `frame_0000.jpg` ← Screenshot
- `frame_0000.txt` ← YOLO annotations

```txt
0 0.512345 0.498765 0.123456 0.234567
1 0.789012 0.345678 0.098765 0.156789
2 0.234567 0.678901 0.234567 0.345678
```

---

## 🎨 Integration Example (Researcher View)

```tsx
import 'aframe';
import '../AFrameComponents/YoloDatasetGenerator';
import { Entity, Scene } from 'aframe-react';
import { useState } from 'react';

function ResearcherView() {
  const [captureEnabled, setCaptureEnabled] = useState(false);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      
      {/* Control Button */}
      <button
        onClick={() => setCaptureEnabled(!captureEnabled)}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          padding: "12px 24px",
          background: captureEnabled ? "#f44336" : "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        {captureEnabled ? "⏹️ Stop" : "📸 Start"}
      </button>

      <Scene
        embedded
        renderer="preserveDrawingBuffer: true"
        yolo-dataset-generator={`
          enabled: ${captureEnabled};
          captureInterval: 60;
        `}
      >
        {/* Detectable Objects */}
        <Entity
          primitive="a-box"
          className="detectable"
          data-entity-name="Box"
          position="0 1 -5"
        />

        <Entity
          primitive="a-sphere"
          className="detectable"
          data-entity-name="Sphere"
          position="2 1 -5"
        />

        {/* Camera */}
        <Entity
          primitive="a-camera"
          position="0 1.6 4"
          wasd-controls="enabled: true"
        />
      </Scene>
    </div>
  );
}
```

---

## 🔧 How It Works Internally

```
Every N frames:
  1. Query all entities with class="detectable"
  2. For each entity:
     ├─ Get 3D bounding box (Box3)
     ├─ Project 8 corners to 2D screen space
     ├─ Check if any corners in front of camera
     ├─ Calculate min/max X/Y → 2D bbox
     ├─ Cast ray from camera to object
     ├─ If ray hits obstacle first → skip (occluded)
     ├─ Convert bbox to YOLO format
     └─ Add to annotations
  3. Download frame_XXXX.txt + frame_XXXX.jpg
```

---

## 🎯 Key Features

### ✅ Frustum Culling
Objects behind the camera or outside view are **automatically filtered**.

```typescript
// In projection loop:
if (projected.z > 1) return; // Behind camera
```

### ✅ Occlusion Detection
Raycasts from camera to object center, checks for obstacles:

```typescript
raycaster.set(cameraPos, direction);
raycaster.far = distanceToObject - 0.1;
const hits = raycaster.intersectObjects(occludingObjects);
if (hits.length > 0) return; // Occluded
```

### ✅ YOLO Normalization
Converts pixel coordinates to normalized [0-1] values:

```typescript
x_center = (x_min + x_max) / 2 / width;
y_center = (y_min + y_max) / 2 / height;
box_width = (x_max - x_min) / width;
box_height = (y_max - y_min) / height;
```

---

## 🐛 Troubleshooting

### ❌ No entities detected
- **Check**: Entities have `className="detectable"`
- **Check**: Entities have `data-entity-name="SomeName"`

### ❌ Entity not in class mapping
- **Check**: `data-entity-name` matches a key in `classMapping`
- **Fix**: Update classMapping or entity name

### ❌ Screenshots are black
- **Check**: Scene has `renderer="preserveDrawingBuffer: true"`

### ❌ Everything is occluded
- **Check**: Walls/obstacles have `className="collidable"`
- **Check**: Detectable objects don't have overlapping occlusion classes

### ❌ Too many files downloading
- **Fix**: Increase `captureInterval` (e.g., 300 for every 5 seconds)

---

## 📖 Additional Resources

- **Full Documentation**: `YOLO_DATASET_GENERATOR_README.md`
- **Integration Snippets**: `YoloIntegrationGuide.ts`
- **Working Example**: `examples/YoloDatasetExample.tsx`

---

## 🎓 YOLO Training Tips

1. **Collect diverse data**:
   - Move camera to different positions
   - Vary lighting conditions
   - Change object colors/scales/rotations

2. **Balance your dataset**:
   - ~Equal number of each class
   - Mix of easy and hard cases
   - Include partial occlusions

3. **Organize for training**:
   ```
   dataset/
   ├── images/
   │   ├── train/ (80%)
   │   └── val/   (20%)
   └── labels/
       ├── train/
       └── val/
   ```

4. **Train with YOLOv8**:
   ```python
   from ultralytics import YOLO
   model = YOLO('yolov8n.pt')
   model.train(data='config.yaml', epochs=100)
   ```

---

## 🔮 Advanced Usage

### Manual Capture Trigger

```typescript
const sceneEl = document.querySelector('a-scene') as any;
const component = sceneEl.components['yolo-dataset-generator'];
component.captureFrame();
```

### Dynamic Class Mapping

```typescript
<Scene
  yolo-dataset-generator={`
    classMapping: ${JSON.stringify(dynamicClassMap)};
  `}
/>
```

### Capture on Event

```typescript
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'c') {
      const scene = document.querySelector('a-scene') as any;
      scene.components['yolo-dataset-generator'].captureFrame();
    }
  };
  window.addEventListener('keypress', handleKeyPress);
  return () => window.removeEventListener('keypress', handleKeyPress);
}, []);
```

---

## 📝 Summary

You now have a **complete YOLO dataset generator** for your A-Frame VR scene that:

- ✅ Automatically detects and labels objects
- ✅ Projects 3D bounding boxes to 2D
- ✅ Handles occlusion and frustum culling
- ✅ Outputs industry-standard YOLO format
- ✅ Captures paired images + annotations
- ✅ Fully configurable and extensible

**Ready to generate your training data!** 🚀

---

## 📞 Need Help?

Check the files in this order:
1. This summary (overview)
2. `YoloIntegrationGuide.ts` (quick snippets)
3. `YOLO_DATASET_GENERATOR_README.md` (full docs)
4. `examples/YoloDatasetExample.tsx` (working code)
