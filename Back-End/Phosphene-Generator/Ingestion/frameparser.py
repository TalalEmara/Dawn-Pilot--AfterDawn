import numpy as np
from typing import Tuple, Dict, Optional
# Bugs
# changing the resolution after connection causes bugs

class BinaryFrameParser:
    """
    Layer 1 Component: Binary Frame Parser
    Responsible for parsing the raw binary data received from the network.
    Caches header information after first parse for performance optimization.

    Frame format: [4B RGB Size][4B Width][4B Height][RGB Data][Depth Data]
    """

    def __init__(self):
        """Initialize parser with empty header cache."""
        self._header_initialized = False
        self._rgb_size: Optional[int] = None
        self._width: Optional[int] = None
        self._height: Optional[int] = None

    @staticmethod
    def _parse_header_from_bytes(raw_bytes: bytes) -> Tuple[int, int, int]:
        """
        Parse the 12-byte header from raw binary data.
        
        Args:
            raw_bytes: Raw bytes from websocket
            
        Returns:
            Tuple of (rgb_size, width, height)
        """
        if len(raw_bytes) < 12:
            raise ValueError(f"Invalid header: expected at least 12 bytes, got {len(raw_bytes)}")
        
        rgb_size = int.from_bytes(raw_bytes[0:4], byteorder='little')
        width = int.from_bytes(raw_bytes[4:8], byteorder='little')
        height = int.from_bytes(raw_bytes[8:12], byteorder='little')
        
        return rgb_size, width, height

    def _initialize_header(self, raw_bytes: bytes) -> None:
        """
        Initialize header information from the first frame.
        
        Args:
            raw_bytes: Raw bytes containing header
        """

        self._rgb_size, self._width, self._height = self._parse_header_from_bytes(raw_bytes)
        self._header_initialized = True
        print(f"📏 Frame Parser: Header initialized - {self._width}x{self._height}, RGB size: {self._rgb_size} bytes")

    def extract_frame_data(self, raw_bytes: bytes) -> Dict[str, np.ndarray]:
        """
        Extract RGB and Depth arrays using cached header information.
        
        Args:
            raw_bytes: Raw bytes from websocket
            
        Returns:
            Dictionary containing 'rgb' and 'depth' numpy arrays
        """
        if not self._header_initialized:
            raise RuntimeError("Header not initialized. Call parse_frame() first.")

        expected_size = 12 + self._rgb_size
        if len(raw_bytes) < expected_size:
            raise ValueError(f"Invalid frame data: expected at least {expected_size} bytes, got {len(raw_bytes)}")

        # Extract RGB Array (zero-copy, skip header)
        rgb_raw = raw_bytes[12:12 + self._rgb_size]
        rgb_array = np.frombuffer(rgb_raw, dtype=np.uint8).reshape((self._height, self._width, 4))

        # Extract Depth Array (sent as RGBA copy — test mode)
        depth_raw = raw_bytes[12 + self._rgb_size:]
        depth_array = np.frombuffer(depth_raw, dtype=np.uint8).reshape((self._height, self._width, 4))

        return {
            "rgb": rgb_array,
            "depth": depth_array
        }

    def parse_frame(self, raw_bytes: bytes) -> Dict[str, np.ndarray]:
        """
        Parse frame with header caching optimization.
        First call: Parse header + cache it + extract data
        Subsequent calls: Use cached header + extract data only
        
        Args:
            raw_bytes: Raw bytes from websocket
            
        Returns:
            Dictionary containing 'rgb' and 'depth' numpy arrays
        """
        if not self._header_initialized:
            self._initialize_header(raw_bytes)
        
        return self.extract_frame_data(raw_bytes)

    def reset_header(self) -> None:
        """Reset header cache. Next frame will re-parse header."""
        self._header_initialized = False
        self._rgb_size = None
        self._width = None
        self._height = None
        print("🔄 Frame Parser: Header cache reset")

    @property
    def is_initialized(self) -> bool:
        """Check if header has been parsed and cached."""
        return self._header_initialized

    @property
    def frame_dimensions(self) -> Optional[Tuple[int, int]]:
        """Get cached frame dimensions (width, height) or None if not initialized."""
        if self._header_initialized:
            return (self._width, self._height)
        return None

    @property
    def rgb_size(self) -> Optional[int]:
        """Get cached RGB data size or None if not initialized."""
        return self._rgb_size if self._header_initialized else None