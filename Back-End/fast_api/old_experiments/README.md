# Old Experiments & Legacy Code

This folder contains legacy API implementations and experimental WebSocket routes that are no longer actively used in the main navigation-phosphene pipeline.

## Files in this folder:

### 1. **phosphene_api.py**
**Purpose:** Original monolithic FastAPI implementation with all routes in a single file.
**Status:** Legacy - replaced by modular structure in `api/routes.py` and `api/websocket_routes.py`
**Features:**
- `/detect` - Object detection endpoint
- `/translate` - Phosphene translation endpoint
- `/process` - Combined detection + translation
- `/process-with-depth` - Processing with depth maps
- WebSocket endpoints for real-time processing
**Note:** This file contains ~1700 lines and has been superseded by the new modular architecture. Keep for reference only.

### 2. **websocket_routes_backup.py**
**Purpose:** Backup copy of WebSocket routes
**Status:** Backup/Archive
**Features:** Same as current websocket_routes.py but kept as backup before major refactoring

### 3. **legacy_websockets.py**
**Purpose:** WebSocket handlers for non-navigation-phosphene endpoints
**Status:** Experimental/Testing
**Features:**
- `/ws` - Standard phosphene WebSocket (detection + translation only)
- `/ws/navigation` - Navigation WebSocket (detection + freepath, no phosphene rendering)

These endpoints are kept for backward compatibility and testing but are not part of the main production pipeline.

## Main Production Endpoint:
The primary production endpoint is: **`/ws/navigation-phosphene`**
- Location: `api/nav_phosphene_ws.py`
- Full pipeline: Object Detection → Freepath Detection → Translator → Phosphene Rendering
- Optimized for minimal latency with reduced image transformations

## Migration Guide:
If you need functionality from these legacy files:
1. Check if equivalent functionality exists in the new modular structure
2. Refer to `api/routes.py` for REST endpoints
3. Refer to `api/nav_phosphene_ws.py` for the main WebSocket pipeline
4. Use `api/legacy_websockets.py` for experimental/testing endpoints

---
**Last Updated:** December 21, 2025
