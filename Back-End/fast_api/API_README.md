# Phosphene Vision FastAPI Service

Complete API service for object detection and phosphene shape translation.

## 📋 Overview

This FastAPI service wraps the phosphene vision translator system, providing REST endpoints for:
- **Object Detection** (YOLO/Faster R-CNN/Mock)
- **Phosphene Translation** (Convert objects to simplified shapes)
- **End-to-End Processing** (Detection + Translation in one call)

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Windows
cd Back-End\Experiment-Manager\python
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Linux/Mac
cd Back-End/Experiment-Manager/python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Start the Server

```bash
# Windows
start_api.bat

# Linux/Mac
chmod +x start_api.sh
./start_api.sh

# Or run directly
python phosphene_api.py
```

Server will start at: **http://localhost:8000**

API Documentation: **http://localhost:8000/docs**

---

## 📡 API Endpoints

### 1. Health Check
**GET** `/api/health`

Check service status and detector readiness.

```bash
curl http://localhost:8000/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "detector_type": "yolo",
  "detector_loaded": true,
  "translator_ready": true,
  "timestamp": "2025-11-05T10:30:00"
}
```

---

### 2. Detect Objects
**POST** `/api/detect`

Detect objects in an image using configured detector.

**Request:**
```json
{
  "image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "conf_threshold": 0.5
}
```

**Response:**
```json
{
  "objects": [
    {
      "class": "person",
      "confidence": 0.92,
      "bbox": [100, 150, 80, 200],
      "centroid_px": [140, 250],
      "distance_m": 3.5
    }
  ],
  "count": 1,
  "image_size": {
    "width": 640,
    "height": 480
  },
  "processing_time_ms": 156.3
}
```

**cURL Example:**
```bash
# With base64 image
curl -X POST http://localhost:8000/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "image_base64": "iVBORw0KGgoAAAANSUhEUg...",
    "conf_threshold": 0.5
  }'
```

---

### 3. Translate to Phosphene
**POST** `/api/translate`

Convert detected objects to phosphene representation.

**Request:**
```json
{
  "objects": [
    {
      "class": "person",
      "confidence": 0.92,
      "bbox": [100, 150, 80, 200],
      "centroid_px": [140, 250],
      "distance_m": 3.5
    }
  ],
  "image_width": 640,
  "image_height": 480,
  "t_min": 0.3,
  "k_min": 1,
  "k_max": 5
}
```

**Response:**
```json
{
  "phosphene_image_base64": "iVBORw0KGgoAAAANSUhEUg...",
  "selected_objects": [
    {
      "class": "person",
      "score": 0.87,
      "distance_m": 3.5,
      "bbox": [100, 150, 80, 200],
      "confidence": 0.92
    }
  ],
  "metadata": {
    "processing_time_ms": 45.2,
    "selected_count": 1,
    "total_objects": 1,
    "thresholds": {
      "t_min": 0.3,
      "k_min": 1,
      "k_max": 5
    }
  }
}
```

---

### 4. Process Image (End-to-End)
**POST** `/api/process`

Detect objects AND translate in one call.

**Request:**
```json
{
  "image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "conf_threshold": 0.5,
  "t_min": 0.3,
  "k_min": 1,
  "k_max": 5
}
```

**Response:**
```json
{
  "detections": [
    {
      "class": "person",
      "confidence": 0.92,
      "bbox": [100, 150, 80, 200],
      "centroid_px": [140, 250],
      "distance_m": 3.5
    }
  ],
  "phosphene_image_base64": "iVBORw0KGgoAAAANSUhEUg...",
  "selected_objects": [...],
  "metadata": {
    "total_processing_time_ms": 201.5,
    "detection_count": 1,
    "selected_count": 1
  }
}
```

---

### 5. Upload Image File
**POST** `/api/upload-image`

Alternative endpoint for file uploads (multipart form-data).

```bash
curl -X POST http://localhost:8000/api/upload-image \
  -F "file=@photo.jpg"
```

---

### 6. Update Configuration
**POST** `/api/configure`

Update threshold parameters without restarting.

**Request:**
```json
{
  "t_min": 0.4,
  "k_min": 2,
  "k_max": 8
}
```

**Response:**
```json
{
  "status": "updated",
  "changes": {
    "t_min": 0.4,
    "k_min": 2,
    "k_max": 8
  },
  "current_config": {
    "t_min": 0.4,
    "k_min": 2,
    "k_max": 8
  }
}
```

---

## 🔗 Express Backend Integration

### Add Endpoint to api.ts

```typescript
import fetch from 'node-fetch';

// Process image endpoint
app.post('/api/process-image', async (req, res) => {
  try {
    const { imageBase64, tMin = 0.3, kMin = 1, kMax = 5 } = req.body;
    
    // Call Python FastAPI service
    const response = await fetch('http://localhost:8000/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: imageBase64,
        conf_threshold: 0.5,
        t_min: tMin,
        k_min: kMin,
        k_max: kMax
      })
    });
    
    if (!response.ok) {
      throw new Error(`Python API error: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Optionally add detected shapes to world
    if (result.selected_objects && result.selected_objects.length > 0) {
      // Convert phosphene objects to world cubes
      for (const obj of result.selected_objects) {
        // Map object positions to 3D world coordinates
        // This is where you'd integrate with your world_Manager
      }
    }
    
    res.json({
      success: true,
      phospheneImage: result.phosphene_image_base64,
      detections: result.detections,
      selectedObjects: result.selected_objects,
      metadata: result.metadata
    });
    
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### Install Node Dependencies

```bash
cd Back-End/Experiment-Manager
pnpm add node-fetch
```

### Update package.json scripts

```json
{
  "scripts": {
    "dev": "tsx watch api.ts",
    "start-python": "cd python && python phosphene_api.py",
    "dev:all": "concurrently \"pnpm run dev\" \"pnpm run start-python\""
  }
}
```

---

## 🧪 Testing with Postman

### Import Collection

1. Open Postman
2. Import → Upload `postman_phosphene_collection.json`
3. Set base URL: `http://localhost:8000`

### Quick Test Sequence

1. **Health Check** - Verify service is running
2. **Process Image** - Upload test image
3. **View Results** - Check phosphene_image_base64 output

---

## 📁 Project Structure

```
Back-End/Experiment-Manager/python/
├── phosphene_api.py          # Main FastAPI application
├── translator.py              # Phosphene translator
├── realtime_detector.py       # Object detection
├── realtime_camera_gui.py     # GUI application
├── detector_config.json       # Detector configuration
├── requirements.txt           # Python dependencies
├── start_api.bat             # Windows startup script
├── start_api.sh              # Linux/Mac startup script
├── yolov8n.pt                # YOLO model weights
├── api_output/               # Generated images (auto-created)
└── dummy_data/               # Configuration files
    ├── canonical_shapes.json
    └── selection_params.json
```

---

## ⚙️ Configuration

### Detector Configuration (`detector_config.json`)

```json
{
  "detector_type": "yolo",
  "yolo": {
    "model_path": "yolov8n.pt",
    "conf_threshold": 0.5
  },
  "fasterrcnn": {
    "model_path": "path/to/model.pth",
    "conf_threshold": 0.5
  }
}
```

### Threshold Parameters

- **T_min** (0.0-1.0): Minimum score threshold for object selection
- **K_min** (integer): Minimum number of objects to select
- **K_max** (integer): Maximum number of objects to select

---

## 🔧 Troubleshooting

### Service Won't Start

```bash
# Check Python version
python --version  # Should be 3.8+

# Check dependencies
pip list

# Test imports
python -c "import fastapi; import cv2; import torch; print('OK')"
```

### YOLO Model Not Found

```bash
# Download YOLOv8 nano model
cd Back-End/Experiment-Manager/python
curl -L https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt -o yolov8n.pt
```

### Port 8000 Already in Use

Change port in `phosphene_api.py`:
```python
uvicorn.run("phosphene_api:app", host="0.0.0.0", port=8001)  # Use different port
```

### CORS Errors

Update CORS settings in `phosphene_api.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000"],  # Specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 📊 Performance

- **Detection Speed**: ~100-300ms (YOLO on CPU)
- **Translation Speed**: ~30-50ms
- **Total Pipeline**: ~150-350ms per image
- **GPU Acceleration**: 5-10x faster with CUDA

### Optimization Tips

1. Use GPU for YOLO detection (requires CUDA)
2. Reduce image resolution before processing
3. Use smaller YOLO model (yolov8n vs yolov8x)
4. Enable request caching for identical images

---

## 🔒 Security Considerations

### For Production:

1. **Add Authentication**
```python
from fastapi.security import HTTPBearer

security = HTTPBearer()

@app.post("/api/process")
async def process_image(request: ProcessRequest, credentials: HTTPBearer = Depends(security)):
    # Verify token
    pass
```

2. **Rate Limiting**
```bash
pip install slowapi
```

3. **Input Validation**
- Limit image size (max 10MB)
- Validate image formats
- Sanitize file uploads

4. **CORS Configuration**
- Restrict allowed origins
- Use environment variables

---

## 📚 API Documentation

Interactive API docs available at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 💡 Usage Examples

### JavaScript/TypeScript

```typescript
async function processImage(imageBase64: string) {
  const response = await fetch('http://localhost:8000/api/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: imageBase64,
      t_min: 0.3,
      k_min: 1,
      k_max: 5
    })
  });
  
  return await response.json();
}
```

### Python Client

```python
import requests
import base64

def process_image(image_path):
    with open(image_path, 'rb') as f:
        image_base64 = base64.b64encode(f.read()).decode('utf-8')
    
    response = requests.post(
        'http://localhost:8000/api/process',
        json={
            'image_base64': image_base64,
            't_min': 0.3,
            'k_min': 1,
            'k_max': 5
        }
    )
    
    return response.json()
```

### React Frontend

```jsx
const uploadImage = async (file) => {
  const reader = new FileReader();
  reader.onloadend = async () => {
    const base64 = reader.result;
    
    const response = await fetch('http://localhost:8000/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64 })
    });
    
    const data = await response.json();
    
    // Display phosphene image
    setPhospheneImage(`data:image/png;base64,${data.phosphene_image_base64}`);
  };
  
  reader.readAsDataURL(file);
};
```

---

## 🎯 Next Steps

1. ✅ Start the FastAPI service
2. ✅ Test endpoints with Postman or cURL
3. ✅ Integrate with Express backend
4. ✅ Connect to React frontend
5. ✅ Add authentication (if needed)
6. ✅ Deploy to production

---

## 📞 Support

For issues or questions:
- Check logs in terminal
- Review API docs at `/docs`
- Inspect `api_output/` folder for generated images

**Happy coding! 🚀**
