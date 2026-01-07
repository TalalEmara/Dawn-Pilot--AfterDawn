"""
Frame Buffer for Real-Time WebSocket Processing

Implements a single-slot buffer that always keeps the latest frame,
automatically dropping older frames to prevent backlog and latency buildup.

Perfect for real-time navigation where only the most recent sensor data matters.
"""

import asyncio
import time
import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class FrameData:
    """Container for frame data with metadata"""
    frame_id: str
    rgb: Any  # numpy array
    depth: Any  # numpy array
    stage: str
    debug_mode: bool
    cropping_config: Optional[Dict] = None
    timestamp: float = None  # Unix timestamp in seconds
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = time.time()
    
    def age_ms(self) -> float:
        """Get age of frame in milliseconds"""
        return (time.time() - self.timestamp) * 1000


class LatestFrameBuffer:
    """
    Single-slot buffer that always keeps the latest frame.
    
    Key features:
    - Zero latency growth (no queue buildup)
    - Automatic frame dropping (old frames overwritten)
    - Thread-safe for async producer-consumer pattern
    - Metrics tracking (dropped frames, processing rate)
    
    Usage:
        buffer = LatestFrameBuffer()
        
        # Producer (WebSocket receiver)
        await buffer.put(frame_data)
        
        # Consumer (Background processor)
        frame = await buffer.get_latest()
    """
    
    def __init__(self, max_frame_age_ms: float = 1000.0):
        """
        Initialize frame buffer
        
        Args:
            max_frame_age_ms: Maximum age in milliseconds before frame is considered stale
        """
        self._lock = asyncio.Lock()
        self._current_frame: Optional[FrameData] = None
        self._has_frame = asyncio.Event()
        
        # Configuration
        self.max_frame_age_ms = max_frame_age_ms
        
        # Metrics
        self._total_received = 0
        self._total_processed = 0
        self._total_dropped = 0
        self._total_stale = 0
        self._last_metrics_time = time.time()
        self._metrics_interval = 30.0  # Log metrics every 30 seconds
    
    async def put(self, frame_data: FrameData) -> bool:
        """
        Add frame to buffer (overwrites any existing frame)
        
        Args:
            frame_data: Frame data to add
            
        Returns:
            bool: True if frame was added, False if rejected (should not happen)
        """
        async with self._lock:
            # Check if we're overwriting an unprocessed frame
            if self._current_frame is not None:
                self._total_dropped += 1
                logger.debug(f"⏭️  Dropped frame {self._current_frame.frame_id} "
                           f"(age: {self._current_frame.age_ms():.1f}ms) - overwritten by {frame_data.frame_id}")
            
            self._current_frame = frame_data
            self._total_received += 1
            self._has_frame.set()
            
            # Periodic metrics logging
            self._log_metrics_if_needed()
            
            return True
    
    async def get_latest(self) -> Optional[FrameData]:
        """
        Get latest frame (blocking until frame available)
        
        Returns:
            FrameData or None: Latest frame, or None if stale
        """
        # Wait for frame to be available
        await self._has_frame.wait()
        
        async with self._lock:
            frame = self._current_frame
            self._current_frame = None
            self._has_frame.clear()
            
            # Check if frame is too old (staleness check)
            if frame and frame.age_ms() > self.max_frame_age_ms:
                self._total_stale += 1
                logger.warning(f"⏰ Frame {frame.frame_id} is stale ({frame.age_ms():.1f}ms > {self.max_frame_age_ms}ms) - skipping")
                return None
            
            if frame:
                self._total_processed += 1
                logger.debug(f"✅ Processing frame {frame.frame_id} (age: {frame.age_ms():.1f}ms)")
            
            return frame
    
    def _log_metrics_if_needed(self):
        """Log metrics every N seconds"""
        current_time = time.time()
        elapsed = current_time - self._last_metrics_time
        
        if elapsed >= self._metrics_interval:
            self._log_metrics(elapsed)
            self._last_metrics_time = current_time
    
    def _log_metrics(self, elapsed: float):
        """Log buffer performance metrics"""
        if self._total_received == 0:
            return
        
        drop_rate = (self._total_dropped / self._total_received) * 100
        input_fps = self._total_received / elapsed
        output_fps = self._total_processed / elapsed
        
        logger.info(
            f"\n{'='*70}\n"
            f"📊 FRAME BUFFER METRICS (last {elapsed:.1f}s)\n"
            f"{'='*70}\n"
            f"  Received:    {self._total_received:4d} frames ({input_fps:5.2f} fps)\n"
            f"  Processed:   {self._total_processed:4d} frames ({output_fps:5.2f} fps)\n"
            f"  Dropped:     {self._total_dropped:4d} frames ({drop_rate:5.1f}%)\n"
            f"  Stale:       {self._total_stale:4d} frames\n"
            f"  Efficiency:  {(1 - drop_rate/100)*100:5.1f}% processed\n"
            f"{'='*70}\n"
        )
        
        # Reset counters for next interval
        self._total_received = 0
        self._total_processed = 0
        self._total_dropped = 0
        self._total_stale = 0
    
    def get_current_metrics(self) -> Dict[str, Any]:
        """Get current buffer metrics without logging"""
        return {
            "total_received": self._total_received,
            "total_processed": self._total_processed,
            "total_dropped": self._total_dropped,
            "total_stale": self._total_stale,
            "drop_rate": (self._total_dropped / self._total_received * 100) if self._total_received > 0 else 0
        }
    
    async def clear(self):
        """Clear buffer and reset state"""
        async with self._lock:
            self._current_frame = None
            self._has_frame.clear()
    
    async def has_pending_frame(self) -> bool:
        """Check if buffer has a pending frame"""
        async with self._lock:
            return self._current_frame is not None


class FrameBufferConfig:
    """Configuration for frame buffer behavior"""
    
    def __init__(
        self,
        enabled: bool = True,
        max_frame_age_ms: float = 1000.0,
        metrics_interval_seconds: float = 30.0
    ):
        """
        Initialize frame buffer configuration
        
        Args:
            enabled: Enable frame buffer (if False, falls back to synchronous processing)
            max_frame_age_ms: Maximum frame age before considered stale
            metrics_interval_seconds: How often to log metrics
        """
        self.enabled = enabled
        self.max_frame_age_ms = max_frame_age_ms
        self.metrics_interval_seconds = metrics_interval_seconds
    
    @classmethod
    def from_dict(cls, config: Dict[str, Any]) -> 'FrameBufferConfig':
        """Create config from dictionary"""
        return cls(
            enabled=config.get("enabled", True),
            max_frame_age_ms=config.get("max_frame_age_ms", 1000.0),
            metrics_interval_seconds=config.get("metrics_interval_seconds", 30.0)
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert config to dictionary"""
        return {
            "enabled": self.enabled,
            "max_frame_age_ms": self.max_frame_age_ms,
            "metrics_interval_seconds": self.metrics_interval_seconds
        }
