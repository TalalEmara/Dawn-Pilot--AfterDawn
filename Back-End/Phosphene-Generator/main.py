

from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
import numpy as np

from Ingestion.binaryWebsocket import BinaryRouter
from Storage.frameBuffer import buffer_manager


# ============================================================================
# Create FastAPI Application
# ============================================================================

app = FastAPI(
    title="Phosphene Vision API",
    description="Object detection and phosphene shape translation service",
    version="2.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active peer connections (optional, good for cleanup)
peerConnections = set()

# ============================================================================
# Background worker: buffer_manager input → buffer_manager output (passthrough for now)
# Replace the body here later with real processing (detection, phosphene gen)
# ============================================================================
async def frame_processor():
    print("🔄 Frame processor started")
    while True:
        frame = await buffer_manager.get_latest_frame()
        rgb: np.ndarray = frame["rgb"]   # shape (H, W, 4) uint8

        # ── Build output packet: [4B width][4B height][RGBA bytes] ──
        h, w = rgb.shape[:2]
        packet = (
            w.to_bytes(4, byteorder='little') +
            h.to_bytes(4, byteorder='little') +
            rgb.tobytes()
        )

        # Store processed frame using buffer manager
        await buffer_manager.store_processed_frame(packet)

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

@app.on_event("startup")
async def startup_event():
    print("🚀 FastAPI Streaming Server Started")
    asyncio.create_task(frame_processor())
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
