from html import parser
import time
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import os

# Import our separated components
from Storage.frameBuffer import buffer_manager
from .frameparser import BinaryFrameParser

# Create a router so we can easily plug this into main.py
BinaryRouter = APIRouter()
BinaryParser = BinaryFrameParser()
INGEST_PERF_ENABLED = str(os.getenv("PHOSPHENE_PERF_TRACKING", "false")).lower() in {"1", "true", "yes", "on"}

@BinaryRouter.websocket("/ws/frames")
async def frame_ingestion(websocket: WebSocket):
    """
    Layer 1: Ingestion
    Receives raw binary frames from the A-Frame frontend and pushes them
    into Layer 2 buffer using clean separation of concerns.
    Uses header caching for optimal performance.
    """
    await websocket.accept()
    print("🟢 Ingestion Layer: Binary WebSocket Connected!")
    
    
    
    try:
        while True:
            recv_start = time.perf_counter() if INGEST_PERF_ENABLED else None
            raw_bytes = await websocket.receive_bytes()
            recv_end = time.perf_counter() if INGEST_PERF_ENABLED else None

            parse_start = time.perf_counter() if INGEST_PERF_ENABLED else None
            try:
                frame_data = BinaryParser.parse_frame(raw_bytes)
            except ValueError as e:
                print(f"❌ Frame Parser Error: {e}")
                continue
            except RuntimeError as e:
                print(f"❌ Frame Parser State Error: {e}")
                continue

            parse_end = time.perf_counter() if INGEST_PERF_ENABLED else None

            if INGEST_PERF_ENABLED and recv_start is not None and recv_end is not None and parse_start is not None and parse_end is not None:
                frame_data["_perf"] = {
                    "ingest_receive_wait_ms": (recv_end - recv_start) * 1000,
                    "ingest_parse_ms": (parse_end - parse_start) * 1000,
                    "t_ws_recv_perf": recv_end,
                }
            
            store_start = time.perf_counter() if INGEST_PERF_ENABLED else None
            frame_stored = await buffer_manager.store_frame(frame_data)
            store_end = time.perf_counter() if INGEST_PERF_ENABLED else None

            if (
                INGEST_PERF_ENABLED
                and frame_stored
                and "_perf" in frame_data
                and store_start is not None
                and store_end is not None
                and parse_end is not None
            ):
                frame_data["_perf"]["ingest_store_ms"] = (store_end - store_start) * 1000
                frame_data["_perf"]["ingest_total_ms"] = (store_end - parse_start) * 1000 if parse_start is not None else 0.0
                frame_data["_perf"]["t_store_done_perf"] = store_end

            if not frame_stored:
                print("📊 Ingestion Stats: Frame dropped due to processing backlog")
                
    except WebSocketDisconnect:
        print("🔴 Ingestion Layer: Client Disconnected")
    except Exception as e:
        print(f"❌ Ingestion Layer Error: {e}")