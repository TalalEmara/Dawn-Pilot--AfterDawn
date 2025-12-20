# 🚀 Quick Start Guide - Refactored Phosphene API

## What Changed?

The phosphene API has been **cleaned up and organized** into a modular structure for better maintainability.

### ✅ Good News
- **All API endpoints work exactly the same**
- **No breaking changes to functionality**
- **Old `phosphene_api.py` still works** (but use `main.py` instead)

### 📁 New Structure
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

## 🏃 Running the API

### Option 1: Direct (Recommended)
```bash
cd fast_api
python main.py
```

### Option 2: Using Scripts
```bash
# Windows
cd fast_api
scripts\start_api.bat

# Linux/Mac
cd fast_api
chmod +x scripts/start_api.sh
./scripts/start_api.sh
```

### Option 3: Old Way (Still Works)
```bash
cd fast_api
python phosphene_api.py
```

## 🧪 Testing

```bash
# Test imports
python -c "from api import router; from models import ProcessRequest; print('✅ OK')"

# Test services
python -c "from services import DetectorService, TranslatorService; print('✅ OK')"

# Health check (after starting API)
curl http://localhost:8000/api/health
```

## 📖 Documentation

- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** - Visual structure guide
- **[REFACTORING_README.md](REFACTORING_README.md)** - Complete refactoring details
- **[REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md)** - Change summary
- **[docs/API_README.md](docs/API_README.md)** - API documentation

## 🔧 For Developers

### Old Imports (Don't use)
```python
from phosphene_api import DetectorService
```

### New Imports (Use these)
```python
from services import DetectorService, TranslatorService
from models import ProcessRequest, ProcessResponse
from core import decode_base64_image, assign_depth_to_detections
```

### Adding New Endpoints
1. Add route in `api/routes.py`
2. Add models in `models/` if needed
3. Add logic in `services/` if complex

### Adding New Features
1. Create utilities in `core/` if reusable
2. Update services in `services/` for business logic
3. Add tests in `tests/`

## ❓ FAQ

**Q: Do I need to change my API calls?**  
A: No! All endpoints work the same.

**Q: What if I have old code importing from `phosphene_api.py`?**  
A: It still works, but update to new imports when convenient.

**Q: Where did my files go?**  
A: Check `PROJECT_STRUCTURE.md` for the new locations.

**Q: Why the change?**  
A: Better organization, easier maintenance, cleaner code.

**Q: Can I still use the old `phosphene_api.py`?**  
A: Yes, but we recommend switching to `main.py` for future updates.

## 🆘 Troubleshooting

### Import Errors
```bash
# Make sure you're in the right directory
cd fast_api

# Check imports work
python -c "import api, models, services, core; print('✅ OK')"
```

### Missing Dependencies
```bash
# Install dependencies
pip install -r requirements.txt
```

### API Won't Start
```bash
# Check for port conflicts
netstat -ano | findstr :8000

# Try different port
python main.py --port 8001
```

## 📞 Need Help?

1. Check this guide
2. Read [REFACTORING_README.md](REFACTORING_README.md)
3. Check [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
4. Review API docs in `docs/`

---

**Status**: ✅ Complete and Tested  
**Date**: December 18, 2025
