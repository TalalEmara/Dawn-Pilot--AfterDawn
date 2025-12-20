# Architecture Analysis & Recommendations
**Date**: December 20, 2025  
**Focus**: Frontend-Backend WebSocket Communication for Phosphene Processing

---

## 📋 Current State

### Frontend (React + A-Frame)
- **Location**: `Front-End/Main-Main-App/DawnPilotFrontEnd/src/pages/MobileViewer/MobileViewer.tsx`
- **Technology**: Socket.io client
- **What it does**:
  - Captures RGB frames from A-Frame WebGL renderer
  - Converts to JPEG blob (quality 0.7)
  - Emits via `socket.emit('input_frame', blob)`
  - Listens for `socket.on('video_frame', arrayBuffer)`
  - Renders received phosphene images to canvas

### Backend (FastAPI)
- **Location**: `Back-End/fast_api/api/websocket_routes.py`
- **Technology**: Native FastAPI WebSocket
- **What it does**:
  - Endpoint: `/ws/process`
  - Expects JSON: `{"frame": "base64", "frame_id": "...", "params": {...}}`
  - Processes through detector + translator
  - Returns JSON: `{"phosphene_image": "base64", "detections": [...], ...}`

---

## 🚨 **CRITICAL ISSUES**

### Issue #1: Protocol Mismatch
- **Frontend**: Socket.io (uses polling + WebSocket with custom framing)
- **Backend**: Native WebSocket (raw WebSocket protocol)
- **Impact**: Cannot communicate - completely incompatible protocols

### Issue #2: Missing Depth Data
- **Frontend**: Captures depth buffer but doesn't send it
- **Backend**: Navigation pipeline needs both RGB + depth
- **Current**: Only RGB is sent
- **Required for**: Object distance calculation, freepath detection, occupancy mapping

### Issue #3: Data Format Inconsistency
- **Frontend sends**: Binary blob (JPEG)
- **Backend expects**: JSON with base64-encoded string
- **Impact**: Backend can't parse incoming messages

---

## ✅ **RECOMMENDED SOLUTION**

### Option A: Native WebSocket (Recommended)
**Why**: Simpler, lower overhead, works with existing FastAPI backend

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
**No changes needed!** Current implementation already supports this.

---

### Option B: Socket.io on Both Sides
**Why**: If you want Socket.io features (automatic reconnection, rooms, etc.)

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

---

## 🎯 **PROPOSED ARCHITECTURE**

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  Capture   ┌──────────────┐  Convert  ┌─────┐│
│  │  A-Frame    │  ───────>  │  RGB Frame   │  ──────>  │ JPG ││
│  │  Renderer   │            │  640x480     │           │Blob ││
│  └─────────────┘            └──────────────┘           └─────┘│
│                                                                 │
│  ┌─────────────┐  Capture   ┌──────────────┐  Convert  ┌─────┐│
│  │  Depth      │  ───────>  │ Depth Buffer │  ──────>  │ JPG ││
│  │  Shader     │            │  640x480     │           │Blob ││
│  └─────────────┘            └──────────────┘           └─────┘│
│                                                                 │
│                        ▼ Encode to Base64                      │
│                                                                 │
│         WebSocket.send(JSON.stringify({                        │
│           rgb: "base64...",                                    │
│           depth: "base64...",                                  │
│           frame_id: 42                                         │
│         }))                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   │ WebSocket
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI + Python)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Receive JSON message                                       │
│     ▼                                                           │
│  2. Decode base64 → RGB array (H, W, 3)                       │
│     Decode base64 → Depth array (H, W)                        │
│     ▼                                                           │
│  3. YOLOv8 Detection (detect objects in RGB)                   │
│     ▼                                                           │
│  4. Assign depths to detections (using depth map)              │
│     ▼                                                           │
│  5. Navigation Pipeline                                        │
│     - Freepath detection                                       │
│     - Occupancy mapping                                        │
│     ▼                                                           │
│  6. Phosphene Translation (Pipeline2)                          │
│     - Select important objects                                 │
│     - Generate stimulation amplitudes                          │
│     - Simulate phosphene vision                                │
│     ▼                                                           │
│  7. Encode phosphene image → Base64                            │
│     ▼                                                           │
│  8. WebSocket.send(JSON.stringify({                            │
│       frame_id: 42,                                            │
│       phosphene_image: "base64...",                            │
│       detections: [...],                                       │
│       freepath_circle: {...}                                   │
│     }))                                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   │ WebSocket
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Receive JSON message                                       │
│     ▼                                                           │
│  2. Decode base64 → Blob                                       │
│     ▼                                                           │
│  3. Create Image URL                                           │
│     ▼                                                           │
│  4. Draw to Canvas                                             │
│     ▼                                                           │
│  5. A-Frame texture update (phosphene overlay)                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 **IMPLEMENTATION CHECKLIST**

### Phase 1: Fix Protocol (Critical)
- [ ] Replace Socket.io with native WebSocket in frontend
- [ ] Test basic connection and message exchange
- [ ] Verify JSON parsing on both ends

### Phase 2: Add Depth Capture
- [ ] Extend `useFrameBuffer` to return both RGB + depth blobs
- [ ] Update `pixelsToBlob` to handle depth buffer
- [ ] Test depth capture quality

### Phase 3: Update Backend
- [ ] Use `/ws/navigation-phosphene` endpoint (already exists!)
- [ ] Verify RGB + depth decoding
- [ ] Test full pipeline with real frames

### Phase 4: Optimize
- [ ] Tune JPEG quality (currently 0.7)
- [ ] Add frame dropping for slow processing
- [ ] Implement client-side FPS limiting

---

## 🔍 **EXISTING CODE THAT WORKS**

### Backend Navigation Pipeline
**File**: `Back-End/fast_api/api/nav_phosphene_ws.py`
- ✅ Already handles RGB + depth
- ✅ Supports multiple stages: detector, translator, pre_phosphene, phosphene
- ✅ Returns JSON with phosphene image

### Example HTML Test Client
**File**: `Back-End/fast_api/static/navigation_phosphene_test.html`
- ✅ Shows how to properly use the WebSocket endpoint
- ✅ Sends RGB + depth as base64
- ✅ Receives and displays results

---

## 🎨 **IMAGE FORMAT RECOMMENDATIONS**

### Current: JPG for RGB + Depth
**Pros**:
- ✅ Small file size (~30-50KB per frame)
- ✅ Fast encoding/decoding
- ✅ Good compression for natural images (RGB)

**Cons**:
- ❌ Lossy compression - bad for depth precision
- ❌ Depth data loses accuracy (critical for distance measurements)

### Recommended: JPG for RGB, PNG for Depth
**Why**:
- RGB: Use JPG (quality 0.7-0.8) - visual quality is fine
- Depth: Use PNG - lossless, preserves exact depth values

**Implementation**:
```typescript
// RGB as JPEG (lossy OK)
const rgbBlob = await canvas.toBlob(blob => blob, 'image/jpeg', 0.75);

// Depth as PNG (lossless required)
const depthBlob = await depthCanvas.toBlob(blob => blob, 'image/png');
```

### Alternative: Raw Binary for Depth
**Best performance** but requires custom encoding:
```typescript
// Send depth as raw Float32Array or Uint16Array
const depthArray = new Float32Array(width * height);
// ... fill with depth values ...
const depthBytes = depthArray.buffer;

ws.send(JSON.stringify({
  rgb: rgbBase64,
  depth: arrayBufferToBase64(depthBytes),
  depth_format: 'float32',
  width: width,
  height: height
}));
```

---

## 🚀 **NEXT STEPS**

1. **Immediate**: Fix protocol mismatch (Option A recommended)
2. **Short-term**: Add depth capture and transmission
3. **Long-term**: Optimize compression and streaming performance

---

## 📚 **RELEVANT FILES**

### Frontend:
- `src/pages/MobileViewer/MobileViewer.tsx` - Main viewer
- `src/hooks/useFrameBuffer.ts` - Frame capture logic
- `src/hooks/useBinaryStream.ts` - Receive phosphene images
- `src/config.ts` - Server configuration

### Backend:
- `Back-End/fast_api/main.py` - FastAPI app entry
- `Back-End/fast_api/api/websocket_routes.py` - WebSocket handler
- `Back-End/fast_api/api/nav_phosphene_ws.py` - Navigation + phosphene pipeline
- `Back-End/fast_api/services/navigation_detector.py` - Full pipeline implementation

### Documentation:
- `Back-End/fast_api/WEBSOCKET_API_USAGE.md` - API protocol
- `Back-End/fast_api/NAVIGATION_WEBSOCKET_README.md` - Navigation pipeline docs
