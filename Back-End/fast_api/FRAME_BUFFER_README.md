# Frame Buffer System - Real-Time WebSocket Processing

## Overview

The frame buffer system implements a **latest-frame strategy** to prevent backlog and latency buildup when the frontend sends frames faster than the backend can process them.

### Problem Solved
- **Frontend**: Sends frames at 10-15 fps (66-100ms per frame)
- **Backend**: Processes frames at ~5-6 fps (150-200ms per frame)
- **Gap**: ~9 frames/second would pile up without frame dropping

### Solution
- **Single-slot buffer**: Always keeps only the latest frame
- **Automatic dropping**: Old frames are overwritten before processing
- **Zero latency growth**: No queue buildup, always process newest data
- **Producer-Consumer pattern**: Receiving and processing happen concurrently

---

## Architecture

```
┌──────────────────┐           ┌─────────────────┐           ┌───────────────────┐
│  Frontend (VR)   │           │  Frame Buffer   │           │  Backend Pipeline │
│  10-15 fps       │           │  (Single Slot)  │           │  5-6 fps          │
└────────┬─────────┘           └────────┬────────┘           └─────────┬─────────┘
         │                              │                              │
         │ Frame 1                      │                              │
         ├─────────────────────────────►│                              │
         │ Frame 2                      │ Frame 1                      │
         ├─────────────────────────────►├─────────────────────────────►│
         │ Frame 3 (overwrites Frame 2) │                              │ Processing...
         ├─────────────────────────────►│                              │ (150-200ms)
         │ Frame 4 (overwrites Frame 3) │                              │
         ├─────────────────────────────►│                              │
         │                              │                              │ Result 1
         │                              │ Frame 4                      │◄───────────┐
         │                              ├─────────────────────────────►│            │
         │                              │                              │ Processing...
         │                              │                              │
         │◄────────────────────────────────────────────────────────────┘
```

**Key Points:**
- Frames 2 and 3 are dropped (overwritten) before processing
- Only Frames 1 and 4 get processed
- Frontend never blocks, keeps sending at max rate
- Backend processes at sustainable rate

### WebSocket Queue Draining

**Critical Optimization**: The WebSocket protocol has its own internal message queue. When frames arrive rapidly:
1. **Problem**: All frames queue up in WebSocket's receive buffer
2. **Solution**: Producer drains the queue and only processes the latest frame
3. **Implementation**: After receiving a frame, check if more are waiting (non-blocking poll)
4. **Result**: True real-time processing, skipping all but the absolute latest frame

**Metrics**:
- `websocket_drained`: Number of frames skipped from WebSocket queue
- `total_dropped`: Number of frames overwritten in our buffer
- **Total skipped** = websocket_drained + total_dropped

---

## Configuration

### File: `config/navigation_config.json`

```json
{
  "frame_buffer": {
    "enabled": true,
    "max_frame_age_ms": 1000.0,
    "metrics_interval_seconds": 30.0
  }
}
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enabled` | `true` | Enable buffered mode (false = synchronous blocking mode) |
| `max_frame_age_ms` | `1000.0` | Maximum age before frame is rejected as stale |
| `metrics_interval_seconds` | `30.0` | How often to log performance metrics |

---

## Modes

### 1. Buffered Mode (Default - Recommended)

**When to use**: Real-time navigation, VR applications

**Features**:
- Producer-consumer pattern
- Automatic frame dropping
- Zero latency growth
- Continuous metrics

**Enable**: Set `frame_buffer.enabled = true` in config

### 2. Synchronous Mode (Fallback)

**When to use**: Debugging, frame ordering critical

**Features**:
- Traditional blocking processing
- Processes every frame in order
- No frame dropping
- May build up latency

**Enable**: Set `frame_buffer.enabled = false` in config

---

## Metrics

Every 30 seconds (configurable), the system logs:

```
======================================================================
📊 FRAME BUFFER METRICS (last 30.0s)
======================================================================
  Received:       450 frames (15.00 fps)
  Processed:      180 frames ( 6.00 fps)
  Dropped:        270 frames (60.0%)
  Stale:            0 frames
  Efficiency:     40.0% processed
======================================================================
```

### Interpreting Metrics

- **Received fps**: How fast frontend is sending
- **Processed fps**: Actual backend throughput
- **Dropped %**: Frames overwritten before processing
  - `<50%`: Excellent, nearly keeping up
  - `50-70%`: Good, reasonable for real-time nav
  - `>70%`: Consider optimizing detector
- **Stale frames**: Frames older than `max_frame_age_ms` (should be 0)
- **Efficiency**: Percentage of frames successfully processed

---

## API Response Changes

### WebSocket Connection Response

```json
{
  "type": "connected",
  "message": "Navigation-Phosphene WebSocket ready",
  "service_ready": true,
  "frame_buffer_enabled": true
}
```

### Frame Processing Response (Buffered Mode)

```json
{
  "type": "result",
  "data": {
    "frame_id": "frame_0042",
    "stage": "phosphene",
    "success": true,
    "output_image": "data:image/png;base64,...",
    "detections": [...],
    "stats": {
      "detection": 103.5,
      "translator": 3.2,
      "phosphene": 15.1
    },
    "buffer_metrics": {
      "total_received": 42,
      "total_processed": 18,
      "total_dropped": 24,
      "drop_rate": 57.1,
      "websocket_drained": 150
    }
  }
}
```

**New field**: `buffer_metrics` provides real-time buffer status
- `websocket_drained`: Frames skipped from WebSocket queue (true real-time optimization)
- `total_dropped`: Frames overwritten in buffer before processing

---

## Performance Characteristics

### Before Frame Buffer (Synchronous)
```
Frame   | Send Time | Process Start | Response Time | Latency
--------|-----------|---------------|---------------|--------
Frame 1 | 0ms       | 0ms           | 150ms         | 150ms
Frame 2 | 66ms      | 150ms         | 300ms         | 234ms
Frame 3 | 132ms     | 300ms         | 450ms         | 318ms
Frame 4 | 198ms     | 450ms         | 600ms         | 402ms ❌ Growing!
```

### After Frame Buffer (Buffered)
```
Frame   | Send Time | Process Start | Response Time | Latency
--------|-----------|---------------|---------------|--------
Frame 1 | 0ms       | 0ms           | 150ms         | 150ms
Frame 2 | 66ms      | DROPPED       | -             | -
Frame 3 | 132ms     | 150ms         | 300ms         | 168ms ✅ Stable!
Frame 4 | 198ms     | DROPPED       | -             | -
Frame 5 | 264ms     | 300ms         | 450ms         | 186ms ✅ Stable!
```

**Key improvement**: Latency stays constant (~150-200ms) instead of growing unbounded

---

## Debugging

### Enable Verbose Logging

```python
import logging
logging.getLogger('core.frame_buffer').setLevel(logging.DEBUG)
```

Debug logs will show:
- `📥 Received frame X` - Frame added to buffer
- `⏭️  Dropped frame X` - Frame overwritten
- `✅ Processing frame X (age: Y ms)` - Frame taken for processing
- `⏰ Frame X is stale` - Frame too old, rejected

### Check Buffer Status

The `buffer_metrics` field in responses shows real-time stats:
```python
{
  "total_received": 100,
  "total_processed": 45,
  "total_dropped": 55,
  "drop_rate": 55.0
}
```

### Switch to Synchronous Mode

If you suspect buffer issues:
1. Set `frame_buffer.enabled = false` in config
2. Restart server
3. All frames will be processed in order (but with growing latency)

---

## Optimization Recommendations

If drop rate is too high (>70%), consider:

### 1. **Optimize Detector** (Best ROI)
- Current bottleneck: 103-300ms (variable)
- Target: <100ms consistent
- Options:
  - Lower input resolution (e.g., 640×480 → 416×416)
  - Model quantization (FP32 → FP16)
  - Higher confidence threshold (fewer detections = faster NMS)
  - Batch processing (if memory allows)

### 2. **Reduce Frontend FPS**
- Current: 10-15 fps
- Backend actual: 5-6 fps
- Option: Match frontend to 6-8 fps (reduce gap)

### 3. **Increase Buffer Size** (Not Recommended)
- Current: Single-slot (size=1)
- Could use size=2-3 for slight burst handling
- Trade-off: Introduces latency (up to 100-200ms)
- Not recommended for real-time navigation safety

---

## Troubleshooting

### Issue: High frame drop rate (>80%)

**Diagnosis**:
- Backend too slow for frontend rate
- Check `stats` field for slow pipeline stages

**Solutions**:
1. Optimize detector (see recommendations above)
2. Reduce frontend FPS
3. Check GPU utilization (should be >80%)

### Issue: Stale frames being rejected

**Diagnosis**:
- Frames sitting in buffer too long (>1000ms)
- Indicates severe performance issue

**Solutions**:
1. Lower `max_frame_age_ms` to catch earlier
2. Investigate why processing is so slow
3. Check for GPU memory issues

### Issue: Frames processed in wrong order

**Diagnosis**:
- This is expected in buffered mode!
- Frame 1, 5, 9 might be processed while 2-4, 6-8 are dropped

**Solutions**:
- If frame order critical, switch to synchronous mode
- For navigation, this is acceptable and desired behavior

---

## Testing

### Test with Client Script

```bash
# Run test client with monitoring
python test_ws_client.py
```

Watch for:
- Consistent processing FPS (~5-6 fps)
- Frame drops in metrics
- Response latency (~150-200ms)

### Manual Testing

1. Start backend:
   ```bash
   cd Back-End/fast_api
   python main.py
   ```

2. Check connection message:
   ```json
   {"frame_buffer_enabled": true}  // ✅ Buffered mode active
   ```

3. Send frames rapidly (15 fps)

4. Watch server logs every 30s for metrics

---

## Code Structure

```
Back-End/fast_api/
├── core/
│   └── frame_buffer.py           # Frame buffer implementation
├── api/
│   └── nav_phosphene_ws.py       # WebSocket handler with buffer integration
├── config/
│   └── navigation_config.json    # Configuration including frame_buffer settings
└── main.py                       # Service initialization and config loading
```

### Key Classes

- **`LatestFrameBuffer`**: Single-slot buffer with metrics
- **`FrameData`**: Container for frame with metadata (timestamp, etc.)
- **`FrameBufferConfig`**: Configuration loader/manager

---

## Future Enhancements

### Potential Improvements

1. **Adaptive Quality**
   - Detect high drop rates
   - Automatically reduce resolution/quality
   - Restore when drop rate decreases

2. **Multi-Frame Processing**
   - Process 2 frames in parallel (if GPU VRAM allows)
   - Requires CUDA stream management
   - Could reduce drop rate to ~30-40%

3. **Priority Queueing**
   - Keyframe detection
   - Process important frames (e.g., new objects detected)
   - Skip redundant frames (similar to previous)

4. **Client-Side Frame Skipping**
   - Frontend receives buffer metrics
   - Adapts send rate dynamically
   - Two-way optimization

---

## Summary

✅ **Implemented**: Single-slot frame buffer with automatic dropping  
✅ **Configurable**: Easy on/off toggle, tunable parameters  
✅ **Metrics**: 30s interval monitoring of performance  
✅ **Fallback**: Synchronous mode for debugging  
✅ **Zero-Latency**: Always processes latest frame  

**Result**: Real-time navigation with predictable latency and no queue buildup!
