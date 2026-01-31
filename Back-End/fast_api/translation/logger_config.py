"""
Logger configuration for translation depth debugging.
Creates a dedicated file logger that writes to a separate `depth_debug.log` so
we don't mix these depth debugging messages with the existing `debug.log`.
"""
import logging
import os


def get_depth_logger(log_path=None, logger_name="translation.depth"):
    """Return a configured logger that writes to `log_path`.

    Behavior:
    - If `log_path` is None, use a `depth_debug.log` file next to this module.
    - If the logger exists with a handler already pointing to the same file, reuse it.
    - If the logger exists but points to a different file, replace handlers with one for the requested path.
    """
    logger = logging.getLogger(logger_name)

    # Determine final log file path
    if log_path is None:
        log_path = os.path.join(os.path.dirname(__file__), "depth_debug.log")
    log_path = os.path.abspath(log_path)

    # If logger already has a FileHandler for the same file, reuse it
    existing_files = [getattr(h, 'baseFilename', None) for h in logger.handlers if isinstance(h, logging.FileHandler)]
    if any(f and os.path.abspath(f) == log_path for f in existing_files):
        return logger

    # Remove any existing handlers so we can attach the requested file handler
    for h in list(logger.handlers):
        logger.removeHandler(h)

    logger.setLevel(logging.DEBUG)

    # Ensure containing directory exists (will create directories - safe operation)
    dir_name = os.path.dirname(log_path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)

    fh = logging.FileHandler(log_path, mode='a', encoding='utf-8')
    fh.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s %(levelname)-8s %(name)s: %(message)s')
    fh.setFormatter(formatter)

    logger.addHandler(fh)
    logger.propagate = False

    # Write a small startup line to ensure the file exists and write permission works
    logger.debug(f"Depth logger initialized at {log_path}")

    return logger
