"""
API Package

Exposes API routes for the Phosphene Vision API.

Main production endpoint:
- /ws/navigation-phosphene: Full navigation + phosphene pipeline (nav_phosphene_ws.py)

Legacy endpoints:
- /ws: Standard phosphene (detection + translation only) - see old_experiments/
- /ws/navigation: Navigation pipeline without phosphene - see old_experiments/
"""

from .routes import router, set_navigation_service
from .nav_phosphene_ws import handle_navigation_phosphene_websocket, navigation_detector_service

__all__ = [
    "router",
    "set_services",
    "handle_navigation_phosphene_websocket",
]
