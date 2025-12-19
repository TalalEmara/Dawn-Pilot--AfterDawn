# Quick Start Guide - Navigation Pipeline WebSocket

## Prerequisites

1. Python 3.8+ installed
2. Model files downloaded (see Model Setup below)
3. Test data prepared in `testing_sequence/` folder

## Installation

### 1. Install Dependencies

```bash
cd Back-End/fast_api
pip install -r requirements.txt
```

Required packages:
- fastapi
- uvicorn
- websockets
- opencv-python
- numpy
- torch
- torchvision
- ultralytics (for YOLO)
- Pillow

### 2. Model Setup

Create the following directory structure and download models:

```
Back-End/fast_api/
├── pipeline1/
│   └── train/
│       └── models/
│           └── best_yolo.pt              # PLACE YOLO MODEL HERE
└── object_path_detection/
    └── models/
        └── final_deeplabv3_footpath.pth  # PLACE FREEPATH MODEL HERE
```

**Note**: Until you download and place the models, the navigation detector will not load, but the server will still start.

### 3. Prepare Test Data

Create test data directory structure:

```
Dawn-Pilot--AfterDawn/
└── testing_sequence/
    ├── Color/
    │   ├── 0000.png
    │   ├── 0001.png
    │   └── ...
    └── Depth/
        ├── 0000.png
        ├── 0001.png
        └── ...
```

## Running the Server

### Start Server

```bash
cd Back-End/fast_api
python main.py
```

You should see:
```
============================================================
Phosphene Vision API Starting...
Detector: mock (ready: True)
Translator: ready: True (initialized: True)
Pipeline2: initialized: True
Navigation Detector: ready: False  # Until models are downloaded
============================================================
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Check Health

Open browser or use curl:
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "services": {
    "detector": true,
    "translator": true,
    "navigation_detector": false  // Will be true when models are loaded
  }
}
```

## Testing

### Option 1: Python Test Client (Recommended)

```bash
python test_ws_client.py
```

This will:
- Load all frames from `testing_sequence/`
- Process at 10 FPS
- Print real-time statistics
- Show processing times

Example output:
```
============================================================
Navigation WebSocket Test Client
============================================================
WebSocket URL: ws://localhost:8000/ws/navigation
Test Data Path: D:\Eng\SBE\gp\Dawn-Pilot--AfterDawn\testing_sequence
Target FPS: 10
============================================================
Found 50 frame pairs
✅ Connected to ws://localhost:8000/ws/navigation
✅ Server ready: Navigation WebSocket connected successfully
Frame 0000: Detections=3, ProcessTime=95.23ms
Frame 0001: Detections=2, ProcessTime=92.15ms
...
============================================================
FINAL STATISTICS
============================================================
Total Frames:       50
Processed Frames:   50
Errors:             0
Total Elapsed Time: 5.12s
Avg Processing Time: 93.45ms
Average FPS:        9.76
Target FPS:         10
✅ Performance: GOOD (processing faster than 100ms)
============================================================
```

### Option 2: Web UI

1. Open browser: `http://localhost:8000/test/navigation`
2. Click "📷 Select RGB Image" and choose an RGB image
3. Click "📐 Select Depth Image" and choose a depth image
4. Click "Connect" button
5. Click "Send Frame" button
6. View results:
   - RGB Input (your uploaded image)
   - Depth Input (your uploaded depth image)
   - Freepath Mask (detected navigable area)
   - Occupancy Map (obstacles marked)
   - Processing statistics

## Expected Performance

| Metric | Target | Expected |
|--------|--------|----------|
| Processing Time | < 100ms | 80-100ms |
| FPS | 10 FPS | 9-11 FPS |
| Object Detection | ~40ms | GPU recommended |
| Freepath Detection | ~30ms | GPU recommended |
| Occupancy Mapping | ~10ms | CPU sufficient |

## Output Data Format

### Detections
```json
{
  "class_id": 1,
  "class_name": "person",
  "confidence": 0.85,
  "bbox": [100, 150, 80, 120],  // [x, y, width, height]
  "depth_mean": 2.5               // meters
}
```

### Freepath Circle
```json
{
  "center": [320, 400],  // [x, y] in pixels
  "radius": 50           // pixels
}
```

### Freepath Coordinates
```json
[[320, 480], [320, 479], [321, 478], ...]  // List of [x, y] points
```

## Troubleshooting

### Problem: Models not loading
**Symptom**: "Navigation Detector: ready: False"

**Solution**:
1. Check model files exist at correct paths
2. Verify file permissions
3. Check console for specific error messages

### Problem: No test data found
**Symptom**: "❌ Test data path not found"

**Solution**:
1. Create `testing_sequence/` directory
2. Add `Color/` and `Depth/` subdirectories
3. Place PNG images in both folders (must be paired)

### Problem: Connection refused
**Symptom**: "❌ WebSocket connection closed"

**Solution**:
1. Ensure server is running (`python main.py`)
2. Check port 8000 is not in use
3. Check firewall settings

### Problem: Slow processing
**Symptom**: Processing time > 200ms

**Solution**:
1. Use GPU (CUDA) instead of CPU
2. Reduce image resolution
3. Check system resources
4. Close other applications

## Configuration

Edit `config/navigation_config.json`:

```json
{
  "navigation_detector": {
    "yolo_model_path": "pipeline1/train/models/best_yolo.pt",
    "freepath_model_path": "object_path_detection/models/final_deeplabv3_footpath.pth",
    "output_dir": "api_output",
    "debug_mode": false  // Set to true to save debug frames
  }
}
```

## Saving Results

### Enable in Test Client

Edit `test_ws_client.py`:
```python
SAVE_RESULTS = True  # Change from False
```

Results will be saved to `test_output/frame_XXXX_result.json`

### Enable Debug Mode

Edit `config/navigation_config.json`:
```json
{
  "navigation_detector": {
    "debug_mode": true  // Change from false
  }
}
```

Debug frames will be saved to `api_output/debug_output/`

## Next Steps

1. ✅ Start server
2. ✅ Test with web UI using sample images
3. ✅ Run Python test client with full dataset
4. ✅ Verify performance meets requirements (< 100ms per frame)
5. ✅ Review output data and visualizations
6. ⏭️ Integrate with your application

## API Documentation

Full documentation available in:
- `NAVIGATION_WEBSOCKET_README.md` - Complete technical documentation
- `API_README.md` - General API documentation (if exists)

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review server console logs
3. Enable debug mode for detailed output
4. Check the NAVIGATION_WEBSOCKET_README.md for detailed specs

---

**Ready to test!** Start the server and run the test client to see it in action! 🚀
