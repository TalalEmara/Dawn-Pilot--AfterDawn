# Navigation Pipeline WebSocket Server

This document describes the navigation pipeline integration into the WebSocket server, which replaces the mock detector with real object detection and freepath detection.

## Overview

The navigation pipeline processes RGB+Depth image pairs through:
1. **Object Detection** (YOLO) - Detects objects in the scene
2. **Freepath Detection** (DeepLabV3) - Identifies navigable paths
3. **Occupancy Mapping** - Creates 2D occupancy grid
4. **Freepath Circle Calculation** - Computes navigation circle in bottom half of freepath

## Project Structure

```
Back-End/fast_api/
├── main.py                                    # Main server with /ws/navigation endpoint
├── test_ws_client.py                          # Test client for batch processing
├── config/
│   └── navigation_config.json                 # Configuration for navigation models
├── services/
│   └── navigation_detector_service.py         # Navigation detector service
├── static/
│   └── navigation_test.html                   # Web UI for testing navigation
├── api_output/
│   └── debug_output/                          # Debug frames saved here
└── object_path_detection/                     # Detection modules (attached folder)
    ├── preprocessing/
    │   ├── detector.py                        # ObjectDetector class
    │   └── freepath_detector.py               # FreepathDetector class
    └── path_planning/
        └── occupancy_map.py                   # OccupancyMapBuilder class
```

## Model Setup

### Required Models

1. **YOLO Object Detector**
   - Path: `pipeline1/train/models/best_yolo.pt`
   - Download and place in the specified location

2. **Freepath Detector**
   - Path: `object_path_detection/models/final_deeplabv3_footpath.pth`
   - Download and place in the specified location

3. **Class Mapping**
   - Path: `object_path_detection/yolo_class_mapping.json`
   - Already included in the project

### Directory Structure for Models

```
Back-End/fast_api/
├── pipeline1/
│   └── train/
│       └── models/
│           └── best_yolo.pt                   # Download this
└── object_path_detection/
    └── models/
        └── final_deeplabv3_footpath.pth       # Download this
```

## Configuration

Edit `config/navigation_config.json` to configure paths:

```json
{
  "navigation_detector": {
    "yolo_model_path": "pipeline1/train/models/best_yolo.pt",
    "freepath_model_path": "object_path_detection/models/final_deeplabv3_footpath.pth",
    "output_dir": "api_output",
    "debug_mode": false
  }
}
```

## WebSocket API

### Endpoint
```
ws://localhost:8000/ws/navigation
```

### Request Format
```json
{
  "type": "frame",
  "data": {
    "frame_id": 0,
    "rgb": "base64_encoded_png_data",
    "depth": "base64_encoded_png_data"
  }
}
```

### Response Format
```json
{
  "type": "result",
  "data": {
    "frame_id": 0,
    "success": true,
    "detections": [
      {
        "class_id": 1,
        "class_name": "person",
        "confidence": 0.85,
        "bbox": [x, y, w, h],
        "depth_mean": 2.5
      }
    ],
    "freepath_mask": "base64_encoded_png",
    "freepath_coordinates": [[x1, y1], [x2, y2], ...],
    "freepath_circle": {
      "center": [x, y],
      "radius": r
    },
    "occupancy_map": "base64_encoded_png",
    "processing_time_ms": 95.5,
    "stats": {
      "num_detections": 3,
      "freepath_points": 120,
      "has_freepath_circle": true
    }
  }
}
```

## Testing

### 1. Start the Server

```bash
cd Back-End/fast_api
python main.py
```

The server will:
- Load models at startup (~30 seconds)
- Start on `http://localhost:8000`
- Log initialization status

### 2. Check Health

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
    "navigation_detector": true
  },
  "timestamp": "2025-12-19T..."
}
```

### 3. Test with Python Client

```bash
python test_ws_client.py
```

This will:
- Connect to `ws://localhost:8000/ws/navigation`
- Load frames from `testing_sequence/Color/` and `testing_sequence/Depth/`
- Process frames at 10 FPS
- Print statistics and results

Expected output:
```
Frame 0000: Detections=3, ProcessTime=95.23ms
Frame 0001: Detections=2, ProcessTime=92.15ms
...
FINAL STATISTICS
================
Total Frames:       50
Processed Frames:   50
Average FPS:        10.2
```

### 4. Test with Web UI

1. Open browser: `http://localhost:8000/test/navigation`
2. Select RGB and Depth images
3. Click "Connect"
4. Click "Send Frame"
5. View results in real-time

## Performance Requirements

- **Target**: 10 FPS (100ms per frame)
- **Expected**: 80-100ms per frame on GPU
- **Components**:
  - Object Detection: ~40ms
  - Freepath Detection: ~30ms
  - Occupancy Mapping: ~10ms
  - Encoding/Decoding: ~10ms

## Output Files

### Debug Mode
When `debug_mode: true` in config:
- Frames saved to: `api_output/debug_output/`
- Format: `{timestamp}_frame{id}_{type}.png`
- Types: `rgb`, `depth`, `freepath`, `occupancy`

### Test Client
When `SAVE_RESULTS = True` in test_ws_client.py:
- Results saved to: `test_output/`
- Format: `frame_{id}_result.json`

## Freepath Circle Calculation

The freepath circle is calculated from the centerline coordinates:

1. **Filter Bottom Half**: Use only points where `y >= height/2`
2. **Calculate Center**: Mean of all bottom half points
3. **Calculate Radius**: Mean distance from center to points

This provides a navigation target circle for path planning.

## Error Handling

### Model Not Found
```
⚠️ YOLO model not found at: pipeline1/train/models/best_yolo.pt
Please download the model and place it at the specified path
```

**Solution**: Download and place models in correct locations

### Connection Issues
```
❌ WebSocket connection closed
```

**Solution**: Check server is running on port 8000

### Processing Errors
```
❌ Frame 0005: Error - Failed to decode images
```

**Solution**: Ensure RGB and Depth images are valid PNG files

## API Endpoints

| Endpoint | Type | Description |
|----------|------|-------------|
| `/ws/navigation` | WebSocket | Navigation pipeline processing |
| `/ws/process` | WebSocket | Original phosphene processing |
| `/health` | GET | Health check endpoint |
| `/test` | GET | Original test page |
| `/test/navigation` | GET | Navigation test page |

## Integration with Existing Code

The navigation detector service works **alongside** the existing mock detector:

- **Mock Detector**: Used for `/ws/process` endpoint
- **Navigation Detector**: Used for `/ws/navigation` endpoint
- Both services initialized at startup
- Can be used independently

## Next Steps

1. **Download Models**: Place YOLO and Freepath models in correct locations
2. **Prepare Test Data**: Add RGB/Depth image pairs to `testing_sequence/`
3. **Run Tests**: Start server and test with both Python client and web UI
4. **Optimize**: Profile performance and optimize bottlenecks if needed
5. **Production**: Configure for production deployment

## Troubleshooting

### Server won't start
- Check Python dependencies: `pip install -r requirements.txt`
- Check port 8000 is not in use
- Check file permissions

### Models not loading
- Verify model paths in `config/navigation_config.json`
- Check model files exist and are readable
- Check sufficient memory available

### Slow processing
- Enable GPU acceleration (CUDA)
- Reduce image resolution
- Disable debug mode
- Profile individual components

## Contact

For issues or questions, refer to the main project documentation or contact the Dawn Pilot team.
