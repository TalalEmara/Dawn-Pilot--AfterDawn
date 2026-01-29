"""
Core Utilities Package

Common utility functions for image processing, depth handling, and file cleanup.
"""

from .image_utils import (
    decode_base64_image,
    decode_base64_to_rgb,
    encode_ndarray_to_base64,
    decode_depth_map,
    save_debug_images,
    add_frame_id_overlay
)

from .depth_utils import assign_depth_to_detections

from .cleanup import cleanup_old_files

__all__ = [
    "decode_base64_image",
    "decode_base64_to_rgb",
    "encode_ndarray_to_base64",
    "decode_depth_map",
    "save_debug_images",
    "add_frame_id_overlay",
    "assign_depth_to_detections",
    "cleanup_old_files",
]
