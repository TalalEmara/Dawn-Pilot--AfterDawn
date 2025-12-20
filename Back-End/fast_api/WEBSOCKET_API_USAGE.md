# WebSocket API Usage Guide

## Overview
The WebSocket API provides real-time phosphene vision processing with optimized performance and configurable debugging options.

## Connection
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/process');
```

## Message Protocol

### Client → Server (Frame Processing)
```json
{
  "frame": "base64_encoded_jpeg_image",
  "frame_id": "frame_1",
  "params": {
    "t_min": 0.3,  // Score threshold (0.0-1.0)
    "k_min": 1,    // Minimum objects to select
    "k_max": 5     // Maximum objects to select
  }
}
```

### Client → Server (Control Messages)
```json
{
  "type": "pong",
  "timestamp": 1234567890
}
```

### Server → Client (Frame Result)
```json
{
  "type": "frame_result",
  "frame_id": "frame_1",
  "phosphene_image": "base64_encoded_png",
  "detections": [...],
  "selected_count": 3,
  "total_detections": 5,
  "timing": {
    "detection_ms": 5.2,
    "translation_ms": 89.3,
    "total_ms": 94.5
  },
  "stats": {
    "frames_received": 100,
    "frames_processed": 85,
    "frames_skipped": 15,
    "fps": 10.5
  }
}
```

### Server → Client (Control Messages)
```json
// Keepalive ping (every 5 seconds)
{
  "type": "ping",
  "timestamp": 1234567890,
  "ping_count": 1
}

// Frame skipped notification
{
  "type": "frame_skipped",
  "frame_id": "frame_42",
  "message": "Processing previous frame, skipped",
  "stats": {...}
}

// Error notification
{
  "type": "error",
  "error": "Error message",
  "message": "Additional context"
}
```

## Service Configuration

### TranslatorService Parameters

```python
translator_service.translate(
    objects=detections,
    image_width=640,
    image_height=480,
    t_min=0.3,              # Score threshold
    k_min=1,                # Min objects to select
    k_max=5,                # Max objects to select
    save_debug_images=False,  # Save intermediate images for debugging
    return_bytes=False       # Return bytes instead of base64
)
```

#### `save_debug_images` (bool, default=False)
When `True`, saves the following debug images to `api_output/`:
- `phosphene_input_{timestamp}.png` - Translator output (before neural network)
- `phosphene_output_{timestamp}.png` - Final phosphene simulation

**Note:** Enable only for debugging. Causes disk I/O and may trigger Live Server refresh if using file watcher.

#### `return_bytes` (bool, default=False)
- `False`: Returns phosphene image as base64 string (suitable for WebSocket/HTTP JSON)
- `True`: Returns phosphene image as raw bytes (more efficient for binary protocols)

### Translator.run() Parameters

```python
canvas, output_path = translator.run(
    out_name="frame_simp.png",
    save_to_disk=False  # Save canvas to disk for debugging
)
```

#### `save_to_disk` (bool, default=False)
When `True`, saves the translator canvas (simplified navigation image) to disk.

**Note:** Disabled by default to prevent Live Server auto-refresh during WebSocket streaming.

## Performance Considerations

### Frame Rate Mismatch Handling
- Client sends frames at ~10 FPS
- Server processes at ~5-10 FPS (depending on scene complexity)
- **Automatic frame skipping**: If server is still processing, new frames are skipped with notification

### Optimization Tips
1. **Disable debug image saving** in production (default)
2. **Use base64 encoding** for WebSocket (default)
3. **Adjust send FPS** on client side to match processing speed
4. **Monitor `frames_skipped`** counter to tune parameters

### Timing Breakdown
Typical frame processing time: ~60-150ms
- Detection: 3-8ms
- Translation (render): 10-30ms
- Phosphene simulation (neural network): 40-100ms
- Encoding: 5-15ms

## Connection Stability

### Keepalive
- Server sends ping every **5 seconds**
- Client should respond with pong
- Connection drops if no response

### Error Handling
- Temporary errors: Connection continues, error notification sent
- Fatal errors: Connection closes, client should reconnect
- Auto-reconnect: Client can implement with exponential backoff

## Live Server Configuration

If using VS Code Live Server extension, ensure it ignores output directories:

```json
// .vscode/settings.json
{
    "liveServer.settings.ignoreFiles": [
        "**/api_output/**",
        "**/realtime_output/**",
        "**/__pycache__/**"
    ]
}
```

## Example Client Implementation

See `static/websocket_test.html` for a complete working example with:
- Connection management
- Frame capture and sending
- Result visualization
- Error handling
- Statistics tracking
