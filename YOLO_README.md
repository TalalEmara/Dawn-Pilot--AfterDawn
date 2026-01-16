# 🎯 YOLO Synthetic Dataset Generator

Complete implementation for generating YOLO object detection datasets from A-Frame VR scenes.

---

## 📦 Files Overview

```
Dawn-Pilot--AfterDawn/
│
├── 📄 YOLO_INTEGRATION_FINAL.md           ← **START HERE** - Complete guide
│
├── 📁 Front-End/
│   ├── 🧪 yolo-test.html                  ← Standalone test (no build)
│   ├── 🎨 yolo-visualizer.html            ← HTML dataset viewer
│   │
│   └── 📁 Main-Main-App/DawnPilotFrontEnd/src/
│       └── 📁 AFrameComponents/
│           ├── ⚙️ YoloDatasetGenerator.ts ← Main component
│           ├── 📚 YOLO_DATASET_GENERATOR_README.md
│           └── 📝 YoloIntegrationGuide.ts
│
├── 📁 Back-End/
│   └── 📁 fast_api/object_path_detection/
│       ├── 📊 yolo_class_mapping.json     ← Class definitions
│       └── 🐍 yolo_visualization_tool.py  ← Python visualizer
│
└── 📁 scripts/
    └── 🔄 sync_class_mapping.py           ← Sync backend↔frontend
```

---

## 🚀 Quick Start (3 Minutes)

### 1. Import Component

In your page (e.g., `Researcher.tsx`):

```typescript
import '../AFrameComponents/YoloDatasetGenerator';
```

### 2. Add to Scene

```tsx
<Scene
  renderer="preserveDrawingBuffer: true"
  yolo-dataset-generator="enabled: true; captureInterval: 60"
>
  {/* Your existing entities */}
</Scene>
```

### 3. Run & Capture

- Start dev server
- Move around scene
- Files download automatically!

**Done!** 🎉

---

## ⚙️ Configuration

```tsx
yolo-dataset-generator="
  enabled: true;                    // Toggle on/off
  captureInterval: 60;              // Frames between captures
  outputFormat: both;               // 'yolo', 'json', or 'both'
  autoDownload: true;               // Auto-download files
  logToConsole: true;               // Console logging
  occlusionCheckLayers: collidable; // Occlusion check
  minVisiblePixels: 10;             // Min bbox size
"
```

---

## 📊 Output Formats

### YOLO (.txt)
```
0 0.512345 0.498765 0.123456 0.234567
1 0.789012 0.345678 0.098765 0.156789
```

### JSON (.json)
```json
{
  "frame_id": "frame_0000",
  "obstacles": [
    {
      "id": 1,
      "class": "Car",
      "bbox": [10, 20, 150, 100]
    }
  ]
}
```

### Screenshots (.jpg)
Paired with each annotation file.

---

## 🎨 Visualization

### Option 1: HTML (Easy)

1. Open `Front-End/yolo-visualizer.html`
2. Select images & annotations
3. Navigate with arrow keys

### Option 2: Python (Batch)

```bash
cd Back-End/fast_api/object_path_detection
python yolo_visualization_tool.py --input dataset/ --format yolo
```

---

## 🎯 Class Mapping

Uses `yolo_class_mapping.json`:

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

**To update:**
1. Edit `yolo_class_mapping.json`
2. Run `python scripts/sync_class_mapping.py`
3. Rebuild frontend

---

## 📖 Documentation

| Document | Purpose |
|----------|---------|
| **YOLO_INTEGRATION_FINAL.md** | Complete integration guide |
| **YOLO_DATASET_GENERATOR_README.md** | Technical documentation |
| **YoloIntegrationGuide.ts** | Code snippets |

---

## 🔧 Features

✅ **Automatic Detection** - Targets entities from `modelsDeclare.ts`  
✅ **Backend Integration** - Uses existing `yolo_class_mapping.json`  
✅ **Dual Output** - YOLO (.txt) and JSON formats  
✅ **Occlusion Check** - Raycasting for hidden objects  
✅ **Frustum Culling** - Ignores off-screen objects  
✅ **Visualization Tools** - Python + HTML viewers  
✅ **Configurable** - Frame rate, output format, etc.  

---

## 🎓 Typical Workflow

```bash
1. Start dev environment
   → pnpm dev:all

2. Navigate to Researcher view
   → Enable dataset capture

3. Move around scene
   → WASD + mouse control
   → Files download automatically

4. Verify dataset
   → Open yolo-visualizer.html
   → Check annotations

5. Train model
   → Use YOLOv8 with generated data
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| No detections | Add `data-entity-name={e.name}` |
| Black screenshots | Add `renderer="preserveDrawingBuffer: true"` |
| Class not found | Update `yolo_class_mapping.json` |
| Too many files | Increase `captureInterval` |

---

## 💡 Tips

- **Frame Rate:** Use `captureInterval: 60` (1/sec) for balanced dataset
- **Quality:** Move slowly for better coverage
- **Variety:** Change lighting, angles, distances
- **Validation:** Always verify with visualization tools

---

## 📞 Support

All questions answered in `YOLO_INTEGRATION_FINAL.md`

---

## 🎉 Ready to Go!

Everything is set up and ready to use. Generate your synthetic dataset now! 🚀

**Happy training!** 📸🎯
