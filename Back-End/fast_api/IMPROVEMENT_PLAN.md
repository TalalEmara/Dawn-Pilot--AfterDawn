# Improvement Plan & Learning Guide
## Phosphene Vision FastAPI Service

---

# PART 1 — Fix Plan (Prioritized Execution Order)

## Phase 0 — One-Line Showstopper (30 minutes)

This must be done before anything else. The system is completely non-functional without it.

### Fix C-1: `send_fjson` → `send_json`
 Role: Act as a Senior Staff Software Engineer and Technical Lead with expertise in [insert languages/frameworks, e.g., Python, FastAPI, PyTorch, and concurrent programming].

Task: Perform a rigorous, detailed technical code review of the attached codebase/files.

Context: This code is for [briefly describe the project, e.g., a real-time computer vision API for a visual prosthesis]. The primary goals for this system are [e.g., extremely low latency, high concurrency, and GPU memory efficiency].

Please analyze the code and structure your review across the following categories. For every issue found, explicitly mention the file name/location, explain why it is an issue, and provide an actionable code snippet showing how to fix it.

1. Critical Bugs & Logic Errors

Identify any race conditions, thread-safety issues, or deadlocks.

Spot redundant/duplicate code, infinite loops, or incorrect state management.

Flag any resource leaks (e.g., unclosed files, unreleased memory, unmanaged database/GPU connections).

2. Architecture & System Design

Point out "God Objects" or classes/functions that violate the Single Responsibility Principle.

Identify tight coupling and suggest better design patterns (e.g., Dependency Injection, modularization).

Evaluate the initialization and teardown phases (e.g., global state pollution).

3. Performance & Scalability

Highlight blocking operations inside asynchronous event loops.

Identify inefficient algorithms, unnecessary data copying, or slow I/O operations.

Suggest optimizations for caching, concurrency, or hardware utilization.

4. Security & Error Handling

Find bare except: blocks or swallowed exceptions.

Identify missing input validation or unsafe deserialization.

Check for proper logging practices (e.g., using proper log levels, not logging sensitive data).

5. Code Quality, Readability, and Best Practices

Point out dead/commented-out code and unused imports.

Highlight inconsistent naming conventions or violations of standard style guides (e.g., PEP 8).

Suggest improvements for type hinting and docstrings.

Output Format:
Please categorize your findings into Critical (Fix Immediately), Major (Refactor Soon), and Minor (Nitpicks/Style). Do not just tell me what is wrong; write the exact code needed to fix the most critical issues.
**File:** `api/nav_phosphene_ws.py`

```python
# Find this line (~line 64):
await connection.send_fjson(message)

# Replace with:
await connection.send_json(message)
```

That single character typo prevents every single frame result from ever reaching any client.

---

## Phase 1 — Critical Safety Fixes (1–2 days)

These fixes prevent data corruption, security exploits, and silent failures.

### Fix C-2: Actually acquire `translator_lock`

**File:** `services/navigation_detector_service.py` → `process_full_pipeline()`

Find the call to `self.translator_service.translate(...)` and wrap it:

```python
with self.translator_lock:
    phosphene_b64, selected_objects, translate_meta = self.translator_service.translate(
        objects=detections,
        image_width=...,
        image_height=...,
        ...
    )
```

### Fix C-5: Move `_frame_count` to `__init__`

**File:** `services/navigation_detector_service.py` → `__init__()`

```python
# Add in __init__, near the translator_lock line:
self._frame_count = 0
self._frame_count_lock = threading.Lock()
```

Then in `process_frame()`, replace the lazy-init block:

```python
# REMOVE this:
if not hasattr(self, '_frame_count'):
    self._frame_count = 0
self._frame_count += 1

# REPLACE with:
with self._frame_count_lock:
    self._frame_count += 1
    frame_count = self._frame_count
```

### Fix C-6: Sanitize `frame_id` before using in file paths

**File:** `services/navigation_detector_service.py`

Add this utility method to the class:

```python
import re

def _sanitize_frame_id(self, frame_id) -> str:
    sanitized = re.sub(r'[^a-zA-Z0-9_\-]', '_', str(frame_id))
    return sanitized[:64]
```

Then replace every `f"...{frame_id}..."` path construction with:

```python
safe_id = self._sanitize_frame_id(frame_id)
debug_prefix = os.path.join(self.debug_output_dir, f"edge_mode_{safe_id}_{timestamp}")
```

---

## Phase 2 — Architecture Fixes (3–5 days)

These fixes improve startup reliability and resource management.

### Fix C-3: Move GPU selection before `import torch`

**File:** `main.py` — restructure the top of the file:

```python
#!/usr/bin/env python3
import os
import subprocess

def _select_nvidia_gpu() -> None:
    """Must run before torch is imported."""
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
        print("nvidia-smi not found — using default CUDA device")

_select_nvidia_gpu()

# NOW import torch
import torch
import logging
import uvicorn
...
```

### Fix C-4: Use FastAPI lifespan for service management

**File:** `main.py` — replace module-level service init:

```python
from contextlib import asynccontextmanager

_navigation_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _navigation_service
    logger.info("Startup: loading models...")
    _navigation_service = NavigationDetectorService(output_dir="api_output")

    import api.routes as routes_module
    routes_module.set_navigation_service(_navigation_service)
    import api.nav_phosphene_ws as nav_ws
    nav_ws.navigation_detector_service = _navigation_service

    logger.info("Startup complete.")
    yield

    logger.info("Shutdown: cleaning up...")
    if _navigation_service and _navigation_service.executor:
        _navigation_service.executor.shutdown(wait=False)

app = FastAPI(title="Phosphene Vision API", lifespan=lifespan)
```

---

## Phase 3 — Performance & DRY Refactors (1 week)

### Fix M-1: Eliminate duplicate `Pipeline2Integration`

1. In `TranslatorService.__init__`, add a `pipeline2` parameter:
   ```python
   def __init__(self, pipeline2: Pipeline2Integration, eager_init: bool = True):
       self.pipeline2 = pipeline2
       # remove: self.pipeline2 = Pipeline2Integration()
   ```
2. In `NavigationDetectorService.__init__`, pass the instance:
   ```python
   self.pipeline2 = Pipeline2Integration()
   self.translator_service = TranslatorService(pipeline2=self.pipeline2, eager_init=True)
   ```

### Fix M-2: Extract `_standardize_detection()` method

```python
def _standardize_detection(self, det: dict, frame_id=0) -> dict:
    bbox = [int(x) for x in det.get("bbox", [0, 0, 0, 0])]
    cx = int(bbox[0] + bbox[2] // 2)
    cy = int(bbox[1] + bbox[3] // 2)
    try:
        safe_confidence = float(det["detection_score"]) if det.get("detection_score") is not None else 0.001
    except (TypeError, ValueError):
        safe_confidence = 0.001
    try:
        safe_depth = float(det["depth_pixel"]) if det.get("depth_pixel") is not None else 128.0
    except (TypeError, ValueError):
        safe_depth = 128.0
    return {
        "class": str(det.get("class", "unknown")),
        "confidence": safe_confidence,
        "bbox": bbox,
        "centroid_px": [cx, cy],
        "depth_pixel": safe_depth,
    }
```

Replace both copy-pasted blocks in `detect()` and `process_frame()`:
```python
standardized_detections = [self._standardize_detection(d, frame_id) for d in detections]
```

### Fix M-6: Pre-build freepath transform

In `__init__`, after loading the freepath detector:
```python
from torchvision import transforms as T
self._freepath_transform = T.Compose([
    T.Resize((256, 256), interpolation=Image.BILINEAR),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])
```
Remove the `transforms.Compose([...])` block inside `_infer_freepath_from_array`.

### Fix M-7 + m-2 + m-7 + m-8: Quick cleanup

- Remove duplicate `freepath_coordinates = nav_result.get(...)` line
- Move all `import time`, `import json`, `import traceback`, etc. to module top
- Remove `from path_planning.occupancy_map import OccupancyMapBuilder` (unused)
- Remove the second `from PIL import Image` inside `_infer_freepath_from_array`

---

## Phase 4 — Hardening & Polish (ongoing)

### Replace all `print()` with `logger`

Global search-and-replace in the project:
- `print(f"✅ ..."`) → `logger.info("...")`
- `print(f"⚠️ ..."`) → `logger.warning("...")`
- `print(f"❌ ..."`) → `logger.error("...")`
- `print(f"🔄 ..."`) → `logger.debug("...")`

### Restrict CORS origins

```python
# main.py
allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
```

### Fix bare `except: pass`

```python
# api/nav_phosphene_ws.py
except Exception as e:
    logger.debug(f"WebSocket close suppressed: {e}")
```

### Remove dead commented-out code

- Remove `load_faster_rcnn_model_old` from `detector.py`
- Remove all `# plt.imshow / plt.show / plt.savefig` from `Pipeline2Integration.py`
- Remove `import matplotlib.pyplot as plt` from `Pipeline2Integration.py`
- Remove dead `confidence = 0.8` block in `process_frame()`

### Fix `temp_json_path` race (M-8)

In `translator_service.py`, replace the fixed shared path with a per-call temp file:

```python
import tempfile

# In translate(), when translator is None:
with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
    json.dump(detection_data, f)
    tmp_path = f.name

try:
    self.translator = Translator(tmp_path, ...)
finally:
    os.unlink(tmp_path)
```

---

## Phase Summary

| Phase | Time Estimate | What You Get |
|---|---|---|
| 0 — C-1 fix | 30 min | System actually delivers results to clients |
| 1 — C-2,5,6 | 1–2 days | Thread-safe, no data corruption, no path traversal |
| 2 — C-3,4 | 2–3 days | Reliable startup/shutdown, correct GPU targeting |
| 3 — M-1 to M-8 | 1 week | ~50% less GPU memory, no code duplication, faster inference |
| 4 — Hardening | Ongoing | Production-grade logging, security, observability |

---

---

# PART 2 — How to Recreate This Server From Scratch

## What This System Actually Is

A **real-time AI inference server** that:
1. Receives video frames over WebSocket from a 3D simulator
2. Runs a multi-stage CV pipeline (detection → segmentation → neural rendering)
3. Broadcasts results to multiple simultaneous clients (desktop + mobile viewer)

---

## What You Must Understand Before Building

### 1. Python Async & Concurrency (Most Important)

The single hardest concept in this codebase. You must understand all three levels:

| Level | Tool | When to Use |
|---|---|---|
| Async I/O | `asyncio`, `async/await` | Network I/O, WebSocket reads/writes |
| Thread pool | `asyncio.to_thread`, `ThreadPoolExecutor` | CPU-bound or blocking GPU code |
| True parallelism | `multiprocessing` | Bypassing Python GIL for CPU work |

**Key insight:** GPU inference (PyTorch) is blocking. You **must** run it in a thread via `asyncio.to_thread()`, otherwise the entire async event loop freezes and no WebSocket messages can be received or sent while inference runs.

**Study:**
- Python `asyncio` official docs — especially Tasks, Events, and `gather()`
- "Python Concurrency with `asyncio`" by Matthew Fowler (book)
- FastAPI docs on background tasks and WebSocket

---

### 2. FastAPI

The web framework used here. Key concepts to master:

- **WebSocket endpoints** — `@app.websocket("/path")`, `websocket.accept()`, `receive_json()`, `send_json()`
- **Lifespan events** — `@asynccontextmanager async def lifespan(app)` for startup/shutdown
- **Dependency Injection** — `Depends()` for passing services to routes
- **Middleware** — CORS, authentication
- **Pydantic models** — request/response validation

**Study:**
- FastAPI official docs (tiangolo.com/fastapi) — the best framework docs in Python
- Focus on: WebSockets, Background Tasks, Dependencies, Lifespan

---

### 3. PyTorch & GPU Programming

Required because every model in the pipeline runs on CUDA:

- **Device management** — `torch.device('cuda')`, `.to(device)`, `CUDA_VISIBLE_DEVICES`
- **Inference mode** — `torch.no_grad()`, `.eval()` vs `.train()`
- **Memory management** — `torch.cuda.empty_cache()`, `torch.cuda.synchronize()`
- **Model loading** — `torch.load()`, `load_state_dict()`, `weights_only=True`
- **Transforms pipeline** — `torchvision.transforms.Compose()`

**Study:**
- PyTorch official tutorials (pytorch.org/tutorials)
- "Deep Learning with PyTorch" (free official book)
- Focus on: inference pipelines, NOT training

---

### 4. Computer Vision with OpenCV & NumPy

Used for every frame manipulation:

- Image encoding/decoding — `cv2.imdecode`, `cv2.imencode`
- Color space conversions — `cv2.cvtColor` (BGR↔RGB, critical for ML models)
- Base64 encode/decode — how images travel over WebSocket as text
- NumPy array operations — shapes `(H, W, C)`, dtypes (`uint8`, `float32`)
- Image transforms — resize, flip, normalize

**Study:**
- OpenCV-Python Tutorials (docs.opencv.org)
- NumPy array indexing and broadcasting

---

### 5. WebSocket Protocol

The transport layer for real-time streaming:

- Full-duplex connection (both sides send/receive simultaneously)
- JSON message framing (the protocol used here)
- Connection lifecycle: connect → handshake → message loop → disconnect
- Heartbeat/ping-pong for connection keepalive
- Frame dropping strategy (latest-frame-wins, used here)

**Study:**
- MDN WebSocket docs
- FastAPI WebSocket docs
- RFC 6455 (optional deep dive)

---

### 6. Base64 Image Transport

How frames move between frontend (browser/Unity) and backend:

```
Unity renders frame
  → GPU framebuffer to CPU array
  → PNG/JPEG encode
  → base64 encode → string
  → send over WebSocket as JSON field
  → server: base64 decode → bytes → cv2.imdecode → numpy array → ML model
  → model output → numpy → cv2.imencode → base64 → JSON → WebSocket → client
```

Understand the cost: base64 adds ~33% size overhead. JPEG at quality=75 vs PNG is a major latency trade-off.

---

## Design Patterns You Need

### 1. Producer-Consumer Pattern ⭐ (Core of This System)

**What it solves:** Decouples the frame receiver from the frame processor so neither blocks the other.

```
Producer (async) ──► shared queue/state ──► Consumer (thread)
WebSocket receiver                          GPU inference
```

The current code uses a dictionary + `asyncio.Event` as the shared state. A cleaner approach uses `asyncio.Queue`:

```python
queue: asyncio.Queue = asyncio.Queue(maxsize=1)  # maxsize=1 = drop old frames

async def producer():
    while True:
        frame = await websocket.receive_json()
        try:
            queue.put_nowait(frame)       # non-blocking
        except asyncio.QueueFull:
            queue.get_nowait()            # drop old frame
            queue.put_nowait(frame)       # replace with new

async def consumer():
    while True:
        frame = await queue.get()
        result = await asyncio.to_thread(run_inference, frame)
        await broadcast(result)
```

**Study:** The Producer-Consumer pattern in concurrent programming.

---

### 2. Service Locator / Dependency Injection Pattern

**What it solves:** Avoids global mutable state (`navigation_detector_service = None` at module level).

The current code uses a poor-man's service locator (global variables set by `set_navigation_service()`). A better approach uses FastAPI's built-in DI:

```python
# Better: use FastAPI Depends()
def get_navigation_service() -> NavigationDetectorService:
    return app.state.navigation_service

@app.websocket("/ws/navigation-phosphene")
async def ws_endpoint(
    websocket: WebSocket,
    service: NavigationDetectorService = Depends(get_navigation_service)
):
    ...
```

**Study:** Dependency Injection pattern, FastAPI `Depends()`.

---

### 3. Strategy Pattern

**What it solves:** The pipeline has multiple stages (`passthrough`, `edge_mode`, `detector`, `translator`, `phosphene`). Currently handled by a giant if-elif chain in `process_full_pipeline()` (~200 lines). The Strategy pattern makes each stage a swappable object:

```python
class PipelineStage(Protocol):
    def process(self, context: PipelineContext) -> PipelineContext: ...

class PassthroughStage(PipelineStage):
    def process(self, ctx): ...

class DetectorStage(PipelineStage):
    def process(self, ctx): ...

STAGES = {
    "passthrough": PassthroughStage(),
    "detector": DetectorStage(),
    ...
}

def process(stage_name: str, ctx: PipelineContext):
    return STAGES[stage_name].process(ctx)
```

**Study:** Strategy pattern (Gang of Four), Python Protocols.

---

### 4. Singleton Pattern (with care)

**What it solves:** ML models are expensive to load (~3–10 seconds). You want exactly one instance per process.

The current code achieves this through module-level global variables. A cleaner approach is a proper singleton with thread-safe initialization:

```python
class ModelRegistry:
    _instance: 'ModelRegistry | None' = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> 'ModelRegistry':
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:  # double-checked locking
                    cls._instance = cls()
        return cls._instance
```

**Study:** Singleton pattern, double-checked locking, Python `__new__`.

---

### 5. Builder / Factory Pattern

**What it solves:** Model loading logic is complex and varies by model type (`yolo` vs `faster_rcnn`). Encapsulate it:

```python
class DetectorFactory:
    @staticmethod
    def create(model_type: str, model_path: str, class_map_path: str) -> ObjectDetector:
        if model_type == "yolo":
            return YOLODetector(model_path, class_map_path)
        elif model_type == "faster_rcnn":
            return FasterRCNNDetector(model_path, class_map_path)
        raise ValueError(f"Unknown model type: {model_type}")
```

**Study:** Factory Method pattern, Abstract Factory pattern.

---

### 6. Observer / Fan-out Pattern

**What it solves:** Broadcasting results to multiple WebSocket clients. Currently `ConnectionManager.broadcast()` does this. The formal pattern is:

```
Event source (inference result)
    │
    ├──► Client 1 (Desktop)
    ├──► Client 2 (Mobile viewer)
    └──► Client 3 (Debug monitor)
```

**Study:** Observer pattern, Pub/Sub architecture.

---

## Architecture to Study

### 1. Event-Driven Architecture

The entire system is event-driven: a "frame received" event triggers the pipeline. Understanding this pattern is essential for real-time systems. Study:
- Event loop mechanics
- Event sourcing (advanced, for future)
- Message queues (Redis Streams, RabbitMQ) for scaling beyond one server

### 2. Pipeline Architecture

The CV processing is a classic pipeline: each stage transforms data and passes it to the next. Study:
- Unix pipe philosophy
- Apache Beam / Kafka Streams (same concept, distributed)
- How to make pipelines cancellable and observable

### 3. Clean Architecture (Layers)

The current code mixes concerns. Clean Architecture separates:

```
┌─────────────────────────────────┐
│  Delivery Layer (API/WebSocket) │  ← api/routes.py, nav_phosphene_ws.py
├─────────────────────────────────┤
│  Application Layer (Use Cases)  │  ← process_full_pipeline()
├─────────────────────────────────┤
│  Domain Layer (Business Logic)  │  ← detection, translation, phosphene
├─────────────────────────────────┤
│  Infrastructure Layer           │  ← model loading, file I/O, GPU
└─────────────────────────────────┘
```

**Rule:** Inner layers know nothing about outer layers. Domain logic doesn't know about WebSocket or FastAPI.

**Study:** "Clean Architecture" by Robert C. Martin, Hexagonal Architecture (Ports and Adapters).

### 4. SOLID Principles

The most violated principle in this codebase is **Single Responsibility (S)**. Study all five:
- **S** — One class = one reason to change
- **O** — Open for extension, closed for modification (add new pipeline stages without modifying existing code)
- **L** — Substitutability (any `ObjectDetector` implementation should be swappable)
- **I** — Don't force classes to implement interfaces they don't use
- **D** — Depend on abstractions, not concrete implementations (inject `Pipeline2Integration`, don't construct it inside `TranslatorService`)

---

## Technology Stack Summary

| Layer | Technology | What to Learn |
|---|---|---|
| Web framework | FastAPI + Uvicorn | Routes, WebSocket, Lifespan, DI |
| Async runtime | Python asyncio | Event loop, Tasks, Events, Queues |
| ML inference | PyTorch + torchvision | Model loading, CUDA, no_grad, transforms |
| Object detection | Ultralytics YOLO, Faster R-CNN | Inference API, output format |
| Segmentation | DeepLabV3 (torchvision) | Semantic segmentation, mask output |
| Image processing | OpenCV, NumPy, Pillow | Color spaces, encode/decode, array ops |
| Transport | WebSocket + base64 | Frame protocol, binary vs text frames |
| Configuration | JSON config files | Environment-based config (12-factor app) |
| Concurrency | threading.Lock, ThreadPoolExecutor | Thread safety, GIL limitations |

---

## Recommended Study Order

1. **Python async/await** — 1 week — this is the hardest and most critical
2. **FastAPI** (WebSocket section especially) — 3 days
3. **PyTorch inference basics** — 3 days (just inference, not training)
4. **OpenCV + NumPy** — 2 days
5. **SOLID + Design Patterns** — ongoing (read Gang of Four, apply while coding)
6. **Clean Architecture** — after your first refactor, read the theory

---

## Recommended Resources

| Topic | Resource |
|---|---|
| Python async | "Python Concurrency with asyncio" — Matthew Fowler |
| FastAPI | fastapi.tiangolo.com (official docs are exceptional) |
| PyTorch | pytorch.org/tutorials — "Introduction to PyTorch" path |
| Design Patterns | "Head First Design Patterns" (approachable) or Gang of Four (reference) |
| Clean Architecture | "Clean Architecture" — Robert C. Martin |
| System Design | "Designing Data-Intensive Applications" — Martin Kleppmann (advanced) |
| Computer Vision | "Programming Computer Vision with Python" — Jan Erik Solem (free PDF) |
