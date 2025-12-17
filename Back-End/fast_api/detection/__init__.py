"""
Detection Module

Object detection implementations including YOLO, Faster R-CNN, and mock detector.
"""

# Only export create_detector function, which will handle lazy imports
# to avoid import errors when dependencies aren't installed
try:
    from .realtime_detector import create_detector as _create_detector
except ImportError:
    _create_detector = None

from .mock_detector import create_mock_detector

def create_detector(*args, **kwargs):
    """Create detector - delegates to realtime_detector if available"""
    if _create_detector is None:
        raise ImportError(
            "realtime_detector dependencies not available. "
            "Install with: pip install ultralytics torch torchvision"
        )
    return _create_detector(*args, **kwargs)

__all__ = [
    "create_detector",
    "create_mock_detector",
]
