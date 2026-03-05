"""
API Package

Exposes API routes for the Phosphene Vision API.

Main production endpoint:
- /ws/navigation-phosphene: Full navigation + phosphene pipeline (nav_phosphene_ws.py)
"""

from .routes import router, set_navigation_service
from .nav_phosphene_ws import handle_navigation_phosphene_websocket

__all__ = [
    "router",
    "set_navigation_service",
    "handle_navigation_phosphene_websocket",
]
