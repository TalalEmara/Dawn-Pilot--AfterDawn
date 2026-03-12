from html import parser
import time
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio

# Import our separated components
from Storage.frameBuffer import buffer_manager
from .frameparser import BinaryFrameParser

# Create a router so we can easily plug this into main.py
BinaryRouter = APIRouter()
BinaryParser = BinaryFrameParser()

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
            raw_bytes = await websocket.receive_bytes()
            try:
                frame_data = BinaryParser.parse_frame(raw_bytes)
            except ValueError as e:
                print(f"❌ Frame Parser Error: {e}")
                continue
            except RuntimeError as e:
                print(f"❌ Frame Parser State Error: {e}")
                continue
            
            frame_stored = await buffer_manager.store_frame(frame_data)
            if not frame_stored:
                print("📊 Ingestion Stats: Frame dropped due to processing backlog")
                
    except WebSocketDisconnect:
        print("🔴 Ingestion Layer: Client Disconnected")
    except Exception as e:
        print(f"❌ Ingestion Layer Error: {e}")