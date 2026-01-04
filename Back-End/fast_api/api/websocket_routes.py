"""
WebSocket Routes (Legacy Reference)

This file is maintained for backward compatibility and routing structure.
For the main production endpoint, see nav_phosphene_ws.py

PRODUCTION ENDPOINT:
  /ws/navigation-phosphene -> Defined in nav_phosphene_ws.py
  Full pipeline: Object Detection → Freepath → Translator → Phosphene Rendering
  
LEGACY/TESTING ENDPOINTS:
  /ws -> Standard phosphene (detection + translation only)
  /ws/navigation -> Navigation pipeline (detection + freepath, no phosphene)
  These are in old_experiments/legacy_websockets.py for reference

To enable legacy endpoints, uncomment the imports below and add routes in main.py
"""

# Uncomment if you need legacy endpoints:
# from old_experiments.legacy_websockets import (
#     handle_websocket,
#     handle_navigation_websocket,
#     set_legacy_websocket_services
# )

# For the main production endpoint:
# See api/nav_phosphene_ws.py
