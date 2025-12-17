"""
Services Package

Exposes detector and translator services.
"""

from .detector_service import DetectorService
from .translator_service import TranslatorService

__all__ = [
    "DetectorService",
    "TranslatorService",
]
