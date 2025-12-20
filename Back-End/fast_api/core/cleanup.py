"""
File Cleanup Utilities

Background tasks for cleaning up temporary files.
"""

import os
import time
import logging

logger = logging.getLogger(__name__)


def cleanup_old_files(directory: str, max_age_seconds: int = 3600):
    """
    Background task to cleanup old temporary files
    
    Args:
        directory: Directory to clean up
        max_age_seconds: Maximum age of files to keep (default: 1 hour)
    """
    try:
        current_time = time.time()
        for filename in os.listdir(directory):
            filepath = os.path.join(directory, filename)
            if os.path.isfile(filepath):
                file_age = current_time - os.path.getmtime(filepath)
                if file_age > max_age_seconds:
                    os.remove(filepath)
                    logger.debug(f"Cleaned up old file: {filename}")
    except Exception as e:
        logger.error(f"Cleanup error: {e}")
