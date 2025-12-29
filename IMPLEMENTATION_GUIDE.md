# Dawn Pilot - Implementation Guide

This document consolidates all current implementation details for the Dawn Pilot project, focusing on active code and recent developments. It replaces scattered documentation files for better maintainability.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Communication](#architecture--communication)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Implementation](#frontend-implementation)
5. [Experiment Manager API](#experiment-manager-api)
6. [Performance Optimizations](#performance-optimizations)
7. [Quick Start Guides](#quick-start-guides)

---

## Project Overview

Dawn Pilot is a web platform for building and managing VR experiments for bionic eye systems. It allows researchers to create scenarios and analyze subject performance.

### Naming Conventions

#### Folder Names
- Start each word with a capital letter
- Replace spaces with dashes
- Example: `Data-Models`

#### Back-End Files
- Use `api_Main` style (snake + Pascal hybrid)
- Example: `api_Experiment.ts`

#### Front-End Files (React)
- Components: Start with capital letter (`MyComponent.tsx`)
- Custom Hooks: Use `useHook` PascalCase style (`useFetchData.ts`)

---

## Architecture & Communication

### Current State Analysis

**Frontend (React + A-Frame):**
- Location: `Front-End/Main-Main-App/DawnPilotFrontEnd/src/pages/MobileViewer/MobileViewer.tsx`
- Technology: Socket.io client
- Captures RGB frames from A-Frame WebGL renderer
- Converts to JPEG blob (quality 0.7)
- Sends via `socket.emit('input_frame', blob)`
- Receives phosphene images via `socket.on('video_frame', arrayBuffer)`

**Backend (FastAPI):**
- Location: `Back-End/fast_api/api/websocket_routes.py`
- Technology: Native FastAPI WebSocket
- Endpoint: `/ws/process`
- Expects JSON: `{"frame": "base64", "frame_id": "...", "params": {...}}`
- Processes through detector + translator
- Returns JSON: `{"phosphene_image": "base64", "detections": [...], ...}`

### Critical Issues Identified

1. **Protocol Mismatch**: Frontend uses Socket.io, backend uses native WebSocket - incompatible protocols
2. **Missing Depth Data**: Frontend captures depth but doesn't send it; navigation needs RGB + depth
3. **Data Format Inconsistency**: Frontend sends binary blob, backend expects base64 JSON

### Recommended Solution: Native WebSocket

#### Frontend Changes:
```typescript
// Replace Socket.io with native WebSocket
const ws = new WebSocket(`ws://${SERVER_IP}:8000/ws/process`);

// Convert frame + depth to base64 and send as JSON
const sendFrame = async (rgbBlob: Blob, depthBlob: Blob, frameId: number) => {
  const rgbBase64 = await blobToBase64(rgbBlob);
  const depthBase64 = await blobToBase64(depthBlob);
  
  ws.send(JSON.stringify({
    type: "frame",
    frame_id: frameId,
    rgb: rgbBase64,
    depth: depthBase64,
    params: {
      t_min: 0.3,
      k_min: 1,
      k_max: 5
    }
  }));
};

// Receive phosphene images
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.phosphene_image) {
    // Convert base64 to blob and display
    displayPhospheneImage(data.phosphene_image);
  }
};
```

#### Backend Changes:
No changes needed - current implementation already supports this.

### Alternative: Socket.io on Both Sides

If Socket.io features are needed (reconnection, rooms):

#### Frontend Changes:
```typescript
// Add depth capture to existing code
const { rgb: rgbBlob, depth: depthBlob } = await captureFrame();

socket.emit('process_frame', {
  rgb: await blobToBase64(rgbBlob),
  depth: await blobToBase64(depthBlob),
  frame_id: frameCounter++
});
```

#### Backend Changes:
```python
# Install: pip install python-socketio
import socketio

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio)

@sio.on('process_frame')
async def handle_frame(sid, data):
    rgb_base64 = data['rgb']
    depth_base64 = data['depth']
    
    # Process...
    result = await process_pipeline(rgb_base64, depth_base64)
    
    # Send back phosphene image
    await sio.emit('phosphene_result', {
        'frame_id': data['frame_id'],
        'phosphene_image': result['phosphene_image'],
        'detections': result['detections']
    }, room=sid)

# Mount to FastAPI
app.mount('/', socket_app)
```

### Image Format Recommendations

- **RGB**: Use JPG (quality 0.7-0.8) for visual quality
- **Depth**: Use PNG for lossless depth precision
- Avoid lossy compression on depth data for accurate distance measurements

### Existing Working Code

- Backend navigation pipeline: `Back-End/fast_api/api/nav_phosphene_ws.py`
- Test client: `Back-End/fast_api/static/navigation_phosphene_test.html`

---

## Backend Implementation

### Project Structure

```
fast_api/
├── main.py                          ⭐ Clean entry point (85 lines)
├── phosphene_api.py                 ⚠️  DEPRECATED: Old monolithic file
├── requirements.txt
├── move_files.py                    🔧 File reorganization script
├── api/                             🌐 API Layer
│   ├── __init__.py
│   └── routes.py                       All endpoint definitions (~800 lines)
├── models/                          📋 Data Models
│   ├── __init__.py
│   ├── request_models.py               Request validation models
│   └── response_models.py              Response models
├── services/                        ⚙️  Business Logic
│   ├── __init__.py
│   ├── detector_service.py             Object detection service
│   └── translator_service.py           Phosphene translation service
├── core/                            🔧 Core Utilities
│   ├── __init__.py
│   ├── image_utils.py                  Image encode/decode, debug saving
│   ├── depth_utils.py                  Depth processing & assignment
│   └── cleanup.py                      Background file cleanup
├── detection/                       🔍 Detection Module
│   ├── __init__.py
│   ├── realtime_detector.py            YOLO & Faster R-CNN detector
│   └── mock_detector.py                Mock detector for testing
├── translation/                     🎨 Translation Module
│   ├── __init__.py
│   ├── translator.py                   Phosphene translator
│   ├── Pipeline2Integration.py         Pipeline2 neural network
│   └── utils/                          Translation utilities
├── config/                          ⚙️  Configuration
│   └── detector_config.json            Detector configuration
├── docs/                            📚 Documentation
├── tests/                           🧪 Tests
├── scripts/                         🔧 Utility Scripts
├── api_output/                      📤 Generated Files
├── dummy_data/                      📊 Test Data
├── realtime_output/                 Output directory
└── __pycache__/                     Python cache
```

### Module Dependencies

```
main.py
  ├─> api.router
  │     └─> models.*
  │     └─> core.*
  │     └─> (services via set_services)
  │
  └─> services.DetectorService
        └─> detection.create_detector
        └─> detection.create_mock_detector
        └─> config/detector_config.json
  
  └─> services.TranslatorService
        └─> translation.Translator
        └─> translation.Pipeline2Integration
```

### API Routes Structure

FastAPI App includes:
- GET `/`
- GET `/api/health`
- POST `/api/detect`
- POST `/api/translate`
- POST `/api/process`
- POST `/api/upload-image`
- POST `/api/process-url`
- POST `/api/process-with-depth`
- POST `/api/upload-with-depth`
- POST `/api/configure`

### Data Flow

```
Client → API Routes → Core Processing → DetectorService & TranslatorService → Response
```

### Import Examples

**Old (Deprecated):**
```python
from phosphene_api import DetectorService
```

**New (Current):**
```python
from services import DetectorService, TranslatorService
from models import ProcessRequest, ProcessResponse
from core import decode_base64_image, assign_depth_to_detections
```

### Running the API

#### Direct (Recommended)
```bash
cd fast_api
python main.py
```

#### With Scripts
```bash
# Windows
cd fast_api
scripts\start_api.bat

# Linux/Mac
cd fast_api
chmod +x scripts/start_api.sh
./scripts/start_api.sh
```

#### Testing
```bash
# Health check
curl http://localhost:8000/api/health

# Process image
curl -X POST http://localhost:8000/api/process \
  -H "Content-Type: application/json" \
  -d '{"image_base64": "..."}'
```

### Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `main.py` | Application entry point | 85 |
| `api/routes.py` | All API endpoints | ~800 |
| `services/detector_service.py` | Detection logic | ~230 |
| `services/translator_service.py` | Translation logic | ~330 |
| `models/request_models.py` | Request schemas | ~55 |
| `models/response_models.py` | Response schemas | ~50 |
| `core/image_utils.py` | Image utilities | ~150 |
| `core/depth_utils.py` | Depth utilities | ~150 |

### Benefits

✅ **Organized** - Clear folder structure  
✅ **Maintainable** - Easy to find and update code  
✅ **Testable** - Independent module testing  
✅ **Scalable** - Easy to add features  
✅ **Documented** - Comprehensive docs  
✅ **Backward Compatible** - Old code still works  

---

## Frontend Implementation

### Refactored Architecture

The frontend follows the **Single Responsibility Principle** using custom React hooks. Each hook manages one specific concern.

#### File Structure
```
src/
├── hooks/
│   ├── useScenarioWorld.ts      # World state management
│   ├── useEntityManager.ts      # Entity CRUD operations
│   ├── useComponentManager.ts   # Component operations
│   ├── useModelLibrary.ts       # Model definitions
│   └── useAFrameSync.ts         # A-Frame scene synchronization
├── contexts/
│   └── ScenarioContext.tsx      # Global state context
├── pages/
│   └── BuilderPage.tsx          # Main page (orchestrator)
└── components/
    └── BuilderSidePanel.tsx     # UI component
```

### Hook Responsibilities

#### 1. useScenarioWorld
- Manages world-level state and operations
- Loads entire scenario world from backend
- Creates new empty worlds
- API: `GET /scenario-world`, `POST /scenario-worlds`

#### 2. useEntityManager
- Handles entity CRUD operations
- Creates entities from model templates
- Deletes entities by ID
- API: `POST /entities/from-model`, `DELETE /entities/:id`, etc.

#### 3. useComponentManager
- Manages component-level operations
- Updates components (immediate or debounced)
- Provides debouncing for frequent updates (dragging)

#### 4. useModelLibrary
- Fetches and manages model definitions
- Loads available model templates
- API: `GET /models`

#### 5. useAFrameSync
- Synchronizes A-Frame scene with backend
- Maps A-Frame indices to backend entity IDs
- Watches for component changes

### Data Flow

#### Entity Creation Flow
```
User clicks "Add Car" → BuilderSidePanel → useEntityManager → POST /entities/from-model → Backend → Hook reloads world → UI updates
```

#### Component Update Flow (Interactive Editing)
```
User drags entity → A-Frame event → useAFrameSync → Maps to entity ID → useComponentManager → PUT /entities/:id/components → Backend
```

### Component Mapping

A-Frame ↔ Backend component names:
```javascript
{
  'position' → 'Position',
  'rotation' → 'Rotation',
  'scale' → 'Scale',
  'color' → 'Color'
}
```

### Context Pattern

**ScenarioContext** provides global access to world state, model library, and CRUD operations to avoid prop drilling.

### Benefits

- **Before**: BuilderPage 200+ lines, mixed concerns
- **After**: BuilderPage ~100 lines, each hook 50-150 lines with single responsibility
- Easy testing, reusability, clear separation of concerns

---

## Experiment Manager API

### Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/world` | Get current world state |
| POST | `/api/world/cube` | Add a new cube |
| PUT | `/api/world/cube/:cube_id` | Update existing cube |
| DELETE | `/api/world/cube/:id` | Remove a cube |
| POST | `/api/world/save` | Save world to file |
| POST | `/api/world/reload` | Reload world from file |

### Getting Started

1. Import `postman-collection.json` into Postman
2. Start server: `cd Back-End/Experiment-Manager && pnpm run dev`
3. Server runs at `http://localhost:5000`

### Mock Data Examples

#### Basic Cube
```json
{
  "position": { "x": 0, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "color": "#FF0000"
}
```

#### Advanced: 3x3 Grid, Stacked Tower, Rainbow Circle
See original API-TESTING.md for complete examples.

### Testing Workflow

1. Get initial state: `GET /api/world`
2. Add cubes: `POST /api/world/cube`
3. Update cube: `PUT /api/world/cube/{id}`
4. Save world: `POST /api/world/save`
5. Delete cube: `DELETE /api/world/cube/{id}`
6. Reload: `POST /api/world/reload`

### Quick cURL Commands

```bash
# Get world
curl http://localhost:5000/api/world

# Add cube
curl -X POST http://localhost:5000/api/world/cube \
  -H "Content-Type: application/json" \
  -d '{"position":{"x":0,"y":0,"z":0},"rotation":{"x":0,"y":0,"z":0},"color":"#FF0000"}'

# Update cube
curl -X PUT http://localhost:5000/api/world/cube/cube_1 \
  -H "Content-Type: application/json" \
  -d '{"position":{"x":5,"y":5,"z":5},"rotation":{"x":45,"y":45,"z":45},"color":"#00FF00"}'

# Delete cube
curl -X DELETE http://localhost:5000/api/world/cube/cube_1

# Save world
curl -X POST http://localhost:5000/api/world/save

# Reload world
curl -X POST http://localhost:5000/api/world/reload
```

### Notes

- Cube IDs auto-generated as `cube_{timestamp}`
- World state persists to `Scenario-Builder/world-state.json`
- Position: x (left/right), y (up/down), z (forward/back)
- Rotation in degrees: x (pitch), y (yaw), z (roll)
- Color: Hex format (e.g., `#FF0000`)

---

## Performance Optimizations

### Parallel Processing Implementation

Successfully implemented parallel execution of object detection and freepath detection in the navigation pipeline.

#### Changes Made

Modified `services/navigation_detector_service.py`:
- Uses `concurrent.futures.ThreadPoolExecutor` with 2 workers
- Object detection and freepath detection run simultaneously
- Added `parallel_total_ms` to stats tracking

#### Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Object Detection | 500ms | 500ms | (same) |
| Freepath Detection | 150ms | 150ms | (same) |
| **Total Execution** | **650ms** | **~500ms** | **~30% faster** |
| **FPS** | **1.5** | **~2.0** | **+0.5 fps** |

#### Why It Works

1. **Independent Operations**: Detection and freepath don't depend on each other
2. **GIL Release**: PyTorch releases Python's Global Interpreter Lock
3. **GPU Concurrency**: Modern GPUs can run multiple operations simultaneously

#### Testing

WebSocket message:
```json
{
  "rgb": "<base64_encoded_image>",
  "depth": "<base64_encoded_depth>",
  "frame_id": 0,
  "debug": true
}
```

Expected response stats:
```json
{
  "stats": {
    "detection_time_ms": 503.24,
    "freepath_time_ms": 148.67,
    "parallel_total_ms": 508.45,
    "num_detections": 3,
    "freepath_points": 45,
    "has_freepath_circle": true
  }
}
```

### Roadmap to 10 FPS

Current: 2 FPS (500ms/frame) → Target: 10 FPS (100ms/frame) = 5x speedup needed

#### Step 1: Smart Crop + Resize
- Adaptive ROI-based cropping to avoid losing important content
- Resize to 128x128 preserving key elements

#### Step 2: TensorRT Optimization
- Convert PyTorch → ONNX → TensorRT Engine
- Expected: 500ms → 200ms (2.5x speedup) → ~5 FPS
- Hardware: NVIDIA GTX 1650 (Compute Capability 7.5)

#### Step 3: INT8 Quantization
- Quantize models to INT8 precision
- Expected: 200ms → 100ms (2x speedup) → **10 FPS achieved**
- Trade-off: slight accuracy loss for 2x speed

### Quick Start Testing

```bash
cd Back-End/fast_api
python main.py
# Then run test script
python test_parallel.py
```

Expected output:
```
⚡ PARALLEL PROCESSING STATS:
  Object detection:   503.24ms
  Freepath detection: 148.67ms
  ─────────────────────────────
  Sequential (sum):   651.91ms
  Parallel (actual):  508.45ms
  ─────────────────────────────
  Speedup: 1.28x (28.2% faster)
```

---

## Quick Start Guides

### Backend API Quick Start

#### What Changed
The phosphene API has been cleaned up and organized into a modular structure.

#### Good News
- All API endpoints work exactly the same
- No breaking changes to functionality
- Old `phosphene_api.py` still works (but use `main.py` instead)

#### New Structure
```
fast_api/
├── main.py              ⭐ Use this instead of phosphene_api.py
├── api/                 🌐 API routes
├── models/              📋 Request/response models
├── services/            ⚙️  Business logic
├── core/                🔧 Utilities
├── detection/           🔍 Detection modules
├── translation/         🎨 Translation modules
├── config/              ⚙️  Configuration
├── docs/                📚 Documentation
├── tests/               🧪 Tests
└── scripts/             🔧 Utility scripts
```

#### Running
```bash
cd fast_api
python main.py
```

#### Testing
```bash
# Test imports
python -c "from api import router; from models import ProcessRequest; print('✅ OK')"

# Health check
curl http://localhost:8000/api/health
```

#### For Developers
**Old imports (don't use):**
```python
from phosphene_api import DetectorService
```

**New imports (use these):**
```python
from services import DetectorService, TranslatorService
from models import ProcessRequest, ProcessResponse
from core import decode_base64_image, assign_depth_to_detections
```

### Navigation-Phosphene Optimizations

#### Production Endpoint
WebSocket URL: `ws://localhost:8000/ws/navigation-phosphene`

Send message:
```json
{
    "type": "frame",
    "frame_id": "001",
    "rgb": "<base64_image>",
    "depth": "<base64_image>",
    "stage": "phosphene",
    "debug": false
}
```

Stages: `detector`, `translator`, `pre_phosphene`, `phosphene`

#### Testing
1. Start server: `python main.py`
2. Open: `http://localhost:8000/static/navigation_phosphene_test.html`
3. Load test images from `dummy_data/synthetic/`
4. Enable debug for intermediate outputs

#### Performance
- Before: ~70-100ms transformation overhead
- After: ~15-25ms transformation overhead
- Improvement: 30-50% faster

#### Color Space
- Throughout pipeline: RGB
- Only convert to BGR for debug saves & final encode

#### Debug Mode
Set `"debug": true` to save intermediate images to `api_output/debug_output/`

---

*This document consolidates current implementation details as of December 2025. For historical refactoring details, see archived documentation.*