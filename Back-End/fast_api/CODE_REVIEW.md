# Code Review: `fast_api` — Phosphene Vision Service

**Reviewer:** Senior Staff Engineer  
**Date:** March 12, 2026  
**Scope:** All Python files under `Back-End/fast_api/`  
**System goal:** Real-time computer vision pipeline (30 FPS WebSocket), GPU-critical, multi-client broadcast

---

## CRITICAL — Fix Immediately

---

### C-1: `send_fjson` Typo Silently Destroys All Broadcast Connections

**File:** `api/nav_phosphene_ws.py` (line ~64)

**Why it's critical:** `send_fjson` does not exist on FastAPI's `WebSocket` object. Every single `broadcast()` call raises `AttributeError`, is caught by the bare `except Exception`, and then **removes the failing connection from the pool**. All clients will be silently disconnected after the first broadcast, and no results will ever be delivered. This is a complete functional failure.

```python
# BROKEN — invalid method name
await connection.send_fjson(message)

# FIX
await connection.send_json(message)
```

---

### C-2: Race Condition — `translator_lock` Acquired Nowhere

**File:** `services/navigation_detector_service.py` (line ~97), `services/translator_service.py` (line ~155)

**Why it's critical:** `NavigationDetectorService.__init__` creates a `threading.Lock()` named `self.translator_lock` with the comment *"Critical: Without this, Frame N+1 can overwrite Frame N's translator state."* However, **the lock is never acquired anywhere in the codebase.** `process_full_pipeline` calls `self.translator_service.translate(...)`, which mutates `self.translator.bundle`, `self.translator.input_width`, `self.translator.params`, etc., without any synchronization. Under `asyncio.to_thread`, concurrent frames from multiple clients will corrupt translator state.

```python
# In NavigationDetectorService.process_full_pipeline(), find the translate() call:
# BROKEN — lock exists but is never used
phosphene_b64, selected_objects, translate_meta = self.translator_service.translate(
    objects=detections, ...
)

# FIX — acquire the lock before any translator access
with self.translator_lock:
    phosphene_b64, selected_objects, translate_meta = self.translator_service.translate(
        objects=detections, ...
    )
```

---

### C-3: `CUDA_VISIBLE_DEVICES` Set After CUDA Is Already Initialized

**File:** `main.py` (line ~41)

**Why it's critical:** `os.environ['CUDA_VISIBLE_DEVICES']` is only respected by the CUDA runtime **before** `torch.cuda` is first used. By the time the code reaches that line, `import torch` has already initialized CUDA. The env var assignment is dead code. On a system where PyTorch auto-selects the wrong device (e.g., Intel integrated GPU as `cuda:0`), this appears to fix the problem in logs but actually does nothing, and all models silently load on the wrong device.

```python
# BROKEN — set AFTER torch.cuda was already initialized on import
import torch
if torch.cuda.is_available():
    ...
    os.environ['CUDA_VISIBLE_DEVICES'] = str(nvidia_device)  # No effect here

# FIX — set the env var BEFORE importing torch, at the very top of main.py:
import os

# Must be done before importing torch or any package that uses CUDA
_nvidia_device = _find_nvidia_device()  # implement a pre-import helper
if _nvidia_device is not None:
    os.environ['CUDA_VISIBLE_DEVICES'] = str(_nvidia_device)

import torch  # NOW torch respects the env var
```

The correct pattern is to move GPU selection entirely before `import torch`:

```python
# main.py — TOP of file, before torch import
import os
import subprocess

def _select_nvidia_gpu() -> None:
    """Set CUDA_VISIBLE_DEVICES before torch initializes CUDA."""
    try:
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=index,name', '--format=csv,noheader'],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.strip().splitlines():
            idx, name = line.split(',', 1)
            print(f"GPU {idx.strip()}: {name.strip()}")
            os.environ['CUDA_VISIBLE_DEVICES'] = idx.strip()
            return
    except Exception:
        pass  # Fall through to CPU

_select_nvidia_gpu()

import torch  # CUDA_VISIBLE_DEVICES is now respected
```

---

### C-4: Service Initialized at Module Import, Not Inside Lifespan

**File:** `main.py` (line ~67)

**Why it's critical:** `NavigationDetectorService()` is called at the **module level**, before `app` is even created. If initialization raises an exception (model files missing, OOM, etc.), it crashes with a raw Python traceback instead of a structured FastAPI startup error. FastAPI's exception handling, middleware, and dependency injection are all bypassed. Additionally, there is no `shutdown` handler to clean up the `ThreadPoolExecutor`, which leaks threads.

```python
# BROKEN — module-level init, no shutdown, no lifespan management
navigation_detector_service = NavigationDetectorService(output_dir="api_output")
app = FastAPI(...)

# FIX — use lifespan context manager (FastAPI 0.93+)
from contextlib import asynccontextmanager

navigation_detector_service: NavigationDetectorService | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global navigation_detector_service
    logger.info("Starting up: loading models...")
    navigation_detector_service = NavigationDetectorService(output_dir="api_output")
    import api.routes as routes_module
    routes_module.set_navigation_service(navigation_detector_service)
    import api.nav_phosphene_ws as nav_ws
    nav_ws.navigation_detector_service = navigation_detector_service
    yield
    # Shutdown: release resources
    logger.info("Shutting down: releasing resources...")
    if navigation_detector_service and navigation_detector_service.executor:
        navigation_detector_service.executor.shutdown(wait=False)

app = FastAPI(title="Phosphene Vision API", lifespan=lifespan)
```

---

### C-5: `_frame_count` Lazy Init Is Thread-Unsafe

**File:** `services/navigation_detector_service.py` (line ~551)

**Why it's critical:** `_frame_count` is lazily initialized inside `process_frame` with `if not hasattr(self, '_frame_count'): self._frame_count = 0`. Under parallel processing, two threads invoking `process_frame` simultaneously will both see `hasattr` return `False`, both set `_frame_count = 0`, and the GPU watchdog/cleanup counter resets constantly. Watchdog syncs and cache clears will never trigger reliably.

```python
# BROKEN — lazy, thread-unsafe init
if not hasattr(self, '_frame_count'):
    self._frame_count = 0
self._frame_count += 1

# FIX — initialize in __init__ and protect with a lock
# In __init__:
self._frame_count = 0
self._frame_count_lock = threading.Lock()

# In process_frame():
with self._frame_count_lock:
    self._frame_count += 1
    frame_count = self._frame_count

if torch.cuda.is_available():
    if frame_count % 50 == 0:
        torch.cuda.synchronize()
    if self.gpu_memory_optimization and frame_count % 100 == 0:
        torch.cuda.empty_cache()
```

---

### C-6: Path Traversal via Unsanitized `frame_id` in Debug File Paths

**File:** `services/navigation_detector_service.py` (line ~1085), multiple other locations

**Why it's critical:** `frame_id` is taken directly from WebSocket client input (`payload["frame_id"]`) and embedded into file system paths:
```python
debug_prefix = f"{self.debug_output_dir}/edge_mode_{frame_id}_{timestamp}"
cv2.imwrite(f"{debug_prefix}_03_phosphene_output.png", phosphene_img)
```
A malicious client sending `frame_id = "../../etc/cron.d/evil"` with `debug=true` could write files to arbitrary locations on the server. Sanitize before use:

```python
import re

def _sanitize_frame_id(frame_id: str) -> str:
    """Restrict frame_id to alphanumeric, dashes, and underscores."""
    sanitized = re.sub(r'[^a-zA-Z0-9_\-]', '_', str(frame_id))
    return sanitized[:64]  # also cap length

# Usage:
safe_frame_id = _sanitize_frame_id(frame_id)
debug_prefix = os.path.join(self.debug_output_dir, f"edge_mode_{safe_frame_id}_{timestamp}")
```

---

## MAJOR — Refactor Soon

---

### M-1: Duplicate `Pipeline2Integration` Loaded Twice (Double GPU Memory)

**File:** `services/navigation_detector_service.py` (line ~74), `services/translator_service.py` (line ~36)

Both `NavigationDetectorService` and `TranslatorService` independently construct `Pipeline2Integration()`, which loads `encoder_phosphene`, `encoder_edge`, and the `simulator` onto the GPU. This **doubles GPU memory usage** for the neural networks (~300MB+ depending on model size) and creates two separate warm-up cycles.

**Fix:** `NavigationDetectorService` should own the single `Pipeline2Integration` instance and pass it into `TranslatorService`:

```python
# TranslatorService.__init__ — accept injected pipeline2
class TranslatorService:
    def __init__(self, pipeline2: Pipeline2Integration, eager_init: bool = True):
        self.pipeline2 = pipeline2  # injected, not owned
        ...
        # REMOVE: self.pipeline2 = Pipeline2Integration()

# NavigationDetectorService.__init__
self.pipeline2 = Pipeline2Integration()  # single instance
self.translator_service = TranslatorService(pipeline2=self.pipeline2, eager_init=True)
```

---

### M-2: Duplicated Detection Normalization — DRY Violation

**File:** `services/navigation_detector_service.py` (line ~318 and ~455)

The entire block that converts raw detector output to standardized format (None-checks, safe float conversions, centroid calculation) is **copy-pasted verbatim** in both `detect()` and `process_frame()`. Any bug fix or change must be applied in two places.

```python
# FIX — extract into a private method
def _standardize_detection(self, det: dict, frame_id: int = 0) -> dict:
    bbox = [int(x) for x in det.get("bbox", [0, 0, 0, 0])]
    cx = int(bbox[0] + bbox[2] // 2)
    cy = int(bbox[1] + bbox[3] // 2)

    try:
        safe_confidence = float(det["detection_score"]) if det.get("detection_score") is not None else 0.001
    except (TypeError, ValueError):
        logger.warning(f"[Frame {frame_id}] Invalid confidence, defaulting to 0.001")
        safe_confidence = 0.001

    try:
        safe_depth = float(det["depth_pixel"]) if det.get("depth_pixel") is not None else 128.0
    except (TypeError, ValueError):
        logger.warning(f"[Frame {frame_id}] Invalid depth_pixel for {det.get('class')}, defaulting to 128.0")
        safe_depth = 128.0

    return {
        "class": str(det.get("class", "unknown")),
        "confidence": safe_confidence,
        "bbox": bbox,
        "centroid_px": [cx, cy],
        "depth_pixel": safe_depth,
    }

# Then in both detect() and process_frame():
standardized_detections = [self._standardize_detection(d, frame_id) for d in detections]
```

---

### M-3: `NavigationDetectorService` Violates Single Responsibility Principle

**File:** `services/navigation_detector_service.py`

This class is a God Object. It handles: configuration parsing, model loading, object detection, freepath detection, frame pipeline orchestration, FOV cropping, edge detection, GPU watchdog, debug image saving, image encoding, and GPU warmup. Each responsibility is a separate class.

**Suggested decomposition:**
- `ModelLoader` — loads and owns model instances
- `FramePipeline` — orchestrates stage execution
- `DebugImageSaver` — handles all `cv2.imwrite` debug calls
- `GPUWatchdog` — handles periodic sync/cache clearing

---

### M-4: Inline `sys.path.insert` in Service Module

**File:** `services/navigation_detector_service.py` (line ~20)

```python
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), 'object_path_detection'))
```

Mutating `sys.path` inside a service module is fragile (order-dependent, executed on every import), poisons the path for all other code in the process, and breaks IDE tooling. Fix by making `object_path_detection` a proper Python package with an `__init__.py` and using relative imports, or by configuring `PYTHONPATH` in the project's `pyproject.toml` / launch config.

---

### M-5: Confusing `real_confidence` vs `confidence` vs `safe_confidence`

**File:** `services/navigation_detector_service.py` (line ~458)

Inside `process_frame()`, `real_confidence` holds the actual YOLO score, but then `confidence = 0.8` hardcodes a constant, and later only `real_confidence` is kept as `safe_confidence`. The computed `confidence` variable is assigned but **never used** in the standardized output. This silent dead assignment misleads future maintainers.

```python
# CURRENT (confusing):
real_confidence = det.get("detection_score", 0.001)
confidence = 0.8               # assigned, never used in output
if det.get("depth_pixel"):
    confidence = max(...)      # also never used
safe_confidence = float(real_confidence)  # real_confidence used, not confidence

# FIX — remove the dead 'confidence' variable entirely:
safe_confidence = float(det["detection_score"]) if det.get("detection_score") is not None else 0.001
```

---

### M-6: `transforms.Compose` Rebuilt Every Frame

**File:** `services/navigation_detector_service.py` (line ~664)

`_infer_freepath_from_array` constructs a new `torchvision.transforms.Compose([...])` object on **every single call**. At 30 FPS this creates 30 new Python objects per second. Pre-build it once:

```python
# In __init__, after loading freepath_detector:
from torchvision import transforms as T
self._freepath_transform = T.Compose([
    T.Resize((256, 256), interpolation=Image.BILINEAR),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# In _infer_freepath_from_array, replace:
# infer_tf = transforms.Compose([...])   ← REMOVE
img_t = self._freepath_transform(rgb_pil).unsqueeze(0).to(...)
```

---

### M-7: Duplicate Line in `process_full_pipeline`

**File:** `services/navigation_detector_service.py` (line ~1148)

```python
freepath_coordinates = nav_result.get("freepath_coordinates", [])
freepath_coordinates = nav_result.get("freepath_coordinates", [])  # ← exact duplicate
```

Remove the duplicate.

---

### M-8: `temp_json_path` Shared Across Concurrent Calls

**File:** `services/translator_service.py` (line ~32)

```python
self.temp_json_path = os.path.join(self.output_dir, "temp_detection.json")
```

This fixed path is written to in both `_initialize_translator()` and `translate()` (when `self.translator is None`). If initialization is lazy and two requests hit simultaneously before the translator is initialized, both threads will write to the same file concurrently (no lock), causing corrupted JSON. Use `tempfile.NamedTemporaryFile` instead.

---

## MINOR — Nitpicks / Style

---

### m-1: `print()` Used Extensively Instead of Logger

**Files:** `main.py`, `services/navigation_detector_service.py`, `services/translator_service.py`

Over 60 `print()` calls coexist with a configured `logging` setup. `print` bypasses log level control, structured log formatters, log rotation, and monitoring integrations. Replace all with `logger.info(...)` / `logger.debug(...)`.

---

### m-2: Standard Module Imports Inside Methods

**File:** `services/navigation_detector_service.py`

`import time`, `import json`, `import traceback`, `import concurrent.futures`, `from PIL import Image`, `import torchvision.transforms as transforms` all appear inside method bodies. Python caches modules so this has minimal runtime cost, but it breaks IDE auto-complete, static analysis (`mypy`, `ruff`), and makes dependencies invisible. Move to the module top.

---

### m-3: Bare `except: pass`

**File:** `api/nav_phosphene_ws.py` (line ~370)

```python
except:
    pass
```

This silently swallows **all exceptions** including `KeyboardInterrupt` and `SystemExit`. Use `except Exception: pass` at a minimum, and log it:

```python
except Exception as e:
    logger.debug(f"WebSocket close error (expected on disconnect): {e}")
```

---

### m-4: Dead / Commented-Out Code

Multiple files contain commented-out blocks that should be removed:

- `translation/Pipeline2Integration.py` — `# plt.imshow(...)`, `# plt.show()`, `# plt.savefig(...)`, `# print(...)` throughout
- `services/navigation_detector_service.py` — `# confidence = 0.8`, commented confidence adjustment block
- `object_path_detection/preprocessing/detector.py` — `load_faster_rcnn_model_old` is dead code kept "for backward compatibility" but never called

---

### m-5: `allow_origins=["*"]` in Production CORS

**File:** `main.py` (line ~95)

```python
allow_origins=["*"],  # Configure appropriately for production
```

The comment acknowledges this is unfinished. In production, this should be restricted to the actual frontend origin:

```python
allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
```

---

### m-6: `matplotlib` Imported but Only Used in Dead Commented Code

**File:** `translation/Pipeline2Integration.py` (line ~11)

```python
import matplotlib.pyplot as plt
```

This import is only used in the three commented-out visualization lines. Remove the import.

---

### m-7: Unused Import — `OccupancyMapBuilder`

**File:** `services/navigation_detector_service.py` (line ~23)

```python
from path_planning.occupancy_map import OccupancyMapBuilder
```

`OccupancyMapBuilder` is never instantiated or referenced anywhere in the file. Remove.

---

### m-8: `Image` Imported at Top Level but Also Re-imported Inside Method

**File:** `services/navigation_detector_service.py` (line ~18)

```python
from PIL import Image  # top of file

# Then inside _infer_freepath_from_array:
from PIL import Image  # redundant re-import
```

Remove the duplicate in-method import.

---

## Summary Table

| ID | Severity | File | Description |
|---|---|---|---|
| C-1 | **Critical** | `nav_phosphene_ws.py` | `send_fjson` typo — all broadcasts fail silently |
| C-2 | **Critical** | `navigation_detector_service.py` | `translator_lock` declared but never acquired — race condition |
| C-3 | **Critical** | `main.py` | `CUDA_VISIBLE_DEVICES` set after CUDA init — dead, misleading GPU selection |
| C-4 | **Critical** | `main.py` | Service init at module level — no lifespan, no shutdown, no error handling |
| C-5 | **Critical** | `navigation_detector_service.py` | `_frame_count` lazy init is thread-unsafe under parallel frame processing |
| C-6 | **Critical** | `navigation_detector_service.py` | Path traversal via unsanitized `frame_id` in debug file paths |
| M-1 | **Major** | Both service files | `Pipeline2Integration` loaded twice — doubles GPU memory |
| M-2 | **Major** | `navigation_detector_service.py` | Detection normalization block copy-pasted in `detect()` and `process_frame()` |
| M-3 | **Major** | `navigation_detector_service.py` | God Object — violates SRP across 8+ responsibilities |
| M-4 | **Major** | `navigation_detector_service.py` | `sys.path.insert` in service module — fragile path mutation |
| M-5 | **Major** | `navigation_detector_service.py` | Dead `confidence` variable assigned but never usefully applied |
| M-6 | **Major** | `navigation_detector_service.py` | `transforms.Compose` reconstructed every frame — per-frame allocation |
| M-7 | **Major** | `navigation_detector_service.py` | Duplicate `freepath_coordinates` assignment |
| M-8 | **Major** | `translator_service.py` | Shared `temp_json_path` has write race on concurrent lazy init |
| m-1 | Minor | Multiple | `print()` bypasses logging framework |
| m-2 | Minor | `navigation_detector_service.py` | Standard modules imported inside methods |
| m-3 | Minor | `nav_phosphene_ws.py` | Bare `except: pass` swallows `SystemExit` |
| m-4 | Minor | Multiple | Commented-out dead code throughout |
| m-5 | Minor | `main.py` | `allow_origins=["*"]` in CORS configuration |
| m-6 | Minor | `Pipeline2Integration.py` | Unused `matplotlib` import |
| m-7 | Minor | `navigation_detector_service.py` | Unused `OccupancyMapBuilder` import |
| m-8 | Minor | `navigation_detector_service.py` | Duplicate `from PIL import Image` import |

**Priority order for immediate action: C-1 → C-2 → C-3 → C-4 → C-5 → C-6.**  
C-1 and C-2 together mean the system currently delivers zero results to clients and has a live data race. Fix those two first.
