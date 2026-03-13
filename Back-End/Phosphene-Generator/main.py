

from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
import numpy as np
import time

from Ingestion.binaryWebsocket import BinaryRouter
from Storage.frameBuffer import buffer_manager

from Engine import VisionManager
from Translator.translator import SceneTranslator
from Translator.painter import Painter
import json
import os

# ============================================================================
# Initialize Layer 3 (Vision AI Engine)
# ============================================================================

script_dir = os.path.dirname(os.path.abspath(__file__))
config_path = os.path.join(script_dir, "AiModel.config.json")
with open(config_path, "r") as config_file:
    config = json.load(config_file)

# Optional performance tracking controls.
# Can be set in AiModel.config.json or overridden via environment variables:
# - PHOSPHENE_PERF_TRACKING=true|false
# - PHOSPHENE_PERF_LOG_EVERY=<int>
PERF_TRACKING_ENABLED = str(
    os.getenv("PHOSPHENE_PERF_TRACKING", config.get("performance_tracking", False))
).lower() in {"1", "true", "yes", "on"}
PERF_LOG_EVERY = max(1, int(os.getenv("PHOSPHENE_PERF_LOG_EVERY", config.get("performance_log_every", 1))))

# Convert relative paths to absolute paths based on script directory
yolo_path = os.path.join(script_dir, config["yolo_path"])
deeplab_path = os.path.join(script_dir, config["deeplab_path"])
class_map_path = os.path.join(script_dir, config.get("yolo_class_map", ""))


vision_manager = None
scene_translator = None
painter = None

# 3. Create the Lifespan manager (This replaces @app.on_event("startup"))
@asynccontextmanager
async def lifespan(app: FastAPI):
    global vision_manager, scene_translator, painter
    print("🚀 Initializing AI Models (This will only happen ONCE now)...")
    
    # Initialize the heavy AI strictly inside the running worker process
    vision_manager = VisionManager(
        yolo_path=yolo_path,
        class_map_path=class_map_path,
        deeplab_path=deeplab_path
    )

    scene_translator = SceneTranslator()
    painter = Painter()
    
    print("🚀 AI Models Loaded. Starting background processor...")
    processor_task = asyncio.create_task(frame_processor())
    
    yield # The server runs while yielding here!
    
    # Clean up when you press CTRL+C
    print("🛑 Shutting down server...")
    processor_task.cancel()

# 4. Attach the lifespan to your FastAPI app
app = FastAPI(
    title="Phosphene Vision API",
    description="Object detection and phosphene shape translation service",
    version="2.0.0",
    lifespan=lifespan # ADD THIS HERE
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Background worker: buffer_manager input → buffer_manager output (passthrough for now)
# Replace the body here later with real processing (detection, phosphene gen)
# ============================================================================
# ============================================================================
# 5-Layer Architecture Orchestrator (Background Worker)
# ============================================================================
async def frame_processor():
    print("🔄 Frame processor started")
    if PERF_TRACKING_ENABLED:
        print(f"⏱️ Performance tracker enabled (log every {PERF_LOG_EVERY} frame(s))")

    perf_frame_count = 0
    last_frame_end = None
    
    while True:
        try:
            timings = None
            frame_start = None
            if PERF_TRACKING_ENABLED:
                timings = {}
                frame_start = time.perf_counter()
                if last_frame_end is not None:
                    timings["inter_frame_gap_ms"] = (frame_start - last_frame_end) * 1000

            # ── 1. Pull from Layer 2 (Storage Buffer) ──
            if PERF_TRACKING_ENABLED and timings is not None:
                timings["input_q_before"] = float(buffer_manager.input_queue_size)
            step_start = time.perf_counter() if PERF_TRACKING_ENABLED else None
            frame = await buffer_manager.get_latest_frame()
            pull_end = time.perf_counter() if PERF_TRACKING_ENABLED else None
            if PERF_TRACKING_ENABLED and timings is not None and step_start is not None:
                timings["pull_ms"] = ((pull_end - step_start) * 1000) if pull_end is not None else 0.0
                timings["input_q_after"] = float(buffer_manager.input_queue_size)

            if frame is None:
                await asyncio.sleep(0.01)
                continue

            step_start = time.perf_counter() if PERF_TRACKING_ENABLED else None
            rgb_numpy: np.ndarray = frame["rgb"]     # shape (H, W, 4) uint8
            depth_numpy: np.ndarray = frame["depth"] # shape (H, W, 4) uint8 (from your test mode)
            if PERF_TRACKING_ENABLED and timings is not None and step_start is not None:
                timings["frame_extract_ms"] = (time.perf_counter() - step_start) * 1000

                perf_meta = frame.get("_perf") if isinstance(frame, dict) else None
                if isinstance(perf_meta, dict):
                    timings["ing_recv_ms"] = float(perf_meta.get("ingest_receive_wait_ms", 0.0))
                    timings["ing_parse_ms"] = float(perf_meta.get("ingest_parse_ms", 0.0))
                    timings["ing_store_ms"] = float(perf_meta.get("ingest_store_ms", 0.0))
                    timings["ing_total_ms"] = float(perf_meta.get("ingest_total_ms", 0.0))

                    t_store_done = perf_meta.get("t_store_done_perf")
                    if t_store_done is not None and pull_end is not None:
                        timings["ing_to_pull_ms"] = (pull_end - float(t_store_done)) * 1000

                    t_ws_recv = perf_meta.get("t_ws_recv_perf")
                    if t_ws_recv is not None and pull_end is not None:
                        timings["ws_to_pull_ms"] = (pull_end - float(t_ws_recv)) * 1000

            # ── 2. Layer 3: AI Engine (GPU) ──
            # Uploads RGB to VRAM once, runs YOLO + DeepLab in parallel, returns to CPU
            step_start = time.perf_counter() if PERF_TRACKING_ENABLED else None
            detections, centerline = await vision_manager.process_frame(rgb_numpy)
            if PERF_TRACKING_ENABLED and timings is not None and step_start is not None:
                timings["ai_engine_ms"] = (time.perf_counter() - step_start) * 1000

            # ── 3. Layer 4: Scene Translator (CPU) ──
            translation_result = None
            if scene_translator is not None:
                step_start = time.perf_counter() if PERF_TRACKING_ENABLED else None
                translation_result = await asyncio.to_thread(
                    scene_translator.translate,
                    detections,
                    depth_numpy,
                    centerline,
                    (rgb_numpy.shape[1], rgb_numpy.shape[0]),
                )
                if PERF_TRACKING_ENABLED and timings is not None and step_start is not None:
                    timings["translator_ms"] = (time.perf_counter() - step_start) * 1000

            # translation_result now contains selected_objects + mapped freepath_ball.
            # Painting is intentionally separated and will be connected in the Painter phase.
            
            # ── 4. Layer 5: Pulse2Percept (CPU) - PLACEHOLDER ──
            # phosphene_image = await asyncio.to_thread(
            #     phosphene_simulator.simulate, geometric_canvas
            # )
            output_frame = rgb_numpy

            if translation_result and painter is not None:
                step_start = time.perf_counter() if PERF_TRACKING_ENABLED else None
                geometric_canvas = painter.paint(
                    translation_result["selected_objects"],
                    translation_result.get("freepath_ball")
                )
                if PERF_TRACKING_ENABLED and timings is not None and step_start is not None:
                    timings["paint_shapes_ms"] = (time.perf_counter() - step_start) * 1000

                # Convert 1D grayscale to typical RGBA since output stream expects [H,W,4]
                step_start = time.perf_counter() if PERF_TRACKING_ENABLED else None
                rgba_canvas = np.zeros((geometric_canvas.shape[0], geometric_canvas.shape[1], 4), dtype=np.uint8)
                rgba_canvas[:, :, 0] = geometric_canvas  # R
                rgba_canvas[:, :, 1] = geometric_canvas  # G
                rgba_canvas[:, :, 2] = geometric_canvas  # B
                rgba_canvas[:, :, 3] = 255               # A
                
                output_frame = rgba_canvas
                if PERF_TRACKING_ENABLED and timings is not None and step_start is not None:
                    timings["paint_rgba_ms"] = (time.perf_counter() - step_start) * 1000
                    timings["paint_ms"] = timings.get("paint_shapes_ms", 0.0) + timings.get("paint_rgba_ms", 0.0)
            elif PERF_TRACKING_ENABLED and timings is not None:
                timings["paint_shapes_ms"] = 0.0
                timings["paint_rgba_ms"] = 0.0
                timings["paint_ms"] = 0.0

            # ── 5. Output Packaging (Temporary Passthrough) ──
            # Until Layers 4 and 5 are built, we will just echo the processed frame.
            step_start = time.perf_counter() if PERF_TRACKING_ENABLED else None
            h, w = output_frame.shape[:2]
            packet = (
                w.to_bytes(4, byteorder='little') +
                h.to_bytes(4, byteorder='little') +
                output_frame.tobytes()
            )
            if PERF_TRACKING_ENABLED and timings is not None and step_start is not None:
                timings["package_ms"] = (time.perf_counter() - step_start) * 1000

            # Push to the output queue for the WebSocket to broadcast
            step_start = time.perf_counter() if PERF_TRACKING_ENABLED else None
            await buffer_manager.store_processed_frame(packet)
            if PERF_TRACKING_ENABLED and timings is not None and step_start is not None:
                timings["store_output_ms"] = (time.perf_counter() - step_start) * 1000
                timings["output_q_after"] = float(buffer_manager.output_queue_size)

            if PERF_TRACKING_ENABLED and timings is not None and frame_start is not None:
                timings["total_ms"] = (time.perf_counter() - frame_start) * 1000
                perf_frame_count += 1
                if perf_frame_count % PERF_LOG_EVERY == 0:
                    print(
                        "⏱️ Perf "
                        f"pull={timings.get('pull_ms', 0.0):.2f}ms | "
                        f"extract={timings.get('frame_extract_ms', 0.0):.2f}ms | "
                        f"ai={timings.get('ai_engine_ms', 0.0):.2f}ms | "
                        f"translate={timings.get('translator_ms', 0.0):.2f}ms | "
                        f"paint={timings.get('paint_ms', 0.0):.2f}ms "
                        f"(shapes={timings.get('paint_shapes_ms', 0.0):.2f}, rgba={timings.get('paint_rgba_ms', 0.0):.2f}) | "
                        f"package={timings.get('package_ms', 0.0):.2f}ms | "
                        f"store={timings.get('store_output_ms', 0.0):.2f}ms | "
                        f"ingest={timings.get('ing_total_ms', 0.0):.2f}ms "
                        f"(recv={timings.get('ing_recv_ms', 0.0):.2f}, parse={timings.get('ing_parse_ms', 0.0):.2f}, store={timings.get('ing_store_ms', 0.0):.2f}) | "
                        f"ing_to_pull={timings.get('ing_to_pull_ms', 0.0):.2f}ms | "
                        f"ws_to_pull={timings.get('ws_to_pull_ms', 0.0):.2f}ms | "
                        f"q_in={timings.get('input_q_before', 0.0):.0f}->{timings.get('input_q_after', 0.0):.0f} | "
                        f"q_out={timings.get('output_q_after', 0.0):.0f} | "
                        f"gap={timings.get('inter_frame_gap_ms', 0.0):.2f}ms | "
                        f"total={timings.get('total_ms', 0.0):.2f}ms"
                    )
                    last_frame_end = time.perf_counter()
            
        except Exception as e:
            import traceback
            print(f"❌ Error in frame_processor: {e}")
            traceback.print_exc()
            await asyncio.sleep(0.1)

# ============================================================================
# WebSocket Endpoints
# ============================================================================
app.include_router(BinaryRouter)

@app.websocket("/ws/output")
async def output_stream(websocket: WebSocket):
    """
    Streams processed frames from buffer_manager to the client.
    Each message: [4B width LE][4B height LE][RGBA bytes]
    """
    await websocket.accept()
    print("🟢 Output WebSocket connected")
    try:
        while True:
            packet = await buffer_manager.get_processed_frame()
            if packet is not None:
                await websocket.send_bytes(packet)
    except WebSocketDisconnect:
        print("🔴 Output WebSocket disconnected")
    except Exception as e:
        print(f"❌ Output WebSocket error: {e}")

# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
