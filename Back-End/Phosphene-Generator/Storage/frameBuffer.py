import asyncio
from typing import Dict, Optional
import numpy as np


class FrameBufferManager:
    """
    Layer 2: Storage/Buffer Layer
    Manages the frame queues and handles backpressure for real-time video processing.
    Encapsulates all queue operations to maintain clean separation of concerns.
    """
    
    def __init__(self, input_queue_size: int = 2, output_queue_size: int = 2):
        """
        Initialize the frame buffer manager.
        
        Args:
            input_queue_size: Max frames in input queue (prevents memory buildup)
            output_queue_size: Max frames in output queue
        """
        # Queue for incoming frames from ingestion layer
        self._input_queue = asyncio.Queue(maxsize=input_queue_size)
        
        # Queue for processed frames going to output layer
        self._output_queue = asyncio.Queue(maxsize=output_queue_size)
    
    async def store_frame(self, frame_data: Dict[str, np.ndarray]) -> bool:
        """
        Store a new frame in the input buffer with backpressure handling.
        
        Args:
            frame_data: Dictionary containing 'rgb' and 'depth' arrays
            
        Returns:
            True if frame was stored, False if dropped due to backpressure
        """
        # Handle backpressure: Drop oldest frame if queue is full
        if self._input_queue.full():
            try:
                # Remove the oldest frame in the bucket
                dropped_frame = self._input_queue.get_nowait()
                print("⚠️ Buffer Layer: Dropped old frame due to backpressure")
                del dropped_frame  # Help with memory cleanup
            except asyncio.QueueEmpty:
                pass
        
        # Push the brand new frame into the buffer
        await self._input_queue.put(frame_data)
        return True
    
    async def get_latest_frame(self) -> Optional[Dict[str, np.ndarray]]:
        """
        Retrieve the latest frame from the input buffer.
        
        Returns:
            Frame data dictionary or None if no frames available
        """
        try:
            return await self._input_queue.get()
        except asyncio.QueueEmpty:
            return None
    
    def get_latest_frame_nowait(self) -> Optional[Dict[str, np.ndarray]]:
        """
        Retrieve the latest frame from the input buffer (non-blocking).
        
        Returns:
            Frame data dictionary or None if no frames available
        """
        try:
            return self._input_queue.get_nowait()
        except asyncio.QueueEmpty:
            return None
    
    async def store_processed_frame(self, processed_data: Dict) -> bool:
        """
        Store processed frame data in the output buffer.
        
        Args:
            processed_data: Processed frame data from AI layer
            
        Returns:
            True if stored successfully, False if dropped
        """
        if self._output_queue.full():
            try:
                dropped_frame = self._output_queue.get_nowait()
                print("⚠️ Buffer Layer: Dropped old processed frame")
                del dropped_frame
            except asyncio.QueueEmpty:
                pass
        
        await self._output_queue.put(processed_data)
        return True
    
    async def get_processed_frame(self) -> Optional[Dict]:
        """
        Retrieve processed frame from output buffer.
        
        Returns:
            Processed frame data or None if no frames available
        """
        try:
            return await self._output_queue.get()
        except asyncio.QueueEmpty:
            return None
    
    @property
    def input_queue_size(self) -> int:
        """Get current size of input queue."""
        return self._input_queue.qsize()
    
    @property
    def output_queue_size(self) -> int:
        """Get current size of output queue."""
        return self._output_queue.qsize()
    
    def is_input_queue_empty(self) -> bool:
        """Check if input queue is empty."""
        return self._input_queue.empty()
    
    def is_output_queue_empty(self) -> bool:
        """Check if output queue is empty."""
        return self._output_queue.empty()


# Create a global instance for the application
buffer_manager = FrameBufferManager()

# For backward compatibility, keep these as aliases
frame_queue = buffer_manager._input_queue  
output_queue = buffer_manager._output_queue  