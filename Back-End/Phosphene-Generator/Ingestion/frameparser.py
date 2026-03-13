import numpy as np
from typing import Tuple, Dict, Optional
# Bugs
# changing the resolution after connection causes bugs

class BinaryFrameParser:
    """
    Layer 1 Component: Binary Frame Parser
    Responsible for parsing the raw binary data received from the network.
    Caches header information after first parse for performance optimization.

    Frame formats:
    - v2: [4B RGB Size][4B Width][4B Height][4B Depth Size][RGB Data][Depth Data]
    - v1: [4B RGB Size][4B Width][4B Height][RGB Data][Depth Data]
    """

    def __init__(self):
        """Initialize parser with empty header cache."""
        self._header_initialized = False
        self._rgb_size: Optional[int] = None
        self._width: Optional[int] = None
        self._height: Optional[int] = None
        self._depth_size: Optional[int] = None
        self._header_size: int = 12

    @staticmethod
    def _parse_header_from_bytes(raw_bytes: bytes) -> Tuple[int, int, int, Optional[int], int]:
        """
        Parse the 12-byte header from raw binary data.
        
        Args:
            raw_bytes: Raw bytes from websocket
            
        Returns:
            Tuple of (rgb_size, width, height, depth_size, header_size)
        """
        if len(raw_bytes) < 12:
            raise ValueError(f"Invalid header: expected at least 12 bytes, got {len(raw_bytes)}")
        
        rgb_size = int.from_bytes(raw_bytes[0:4], byteorder='little')
        width = int.from_bytes(raw_bytes[4:8], byteorder='little')
        height = int.from_bytes(raw_bytes[8:12], byteorder='little')

        # Try parsing v2 header first, with strict size sanity checks.
        if len(raw_bytes) >= 16:
            depth_size_v2 = int.from_bytes(raw_bytes[12:16], byteorder='little')
            expected_v2 = 16 + rgb_size + depth_size_v2
            if depth_size_v2 > 0 and len(raw_bytes) >= expected_v2:
                return rgb_size, width, height, depth_size_v2, 16
        
        # Fallback v1 where depth occupies the remaining payload.
        return rgb_size, width, height, None, 12

    def _initialize_header(self, raw_bytes: bytes) -> None:
        """
        Initialize header information from the first frame.
        
        Args:
            raw_bytes: Raw bytes containing header
        """

        self._rgb_size, self._width, self._height, self._depth_size, self._header_size = self._parse_header_from_bytes(raw_bytes)
        self._header_initialized = True
        if self._depth_size is not None:
            print(
                f"📏 Frame Parser: Header(v2) initialized - {self._width}x{self._height}, "
                f"RGB size: {self._rgb_size} bytes, Depth size: {self._depth_size} bytes"
            )
        else:
            print(
                f"📏 Frame Parser: Header(v1) initialized - {self._width}x{self._height}, "
                f"RGB size: {self._rgb_size} bytes"
            )

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

        if self._header_size == 16 and self._depth_size is not None:
            expected_size = 16 + self._rgb_size + self._depth_size
            if len(raw_bytes) < expected_size:
                raise ValueError(f"Invalid frame data(v2): expected at least {expected_size} bytes, got {len(raw_bytes)}")
        else:
            expected_size = 12 + self._rgb_size
            if len(raw_bytes) < expected_size:
                raise ValueError(f"Invalid frame data(v1): expected at least {expected_size} bytes, got {len(raw_bytes)}")

        # Extract RGB Array (zero-copy, skip header)
        rgb_start = self._header_size
        rgb_end = rgb_start + self._rgb_size
        rgb_raw = raw_bytes[rgb_start:rgb_end]
        rgb_array = np.frombuffer(rgb_raw, dtype=np.uint8).reshape((self._height, self._width, 4))

        # Extract Depth Array
        if self._header_size == 16 and self._depth_size is not None:
            depth_raw = raw_bytes[rgb_end:rgb_end + self._depth_size]
        else:
            depth_raw = raw_bytes[rgb_end:]

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
        self._depth_size = None
        self._header_size = 12
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