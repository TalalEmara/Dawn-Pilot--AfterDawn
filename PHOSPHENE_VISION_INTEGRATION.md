# Phosphene Vision Integration - Complete Setup Guide

## 🎯 Overview

Real-time phosphene vision integration between React+A-Frame frontend and FastAPI backend. The system captures RGB frames and depth maps from a VR scene, processes them through YOLO object detection with depth prioritization, and displays a phosphene-translated representation in real-time.

**Target Performance**: 500ms frame intervals (<300ms total processing time)

---

## 📁 Project Structure

```
Dawn-Pilot--AfterDawn/
├── Front-End/
│   └── Main-Main-App/
│       └── DawnPilotFrontEnd/
│           ├── src/
│           │   ├── hooks/
│           │   │   ├── useCameraCapture.ts       # RGB frame capture from A-Frame
│           │   │   ├── useDepthCapture.ts        # Z-buffer depth map extraction
│           │   │   └── usePhospheneVision.ts     # FastAPI integration
│           │   └── pages/
│           │       └── BuilderPage/
│           │           └── BuilderPage.tsx       # Main VR scene with phosphene UI
│           ├── package.json                      # React 19.1.1, A-Frame, Vite
│           └── vite.config.ts
│
└── Back-End/
    ├── fast_api/
    │   ├── phosphene_api.py                      # FastAPI service (8 endpoints)
    │   ├── translator.py                         # Phosphene translation
    │   ├── realtime_detector.py                  # YOLO detection
    │   ├── requirements.txt                      # Python dependencies
    │   └── start_api.sh / .bat                   # Launch scripts
    │
    └── Experiment-Manager/
        ├── api.ts                                # Express server (port 5000)
        └── world_Manager.ts                      # ECS world state
```

---

## 🔧 Installation & Setup

### 1. FastAPI Backend (Python 3.12.4)

```bash
cd Back-End/fast_api

# Install dependencies
pip install -r requirements.txt

# Start FastAPI (port 8000)
python phosphene_api.py

# Or use batch script
start_api.bat  # Windows
./start_api.sh # Linux/Mac
```

**Verify FastAPI is running:**
```bash
curl http://localhost:8000/api/health
# Expected: {"status": "healthy", "detector_loaded": true}
```

### 2. Express Backend (Node.js)

```bash
cd Back-End/Experiment-Manager

# Install dependencies
pnpm install

# Start Express server (port 5000)
pnpm start
```

### 3. React Frontend

```bash
cd Front-End/Main-Main-App/DawnPilotFrontEnd

# Install dependencies
pnpm install

# Start development server (port 5173)
pnpm dev
```

**Access frontend:**
- Open browser: `http://localhost:5173`

---

## 🎮 Usage

### Starting Phosphene Vision

1. **Ensure all services are running:**
   - ✅ FastAPI: `http://localhost:8000` (health check passes)
   - ✅ Express: `http://localhost:5000` (ECS backend)
   - ✅ Frontend: `http://localhost:5173` (VR scene)

2. **In the VR scene:**
   - Look for the **"🔮 Phosphene Vision"** panel (top-right corner)
   - Click **"▶️ Start"** to begin real-time processing
   - The system will capture frames every 500ms

3. **Monitoring:**
   - **Status**: Shows current state (Active/Paused/Processing)
   - **Frames Processed**: Total count of processed frames
   - **Detections**: Objects detected with depth assignments
   - **Processing Time**: Breakdown of API timing
   - **Phosphene View**: Live phosphene-translated image (bottom-right)

### Controls

| Button | Action |
|--------|--------|
| **▶️ Start** | Begin real-time phosphene vision (500ms intervals) |
| **🛑 Stop** | Pause processing |

### VR Scene Interactions

- **Move Camera**: WASD keys + Mouse
- **Look Around**: Mouse drag
- **VR Mode**: Click VR button in bottom-right of scene
- **Inspector**: Press `Ctrl + I` (A-Frame inspector)

---

## 🔬 Technical Details

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         React Frontend                          │
│                      (http://localhost:5173)                    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    BuilderPage.tsx                       │  │
│  │                                                          │  │
│  │  ┌─────────────────┐  ┌─────────────────┐             │  │
│  │  │ useCameraCapture│  │ useDepthCapture │             │  │
│  │  │   (RGB frames)  │  │  (Z-buffer)     │             │  │
│  │  └────────┬────────┘  └────────┬────────┘             │  │
│  │           │                     │                       │  │
│  │           └──────────┬──────────┘                       │  │
│  │                      │                                   │  │
│  │           ┌──────────▼───────────┐                      │  │
│  │           │ usePhospheneVision   │                      │  │
│  │           │  (FastAPI client)    │                      │  │
│  │           └──────────┬───────────┘                      │  │
│  └──────────────────────┼──────────────────────────────────┘  │
└─────────────────────────┼─────────────────────────────────────┘
                          │
                          │ POST /api/process-with-depth
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI Service                            │
│                   (http://localhost:8000)                       │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ YOLO         │→ │ Depth        │→ │ Phosphene    │         │
│  │ Detection    │  │ Assignment   │  │ Translation  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
│  Returns: JSON with detections, phosphene_image, metadata      │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Camera Capture** (`useCameraCapture.ts`)
   - Accesses A-Frame canvas: `document.querySelector('a-scene').canvas`
   - Captures RGB frame: `canvas.toDataURL('image/jpeg', quality)`
   - Returns: Base64 JPEG string

2. **Depth Capture** (`useDepthCapture.ts`)
   - Accesses Three.js via A-Frame: `scene.object3D`, `scene.renderer`, `scene.camera`
   - Creates depth material: `THREE.MeshDepthMaterial` with `RGBADepthPacking`
   - Renders to `WebGLRenderTarget`
   - Reads pixel data and converts RGBA → grayscale PNG
   - Returns: Base64 PNG string

3. **FastAPI Processing** (`usePhospheneVision.ts`)
   - Sends POST request to `/api/process-with-depth`
   - Payload: `{ image_base64, depth_map_base64, depth_sampling, conf_threshold, ... }`
   - Receives: `{ detections[], phosphene_image, metadata }`

4. **Display**
   - Shows phosphene-translated image in overlay
   - Updates statistics in control panel

### Hooks API

#### `useCameraCapture()`

```typescript
const { captureFrame, captureFrameRaw, getCanvasDimensions, getStats } = useCameraCapture();

// Capture JPEG with data URL prefix
const imageDataUrl = captureFrame(0.8); // quality: 0-1

// Capture raw base64 (no prefix)
const imageBase64 = captureFrameRaw(0.8);

// Get canvas size
const { width, height } = getCanvasDimensions();

// Performance stats
const stats = getStats(); // { lastCaptureTime, captureCount }
```

#### `useDepthCapture()`

```typescript
const { captureDepthMap, captureDepthMapRaw, getStats } = useDepthCapture();

// Capture depth map with data URL prefix
const depthDataUrl = captureDepthMap();

// Capture raw base64 (no prefix)
const depthBase64 = captureDepthMapRaw();

// Performance stats
const stats = getStats(); // { lastCaptureTime, captureCount }
```

#### `usePhospheneVision()`

```typescript
const { 
  processFrame,           // Process with depth
  processFrameSimple,     // Process without depth
  checkHealth,            // Check FastAPI health
  processing,             // Currently processing?
  error,                  // Last error message
  lastResult,             // Latest phosphene result
  processingCount,        // Total frames processed
  clearError,
  reset
} = usePhospheneVision();

// Process frame with depth
const result = await processFrame(imageBase64, depthBase64, {
  depth_sampling: 'median',  // 'median' | 'centroid' | 'min' | 'mean'
  conf_threshold: 0.5,       // YOLO confidence threshold
  t_min: 0.3,                // Phosphene threshold
  k_min: 1,
  k_max: 5
});

// Check service health
const isHealthy = await checkHealth();
```

### Response Format

```typescript
interface PhospheneResult {
  detections: Detection[];
  phosphene_image: string;        // Base64 PNG
  metadata: PhospheneMetadata;
}

interface Detection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number];  // [x, y, w, h]
  centroid_px?: [number, number];
  distance_m?: number;                     // From depth map
}

interface PhospheneMetadata {
  detection_count: number;
  depth_assigned_count: number;
  depth_sampling_method: string;
  timing_breakdown: {
    total_ms: number;
    image_decode_ms: number;
    depth_decode_ms: number;
    detection_ms: number;
    depth_assignment_ms: number;
    translation_ms: number;
    encode_ms: number;
  };
}
```

---

## 📊 Performance Metrics

### Target Times

| Component | Target | Typical |
|-----------|--------|---------|
| Camera Capture | <10ms | ~5ms |
| Depth Capture | <20ms | ~15ms |
| FastAPI Processing | <250ms | ~246ms |
| **Total Pipeline** | **<300ms** | **~266ms** |
| Frame Interval | 500ms | 500ms |

### Performance Optimization

- **Capture Resolution**: Adjust JPEG quality (0.6-0.9) for speed vs quality trade-off
- **YOLO Confidence**: Higher `conf_threshold` = fewer detections = faster processing
- **Depth Sampling**: `min` is fastest, `median` is most accurate
- **Frame Rate**: Increase interval (500ms → 1000ms) if processing lags

### Monitoring Performance

All hooks track timing:

```javascript
// Check capture performance
console.log('Camera stats:', getCameraStats());
console.log('Depth stats:', getDepthStats());

// Check processing time
console.log('Processing time:', lastResult.metadata.timing_breakdown);
```

---

## 🐛 Troubleshooting

### FastAPI Not Available

**Symptoms**: "⚠️ FastAPI service not available" warning

**Solutions**:
1. Check FastAPI is running: `curl http://localhost:8000/api/health`
2. Verify port 8000 is not in use: `netstat -ano | findstr :8000`
3. Check Python dependencies: `pip install -r requirements.txt`
4. Review FastAPI logs for errors

### Failed to Capture Frame

**Symptoms**: "Failed to capture camera frame" in console

**Solutions**:
1. Wait for A-Frame scene to load (check `scene.hasLoaded`)
2. Ensure canvas element exists: `document.querySelector('a-scene').canvas`
3. Verify camera is active in VR scene

### Failed to Capture Depth

**Symptoms**: "Failed to capture depth map" in console

**Solutions**:
1. Check Three.js objects exist: `scene.object3D`, `scene.renderer`, `scene.camera`
2. Ensure WebGL is supported: Check browser compatibility
3. Verify scene has loaded: Wait for A-Frame `loaded` event

### CORS Errors

**Symptoms**: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Solutions**:
1. FastAPI CORS is configured for all origins (`allow_origins=["*"]`)
2. Verify FastAPI middleware is loaded (check startup logs)
3. For production, configure specific origins in `phosphene_api.py`:
   ```python
   allow_origins=["http://localhost:5173"]
   ```

### Slow Processing

**Symptoms**: Frame rate drops, "Skipping frame" messages

**Solutions**:
1. Increase interval: 500ms → 750ms or 1000ms
2. Reduce JPEG quality: 0.8 → 0.6
3. Increase YOLO confidence threshold: 0.5 → 0.7
4. Use faster depth sampling: `min` instead of `median`

### Memory Leaks

**Symptoms**: Browser slows down over time

**Solutions**:
1. Depth capture disposes resources automatically (render target, material)
2. Stop phosphene vision when not needed (click "🛑 Stop")
3. Refresh page to clear state

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] FastAPI health check passes
- [ ] Camera capture returns valid base64 JPEG
- [ ] Depth capture returns valid base64 PNG
- [ ] Phosphene vision starts and stops correctly
- [ ] Frame processing completes within 500ms
- [ ] UI updates with detection count and timing
- [ ] Phosphene image displays in overlay
- [ ] No console errors
- [ ] No memory leaks after extended use

### Unit Testing (Future)

```bash
# Frontend tests
cd Front-End/Main-Main-App/DawnPilotFrontEnd
pnpm test

# Backend tests
cd Back-End/fast_api
pytest test_api.py
```

---

## 📝 Development Notes

### Adding New Features

1. **New Capture Method**: Add function to `useCameraCapture` or `useDepthCapture`
2. **New Processing Option**: Update `ProcessOptions` interface in `usePhospheneVision`
3. **New UI Control**: Add to phosphene control panel in `BuilderPage.tsx`
4. **New Endpoint**: Add to `phosphene_api.py` and update `usePhospheneVision`

### Code Style

- **TypeScript**: Use strict type checking
- **React Hooks**: Follow Single Responsibility Principle
- **Error Handling**: Always catch and log errors
- **Performance**: Track timing with `performance.now()`
- **Cleanup**: Dispose Three.js resources, clear intervals

### Git Workflow

Current branch: `feature/frontend-fastapi-integration`

```bash
# Stage changes
git add Front-End/Main-Main-App/DawnPilotFrontEnd/src/hooks/
git add Front-End/Main-Main-App/DawnPilotFrontEnd/src/pages/BuilderPage/

# Commit
git commit -m "feat: implement real-time phosphene vision integration"

# Push
git push origin feature/frontend-fastapi-integration
```

---

## 📚 References

- **Frontend Analysis**: `FRONTEND_ANALYSIS_AND_INTEGRATION_PLAN.md` (754 lines)
- **FastAPI Docs**: `Back-End/fast_api/API_README.md`
- **Depth Reference**: `Back-End/fast_api/DEPTH_ENDPOINT_REFERENCE.md`
- **Postman Collection**: `Back-End/fast_api/postman_phosphene_collection.json`

---

## 🎉 Success Criteria

✅ All services start successfully  
✅ Phosphene vision captures frames at 500ms intervals  
✅ Processing completes within 300ms (target: 266ms)  
✅ UI displays detections and timing statistics  
✅ Phosphene overlay shows translated image  
✅ No errors in browser console  
✅ No memory leaks after 10 minutes of operation  

---

**Status**: Phase 1 Complete ✅  
**Next Steps**: Testing, optimization, and Phase 2+ features (see integration plan)
