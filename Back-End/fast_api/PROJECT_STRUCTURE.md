# Fast API Project Structure

## Directory Tree

```
fast_api/
│
├── 📄 main.py                          ⭐ NEW: Clean entry point (85 lines)
├── 📄 phosphene_api.py                 ⚠️  DEPRECATED: Old monolithic file (1745 lines)
├── 📄 requirements.txt
├── 📄 REFACTORING_README.md            📚 Complete refactoring guide
├── 📄 REFACTORING_SUMMARY.md           📚 Summary of changes
├── 📄 move_files.py                    🔧 File reorganization script
│
├── 📁 api/                             🌐 API Layer
│   ├── __init__.py
│   └── routes.py                       All endpoint definitions (~800 lines)
│
├── 📁 models/                          📋 Data Models
│   ├── __init__.py
│   ├── request_models.py               Request validation models
│   └── response_models.py              Response models
│
├── 📁 services/                        ⚙️  Business Logic
│   ├── __init__.py
│   ├── detector_service.py             Object detection service
│   └── translator_service.py           Phosphene translation service
│
├── 📁 core/                            🔧 Core Utilities
│   ├── __init__.py
│   ├── image_utils.py                  Image encode/decode, debug saving
│   ├── depth_utils.py                  Depth processing & assignment
│   └── cleanup.py                      Background file cleanup
│
├── 📁 detection/                       🔍 Detection Module
│   ├── __init__.py
│   ├── realtime_detector.py            YOLO & Faster R-CNN detector
│   └── mock_detector.py                Mock detector for testing
│
├── 📁 translation/                     🎨 Translation Module
│   ├── __init__.py
│   ├── translator.py                   Phosphene translator
│   ├── Pipeline2Integration.py         Pipeline2 neural network
│   └── utils/                          Translation utilities
│       ├── Differentiable_p2p.py
│       ├── utils.py
│       └── SavedCheckPoints/
│           └── ckpt_epoch_6.pth
│
├── 📁 config/                          ⚙️  Configuration
│   └── detector_config.json            Detector configuration
│
├── 📁 docs/                            📚 Documentation
│   ├── API_README.md
│   ├── DEPTH_ENDPOINT_REFERENCE.md
│   ├── express_integration_example.ts
│   └── postman_phosphene_collection.json
│
├── 📁 tests/                           🧪 Tests
│   ├── test_api.py
│   ├── test_detector_config.py
│   └── test_image.py
│
├── 📁 scripts/                         🔧 Utility Scripts
│   ├── start_api.bat                   Windows startup script
│   ├── start_api.sh                    Linux/Mac startup script
│   └── realtime_camera_gui.py          Camera GUI for testing
│
├── 📁 api_output/                      📤 Generated Files
│   ├── temp_detection.json
│   └── debug_frames/                   Debug images
│
├── 📁 dummy_data/                      📊 Test Data
│   ├── camera_calib.json
│   ├── canonical_shapes.json
│   ├── frame_bundle.json
│   └── selection_params.json
│
├── 📁 realtime_output/                 Output directory
└── 📁 __pycache__/                     Python cache

```

## Module Dependencies

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
        └─> dummy_data/*
```

## API Routes Structure

```
FastAPI App
├── GET /
├── GET /api/health
├── POST /api/detect
├── POST /api/translate
├── POST /api/process
├── POST /api/upload-image          ⭐ RECOMMENDED
├── POST /api/process-url
├── POST /api/process-with-depth
├── POST /api/upload-with-depth     ⭐ RECOMMENDED  
└── POST /api/configure
```

## Data Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP Request
       ↓
┌──────────────────────────────────────────┐
│         API Routes (api/routes.py)        │
│  - Decode input                           │
│  - Validate with models                   │
│  - Call processing logic                  │
└──────┬───────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│  Core Processing (_process_frame_internal)│
└──────┬───────────────────┬───────────────┘
       │                   │
       ↓                   ↓
┌─────────────────┐  ┌──────────────────────┐
│ DetectorService │  │ TranslatorService    │
│ - YOLO/Mock     │  │ - Translator         │
│ - Detect objects│  │ - Pipeline2          │
└─────────────────┘  │ - Generate phosphene │
                     └──────────────────────┘
       │                   │
       └────────┬──────────┘
                ↓
        ┌───────────────┐
        │    Response   │
        │  - Detections │
        │  - Phosphene  │
        │  - Metadata   │
        └───────────────┘
```

## Before vs After

### Before (Monolithic)
```
phosphene_api.py (1745 lines)
  - Everything in one file
  - Hard to navigate
  - Difficult to test
  - Tight coupling
```

### After (Modular)
```
11 organized modules (~1835 lines total)
  - Clear separation of concerns
  - Easy to navigate
  - Testable components
  - Loose coupling
  - Better maintainability
```

## Import Examples

### Old Way (Deprecated)
```python
from phosphene_api import DetectorService, TranslatorService
from phosphene_api import decode_base64_image
from phosphene_api import DetectionRequest
```

### New Way (Current)
```python
from services import DetectorService, TranslatorService
from core import decode_base64_image
from models import DetectionRequest
```

## Running the API

### Quick Start
```bash
# From fast_api directory
python main.py
```

### With Scripts
```bash
# Windows
cd fast_api
scripts\start_api.bat

# Linux/Mac
cd fast_api
chmod +x scripts/start_api.sh
./scripts/start_api.sh
```

### Testing
```bash
# Health check
curl http://localhost:8000/api/health

# Process image
curl -X POST http://localhost:8000/api/process \
  -H "Content-Type: application/json" \
  -d '{"image_base64": "..."}'
```

## Key Files

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

## Benefits Summary

✅ **Organized** - Clear folder structure  
✅ **Maintainable** - Easy to find and update code  
✅ **Testable** - Independent module testing  
✅ **Scalable** - Easy to add features  
✅ **Documented** - Comprehensive docs  
✅ **Backward Compatible** - Old code still works  

---

**For more details, see:**
- `REFACTORING_README.md` - Complete guide
- `REFACTORING_SUMMARY.md` - Quick summary
- `docs/API_README.md` - API documentation
