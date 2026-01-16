# YOLO Dataset Generator Component

A-Frame component for generating synthetic YOLO object detection datasets from VR scenes.

## Features

✅ **World-to-Screen Projection** - Converts 3D bounding boxes to 2D screen coordinates  
✅ **YOLO Format Output** - Normalized `[class_id, x_center, y_center, width, height]`  
✅ **Frustum Culling** - Ignores objects behind camera or outside view  
✅ **Occlusion Detection** - Uses raycasting to detect occluded objects  
✅ **Automatic Screenshots** - Captures corresponding frames as `.jpg`  
✅ **Configurable** - Flexible class mapping, capture intervals, and more  

---

## Installation

1. **Import the component** in your page/component:

```typescript
import '../AFrameComponents/YoloDatasetGenerator';
```

2. **Ensure your scene has** `preserveDrawingBuffer: true`:

```tsx
<Scene
  embedded
  renderer="preserveDrawingBuffer: true; antialias: false"
>
  {/* Your entities */}
</Scene>
```

3. **Add the component to your `<a-scene>`**:

```tsx
<Scene
  yolo-dataset-generator="
    enabled: true;
    targetClass: detectable;
    captureInterval: 60;
    autoDownload: true;
  "
>
  {/* ... */}
</Scene>
```

---

## Configuration Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable data capture |
| `targetClass` | string | `"detectable"` | CSS class name to target entities |
| `captureInterval` | number | `60` | Capture every N frames (~1/sec at 60fps) |
| `autoDownload` | boolean | `true` | Auto-download annotation + image files |
| `logToConsole` | boolean | `true` | Log YOLO annotations to console |
| `occlusionCheckLayers` | string | `"collidable"` | CSS class for occlusion obstacles |
| `classMapping` | string (JSON) | See below | Entity name → YOLO class ID mapping |
| `minVisiblePixels` | number | `10` | Minimum bounding box area to detect |

### Default Class Mapping

```json
{
  "Box": 0,
  "Sphere": 1,
  "Cylinder": 2,
  "Car": 3,
  "Light": 4
}
```

---

## Usage Example

### Basic Setup (Researcher View)

```tsx
import 'aframe';
import '../AFrameComponents/YoloDatasetGenerator';
import { Entity, Scene } from 'aframe-react';

function ResearcherView() {
  return (
    <Scene
      embedded
      renderer="preserveDrawingBuffer: true; antialias: false"
      yolo-dataset-generator="
        enabled: true;
        targetClass: detectable;
        captureInterval: 60;
        autoDownload: true;
        occlusionCheckLayers: collidable;
        classMapping: {\"Box\": 0, \"Sphere\": 1, \"Car\": 2};
      "
    >
      {/* Camera */}
      <Entity
        primitive="a-camera"
        position="0 2 4"
        wasd-controls="enabled: true"
      />

      {/* Detectable Objects */}
      <Entity
        primitive="a-box"
        className="detectable"
        data-entity-name="Box"
        position="-2 1 -5"
        color="red"
      />

      <Entity
        primitive="a-sphere"
        className="detectable"
        data-entity-name="Sphere"
        position="2 1 -5"
        color="blue"
      />

      <Entity
        gltf-model="/car"
        className="detectable"
        data-entity-name="Car"
        position="0 0 -10"
      />

      {/* Occluding Wall */}
      <Entity
        primitive="a-box"
        className="collidable"
        position="0 1 -7"
        scale="5 3 0.5"
        color="gray"
      />

      {/* Ground */}
      <Entity
        primitive="a-plane"
        rotation="-90 0 0"
        scale="50 50 1"
        color="#222"
      />
    </Scene>
  );
}
```

---

## Important: Entity Setup

For the component to work properly, your entities **must** have:

1. **Class name**: `className="detectable"` (or your custom `targetClass`)
2. **Entity name attribute**: `data-entity-name="Box"` (must match class mapping)

### Example with Dynamic Entities

```tsx
{world.entities.map((e) => {
  const isDetectable = e.name !== "Light" && e.name !== "Zone";
  
  return (
    <Entity
      key={e.id}
      gltf-model={e.Model?.url}
      position={`${e.Position.x} ${e.Position.y} ${e.Position.z}`}
      className={isDetectable ? "detectable collidable" : ""}
      data-entity-name={e.name}
    />
  );
})}
```

---

## Output Files

When `autoDownload: true`, the component generates:

### 1. Annotation Files (`frame_0000.txt`, `frame_0001.txt`, ...)

```
0 0.512345 0.498765 0.123456 0.234567
2 0.789012 0.345678 0.098765 0.156789
```

Each line: `class_id x_center y_center width height` (normalized 0-1)

### 2. Image Files (`frame_0000.jpg`, `frame_0001.jpg`, ...)

Screenshots captured from the WebGL renderer at the same moment.

---

## How It Works

### 1. **Target Selection**
- Queries all entities with `class="${targetClass}"`
- Reads `data-entity-name` attribute to determine YOLO class ID

### 2. **3D → 2D Projection**
```typescript
// Get 3D bounding box (Box3)
const box3 = new THREE.Box3().setFromObject(object3D);

// Project 8 corners to screen space
corners.forEach(corner => {
  const projected = corner.project(camera);
  const x = ((projected.x + 1) / 2) * width;
  const y = ((-projected.y + 1) / 2) * height;
});

// Find min/max to create 2D bounding box
```

### 3. **Frustum Check**
- Filters out corners with `z > 1` (behind camera)
- Clamps coordinates to screen bounds `[0, width] x [0, height]`

### 4. **Occlusion Check**
- Casts ray from camera to object center
- Checks intersection with objects having `class="${occlusionCheckLayers}"`
- If hit before object distance → **occluded** ❌

### 5. **YOLO Conversion**
```typescript
x_center = (x_min + x_max) / 2 / width
y_center = (y_min + y_max) / 2 / height
box_width = (x_max - x_min) / width
box_height = (y_max - y_min) / height
```

---

## Console Output

When `logToConsole: true`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📸 Frame 0000 (2 detections):
0 0.512345 0.498765 0.123456 0.234567
2 0.789012 0.345678 0.098765 0.156789
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Detected "Box" [class 0]: 0 0.512345 0.498765 0.123456 0.234567
🚫 Object "Sphere" is occluded, skipping
✅ Detected "Car" [class 2]: 2 0.789012 0.345678 0.098765 0.156789
```

---

## Advanced Configuration

### Custom Class Mapping

```tsx
<Scene
  yolo-dataset-generator={`
    classMapping: {
      "Person": 0,
      "Car": 1,
      "Bicycle": 2,
      "TrafficLight": 3
    };
  `}
>
```

### Capture Every Frame (High Speed)

```tsx
<Scene
  yolo-dataset-generator="captureInterval: 1"
>
```

### Manual Trigger (Disable Auto)

```tsx
<Scene
  yolo-dataset-generator="enabled: false"
>
```

```typescript
// In your code:
const sceneEl = document.querySelector('a-scene');
const component = sceneEl.components['yolo-dataset-generator'];

// Enable and capture
component.data.enabled = true;
component.captureFrame(); // Manual trigger
component.data.enabled = false;
```

---

## Integration with Existing Project

### Option 1: Researcher View (Already Has `preserveDrawingBuffer`)

File: `src/pages/DesktopView/Researcher.tsx`

```tsx
import '../AFrameComponents/YoloDatasetGenerator'; // Add this import

// In your Scene component:
<Scene
  embedded
  vr-mode-ui="enabled: false"
  renderer="preserveDrawingBuffer: true; antialias: false"
  yolo-dataset-generator="
    enabled: true;
    targetClass: detectable;
    captureInterval: 60;
  "
>
  {/* Existing entities */}
</Scene>
```

### Option 2: Desktop View

File: `src/pages/DesktopView/DesktopView.tsx`

Same as above, ensure `renderer="preserveDrawingBuffer: true"`.

---

## Troubleshooting

### ❌ "No entities found with class 'detectable'"

**Solution**: Add `className="detectable"` to your entities:

```tsx
<Entity
  primitive="a-box"
  className="detectable"
  data-entity-name="Box"
/>
```

### ❌ "Entity not in class mapping, skipping"

**Solution**: Add `data-entity-name` attribute matching your `classMapping`:

```tsx
<Entity
  data-entity-name="Box" // Must match classMapping key
/>
```

### ❌ Screenshots are black

**Solution**: Ensure renderer has `preserveDrawingBuffer: true`:

```tsx
<Scene renderer="preserveDrawingBuffer: true" />
```

### ❌ All objects detected as occluded

**Solution**: Check your `occlusionCheckLayers` class. Make sure walls/obstacles have this class but detectable objects don't overlap it unnecessarily.

---

## Performance Considerations

- **Capture Interval**: Higher values = less performance impact
  - `1` = Every frame (60 files/sec at 60fps) 🔥 Heavy
  - `60` = ~1/second (Recommended) ✅
  - `300` = Every 5 seconds (Light) 💨

- **Occlusion Checks**: Raycasting is expensive
  - Limit number of `occlusionCheckLayers` objects
  - Consider disabling occlusion for simpler scenes

- **Min Visible Pixels**: Increase to filter out tiny/distant objects

---

## Dataset Training Tips

1. **Vary camera positions** - Move around the scene
2. **Change lighting** - Different times of day
3. **Add variety** - Different colors, scales, rotations
4. **Balance classes** - Equal number of each object type
5. **Train-test split** - Keep 20% for validation

---

## Example YOLO Training Setup

After generating your dataset:

```bash
dataset/
├── images/
│   ├── frame_0000.jpg
│   ├── frame_0001.jpg
│   └── ...
└── labels/
    ├── frame_0000.txt
    ├── frame_0001.txt
    └── ...
```

YOLOv8 training:

```python
from ultralytics import YOLO

model = YOLO('yolov8n.pt')
model.train(data='config.yaml', epochs=100, imgsz=640)
```

`config.yaml`:
```yaml
path: ./dataset
train: images
val: images

nc: 5  # Number of classes
names:
  0: Box
  1: Sphere
  2: Cylinder
  3: Car
  4: Light
```

---

## License

MIT - Use freely in your VR/AR projects! 🚀
