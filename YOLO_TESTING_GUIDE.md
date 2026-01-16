# 🧪 YOLO Dataset Generator - Testing Guide

## 📋 Prerequisites

✅ All files created in previous steps  
✅ Component integrated into Researcher.tsx  
✅ Development server ready to run  

---

## 🚀 Step-by-Step Testing Instructions

### **Step 1: Start Development Server**

```bash
cd Front-End/Main-Main-App/DawnPilotFrontEnd
pnpm dev
```

Or use the VS Code task:
- Press `Ctrl+Shift+P`
- Type "Run Task"
- Select `dev:frontend`

Wait for server to start (usually http://localhost:5173)

---

### **Step 2: Navigate to Researcher Page**

1. Open browser to `http://localhost:5173`
2. Navigate to the **Researcher View** page
3. You should see the VR scene with entities loaded

---

### **Step 3: Verify Component is Active**

Open browser console (`F12` → Console tab) and look for:

```
✅ YoloDatasetGenerator initialized
📊 Loaded 6 class mappings
🎯 Detectable models: Car, TreeTrunk, Pole, ...
```

If you see these messages, the component is running!

---

### **Step 4: Position Camera for Good View**

Use controls to position yourself:
- **WASD** - Move around
- **Mouse** - Look around
- **VR Controller** (if connected) - Button 7 (up), Button 6 (down)

**Best practices:**
- Face entities directly for better detection
- Keep 2-5 meters distance
- Ensure entities are not behind walls
- Look at multiple entities at once for multi-object detection

---

### **Step 5: Wait for Automatic Capture**

The component captures **automatically every 60 frames** (~1 second).

Watch the console for:
```
📸 Frame 0000 captured: 3 detections
  ├─ Car (class 0) @ [0.234, 0.456, 0.123, 0.234]
  ├─ Pole (class 1) @ [0.567, 0.345, 0.089, 0.456]
  └─ Person (class 6) @ [0.789, 0.234, 0.145, 0.367]
```

---

### **Step 6: Check Downloaded Files**

Files auto-download to your browser's download folder:

```
Downloads/
├── frame_0000.jpg   ← Screenshot
├── frame_0000.txt   ← YOLO annotations
├── frame_0000.json  ← JSON detections
├── frame_0001.jpg
├── frame_0001.txt
├── frame_0001.json
└── ...
```

---

### **Step 7: Organize Dataset**

Create proper folder structure:

```bash
mkdir yolo_dataset
mkdir yolo_dataset/images
mkdir yolo_dataset/labels_yolo
mkdir yolo_dataset/labels_json

# Move files (Windows PowerShell)
Move-Item Downloads/frame_*.jpg yolo_dataset/images/
Move-Item Downloads/frame_*.txt yolo_dataset/labels_yolo/
Move-Item Downloads/frame_*.json yolo_dataset/labels_json/
```

---

### **Step 8: Verify YOLO Format**

Open any `.txt` file (e.g., `frame_0000.txt`):

```
0 0.234567 0.456789 0.123456 0.234567
1 0.567890 0.345678 0.089012 0.456789
6 0.789012 0.234567 0.145678 0.367890
```

Format: `class_id x_center y_center width height` (all normalized 0-1)

---

### **Step 9: Verify JSON Format**

Open any `.json` file:

```json
{
  "frame_id": "0000",
  "timestamp": 1737000000000,
  "detections": [
    {
      "id": 0,
      "class": "Car",
      "class_id": 0,
      "bbox": [234, 456, 123, 234],
      "confidence": 1.0
    }
  ]
}
```

---

### **Step 10: Visualize with Python Tool**

```bash
cd Back-End/fast_api/object_path_detection
python yolo_visualization_tool.py --dataset-dir ../../../yolo_dataset --format yolo
```

**Expected output:**
- Images with bounding boxes drawn
- Class labels displayed
- Console statistics

---

### **Step 11: Visualize with HTML Tool**

```bash
# Open in browser
explorer Front-End/yolo-visualizer.html
```

Or just drag `yolo-visualizer.html` into your browser.

**Steps in visualizer:**
1. Click "📂 Select Dataset Folder"
2. Choose `yolo_dataset/images/` folder
3. Navigate frames with ⬅️ ➡️ or keyboard arrows
4. Check statistics panel for detection counts

---

## 🔍 What to Check During Testing

### ✅ Component Initialization
- [ ] Console shows initialization messages
- [ ] No errors in console
- [ ] Component schema loaded

### ✅ Entity Detection
- [ ] Only detectable entities captured (Car, Pole, etc.)
- [ ] Primitives (Box, Sphere) are ignored
- [ ] Class IDs match yolo_class_mapping.json

### ✅ Bounding Boxes
- [ ] Boxes tightly fit objects
- [ ] Normalized coordinates (0-1 range)
- [ ] No negative values
- [ ] Center points are inside image bounds

### ✅ Occlusion Handling
- [ ] Objects behind walls are not detected
- [ ] Partially visible objects are included
- [ ] Objects behind camera are excluded

### ✅ File Output
- [ ] Images are 16:9 aspect ratio
- [ ] YOLO .txt files have correct format
- [ ] JSON files have complete metadata
- [ ] Frame numbers match across all three files

### ✅ Visualization
- [ ] Python tool draws boxes correctly
- [ ] HTML tool shows all frames
- [ ] Class labels are readable
- [ ] Statistics match expectations

---

## 🎯 Expected Results

### **Good Dataset Indicators:**

✅ **Tight Bounding Boxes**: Boxes closely fit the object edges  
✅ **No Empty Frames**: Every screenshot has at least 1 detection  
✅ **Variety**: Multiple viewing angles and distances  
✅ **Clean Labels**: Class names match object types  
✅ **No Occlusions**: Hidden objects are not annotated  

### **Common Issues:**

❌ **Loose Boxes**: Object too far or too close  
❌ **Missing Detections**: Entity not in DETECTABLE_MODELS  
❌ **Wrong Class**: Entity name doesn't match yolo_class_mapping.json  
❌ **Floating Boxes**: Occluded objects incorrectly detected  

---

## 🛠️ Troubleshooting

### **No Console Messages**

```typescript
// Check import in Researcher.tsx
import "../../AFrameComponents/YoloDatasetGenerator";
```

### **No Files Downloaded**

1. Check browser download permissions
2. Look in default download folder
3. Check console for errors

### **Wrong Entity Names**

Entity names must match:
- `modelsDeclare.ts` → Entity name (e.g., "Car", "Pole")
- `yolo_class_mapping.json` → Class mapping

### **Empty Detections**

Possible causes:
1. Entities are behind camera (look forward)
2. Entities are occluded (move closer)
3. Entities are too small (move closer)
4. Entity names don't match class mapping

### **Bounding Box Issues**

1. Check camera FOV (default: 80 degrees)
2. Verify entity has 3D geometry (not just empty node)
3. Check scale is reasonable

---

## 📊 Performance Tips

### **Adjust Capture Rate**

```typescript
// Faster captures (every 30 frames = ~0.5 sec)
yolo-dataset-generator="captureInterval: 30"

// Slower captures (every 120 frames = ~2 sec)
yolo-dataset-generator="captureInterval: 120"
```

### **Reduce Output**

```typescript
// Only YOLO format (no JSON)
yolo-dataset-generator="outputFormat: yolo"

// Only JSON format (no YOLO)
yolo-dataset-generator="outputFormat: json"
```

### **Disable During Navigation**

```typescript
// Temporarily disable
yolo-dataset-generator="enabled: false"
```

---

## 🎓 Dataset Best Practices

### **Capture Strategy**

1. **Multiple Angles**: Walk around objects (360°)
2. **Multiple Distances**: Close, medium, far
3. **Multiple Heights**: Ground level, eye level, elevated
4. **Occlusion Variations**: Some partial occlusions OK
5. **Lighting**: Different times/positions (if dynamic lighting)

### **Quantity Guidelines**

- **Minimum**: 100 frames per class
- **Recommended**: 500-1000 frames per class
- **Production**: 5000+ frames per class

### **Quality Over Quantity**

Better to have:
- 500 perfect annotations
- Than 5000 mediocre annotations

---

## 🚀 Next Steps After Testing

Once you've verified the dataset:

1. **Train YOLO Model**:
   ```bash
   yolo train data=dataset.yaml model=yolov8n.pt epochs=100
   ```

2. **Validate Results**:
   ```bash
   yolo val model=runs/detect/train/weights/best.pt data=dataset.yaml
   ```

3. **Deploy Model**:
   - Use in FastAPI backend
   - Real-time detection on mobile
   - Integrate with navigation pipeline

---

## 📞 Support

If issues persist:

1. Check [YOLO_INTEGRATION_FINAL.md](YOLO_INTEGRATION_FINAL.md) for complete documentation
2. Review [YOLO_ARCHITECTURE.md](YOLO_ARCHITECTURE.md) for system design
3. Read [YOLO_DATASET_GENERATOR_README.md](YOLO_DATASET_GENERATOR_README.md) for technical details

---

**🎉 Happy Dataset Generation!**
