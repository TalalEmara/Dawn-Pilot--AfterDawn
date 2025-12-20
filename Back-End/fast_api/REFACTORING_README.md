# Phosphene Vision API - Organized Structure

This document describes the new organized structure of the Phosphene Vision FastAPI service.

## 📁 Project Structure

```
fast_api/
├── main.py                          # Main application entry point
├── phosphene_api.py                 # DEPRECATED - use main.py instead
│
├── api/                             # API Routes
│   ├── __init__.py
│   └── routes.py                    # All endpoint definitions
│
├── models/                          # Pydantic Models
│   ├── __init__.py
│   ├── request_models.py            # Request validation models
│   └── response_models.py           # Response models
│
├── services/                        # Business Logic Services
│   ├── __init__.py
│   ├── detector_service.py          # Object detection service
│   └── translator_service.py        # Phosphene translation service
│
├── core/                            # Core Utilities
│   ├── __init__.py
│   ├── image_utils.py               # Image encoding/decoding
│   ├── depth_utils.py               # Depth processing
│   └── cleanup.py                   # File cleanup tasks
│
├── detection/                       # Detection Module (move existing files here)
│   ├── realtime_detector.py
│   └── mock_detector.py
│
├── translation/                     # Translation Module (move existing files here)
│   ├── translator.py
│   ├── Pipeline2Integration.py
│   └── utils/
│
├── config/                          # Configuration Files
│   └── detector_config.json
│
├── docs/                            # Documentation
│   ├── API_README.md
│   └── DEPTH_ENDPOINT_REFERENCE.md
│
├── tests/                           # Test Files
│   ├── test_api.py
│   ├── test_detector_config.py
│   └── test_image.py
│
├── scripts/                         # Utility Scripts
│   ├── start_api.bat
│   ├── start_api.sh
│   └── realtime_camera_gui.py
│
├── api_output/                      # Generated Output Files
│   └── debug_frames/
│
├── dummy_data/                      # Test Data
│   ├── camera_calib.json
│   ├── canonical_shapes.json
│   ├── frame_bundle.json
│   └── selection_params.json
│
└── requirements.txt
```

## 🚀 Quick Start

### Running the API

**New way (recommended):**
```bash
python main.py
```

**Old way (still works but deprecated):**
```bash
python phosphene_api.py
```

### Using the API

The API endpoints remain the same:
- `GET /` - Root endpoint
- `GET /api/health` - Health check
- `POST /api/detect` - Object detection only
- `POST /api/translate` - Phosphene translation only
- `POST /api/process` - End-to-end processing (base64)
- `POST /api/upload-image` - End-to-end processing (file upload, recommended)
- `POST /api/process-url` - Process from URL
- `POST /api/process-with-depth` - Depth-aware processing (base64)
- `POST /api/upload-with-depth` - Depth-aware processing (file upload, recommended)
- `POST /api/configure` - Update configuration

## 📦 Module Descriptions

### `api/`
Contains all FastAPI route definitions. The `routes.py` file has all endpoint logic cleanly separated from the main application.

### `models/`
Pydantic models for request and response validation:
- **request_models.py**: Input validation models
- **response_models.py**: Output models with proper typing

### `services/`
Business logic services that handle the core functionality:
- **detector_service.py**: Manages object detection (YOLO, Faster R-CNN, Mock)
- **translator_service.py**: Handles phosphene translation and Pipeline2 integration

### `core/`
Utility functions used across the application:
- **image_utils.py**: Image encoding/decoding, debug image saving
- **depth_utils.py**: Depth map processing and assignment
- **cleanup.py**: Background file cleanup tasks

### `detection/`
Object detection modules (to be organized):
- Move `realtime_detector.py` here
- Move `mock_detector.py` here

### `translation/`
Phosphene translation modules (to be organized):
- Move `translator.py` here
- Move `Pipeline2Integration.py` here
- Move `utils/` directory here

### `config/`
Configuration files:
- Move `detector_config.json` here

### `docs/`
Documentation files:
- Move `API_README.md` here
- Move `DEPTH_ENDPOINT_REFERENCE.md` here
- Move `express_integration_example.ts` here
- Move `postman_phosphene_collection.json` here

### `tests/`
Test files:
- Move `test_api.py` here
- Move `test_detector_config.py` here
- Move `test_image.py` here

### `scripts/`
Utility scripts:
- Move `start_api.bat` here
- Move `start_api.sh` here
- Move `realtime_camera_gui.py` here

## 🔄 Migration Notes

### What Changed?
1. **Code Organization**: Split monolithic `phosphene_api.py` into logical modules
2. **Import Structure**: Updated imports to use new package structure
3. **Separation of Concerns**: Clear boundaries between API, services, and utilities

### What Stayed the Same?
1. **API Endpoints**: All endpoints work exactly as before
2. **Functionality**: No changes to core detection/translation logic
3. **Configuration**: Same config files and environment variables

### Breaking Changes?
**None!** The old `phosphene_api.py` can still be used if needed, but we recommend switching to `main.py` for better maintainability.

## 🛠️ Development

### Adding New Endpoints
1. Add route handler in `api/routes.py`
2. Define request/response models in `models/`
3. Implement business logic in `services/` if needed

### Adding New Features
1. Create utility functions in `core/` if reusable
2. Update services in `services/` for business logic
3. Add tests in `tests/`

### Code Style
- Follow existing patterns for consistency
- Use type hints where possible
- Add docstrings for all public functions
- Keep functions focused and single-purpose

## 📝 File Movement Checklist

To complete the reorganization, move these files:

**Detection:**
- [ ] `realtime_detector.py` → `detection/realtime_detector.py`
- [ ] `mock_detector.py` → `detection/mock_detector.py`

**Translation:**
- [ ] `translator.py` → `translation/translator.py`
- [ ] `Pipeline2Integration.py` → `translation/Pipeline2Integration.py`
- [ ] `utils/` → `translation/utils/`

**Config:**
- [ ] `detector_config.json` → `config/detector_config.json`

**Docs:**
- [ ] `API_README.md` → `docs/API_README.md`
- [ ] `DEPTH_ENDPOINT_REFERENCE.md` → `docs/DEPTH_ENDPOINT_REFERENCE.md`
- [ ] `express_integration_example.ts` → `docs/express_integration_example.ts`
- [ ] `postman_phosphene_collection.json` → `docs/postman_phosphene_collection.json`

**Tests:**
- [ ] `test_api.py` → `tests/test_api.py`
- [ ] `test_detector_config.py` → `tests/test_detector_config.py`
- [ ] `test_image.py` → `tests/test_image.py`

**Scripts:**
- [ ] `start_api.bat` → `scripts/start_api.bat`
- [ ] `start_api.sh` → `scripts/start_api.sh`
- [ ] `realtime_camera_gui.py` → `scripts/realtime_camera_gui.py`

**Note:** After moving files, update import statements in affected files.

## ✅ Benefits

1. **Better Organization**: Easy to find and maintain code
2. **Clear Separation**: API, business logic, and utilities are separated
3. **Scalability**: Easy to add new features without cluttering
4. **Testing**: Easier to write and organize tests
5. **Documentation**: Clear structure makes it easier to document
6. **Onboarding**: New developers can understand the structure quickly

## 🔧 Troubleshooting

### Import Errors
If you see import errors after the reorganization:
1. Make sure you're running from the `fast_api/` directory
2. Check that all `__init__.py` files are in place
3. Verify Python can find the modules: `python -c "import api; import models; import services"`

### Old Scripts Not Working
Update old scripts to use the new structure:
- Replace `from phosphene_api import ...` with appropriate imports from new modules
- Update paths to moved files

## 📞 Support

For questions or issues:
1. Check this README
2. Review the existing documentation in `docs/`
3. Check the inline code documentation

---

**Last Updated**: December 2025
