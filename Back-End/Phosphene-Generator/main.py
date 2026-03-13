

from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
import numpy as np

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
    
    while True:
        try:
            # ── 1. Pull from Layer 2 (Storage Buffer) ──
            frame = await buffer_manager.get_latest_frame()
            if frame is None:
                await asyncio.sleep(0.01)
                continue

            rgb_numpy: np.ndarray = frame["rgb"]     # shape (H, W, 4) uint8
            depth_numpy: np.ndarray = frame["depth"] # shape (H, W, 4) uint8 (from your test mode)

            # ── 2. Layer 3: AI Engine (GPU) ──
            # Uploads RGB to VRAM once, runs YOLO + DeepLab in parallel, returns to CPU
            detections, centerline = await vision_manager.process_frame(rgb_numpy)

            # ── 3. Layer 4: Scene Translator (CPU) ──
            translation_result = None
            if scene_translator is not None:
                translation_result = await asyncio.to_thread(
                    scene_translator.translate,
                    detections,
                    depth_numpy,
                    centerline,
                    (rgb_numpy.shape[1], rgb_numpy.shape[0]),
                )

            # translation_result now contains selected_objects + mapped freepath_ball.
            # Painting is intentionally separated and will be connected in the Painter phase.
            
            # ── 4. Layer 5: Pulse2Percept (CPU) - PLACEHOLDER ──
            # phosphene_image = await asyncio.to_thread(
            #     phosphene_simulator.simulate, geometric_canvas
            # )
            output_frame = rgb_numpy

            if translation_result and painter is not None:
                geometric_canvas = painter.paint(
                    translation_result["selected_objects"],
                    translation_result.get("freepath_ball")
                )
                # Convert 1D grayscale to typical RGBA since output stream expects [H,W,4]
                rgba_canvas = np.zeros((geometric_canvas.shape[0], geometric_canvas.shape[1], 4), dtype=np.uint8)
                rgba_canvas[:, :, 0] = geometric_canvas  # R
                rgba_canvas[:, :, 1] = geometric_canvas  # G
                rgba_canvas[:, :, 2] = geometric_canvas  # B
                rgba_canvas[:, :, 3] = 255               # A
                
                output_frame = rgba_canvas

            # ── 5. Output Packaging (Temporary Passthrough) ──
            # Until Layers 4 and 5 are built, we will just echo the processed frame.
            h, w = output_frame.shape[:2]
            packet = (
                w.to_bytes(4, byteorder='little') +
                h.to_bytes(4, byteorder='little') +
                output_frame.tobytes()
            )

            # Push to the output queue for the WebSocket to broadcast
            await buffer_manager.store_processed_frame(packet)
            
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
