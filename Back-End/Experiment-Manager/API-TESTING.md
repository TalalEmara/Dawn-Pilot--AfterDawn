# Dawn Pilot API Testing Guide

## Getting Started

### 1. Import Postman Collection
1. Open Postman
2. Click **Import** button
3. Select `postman-collection.json`
4. Collection "Dawn Pilot - Experiment Manager API" will be added

### 2. Start Backend Server
```bash
cd Back-End/Experiment-Manager
pnpm run dev
```
Server runs at: `http://localhost:5000`

---

## API Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/world` | Get current world state |
| POST | `/api/world/cube` | Add a new cube |
| PUT | `/api/world/cube/:cube_id` | Update existing cube |
| DELETE | `/api/world/cube/:id` | Remove a cube |
| POST | `/api/world/save` | Save world to file |
| POST | `/api/world/reload` | Reload world from file |

---

## Mock Data Examples

### 1. Add Cubes - Basic Colors

#### Red Cube (Center)
```json
{
  "position": { "x": 0, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "color": "#FF0000"
}
```

#### Blue Cube (Left)
```json
{
  "position": { "x": -5, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 45, "z": 0 },
  "color": "#0000FF"
}
```

#### Green Cube (Right)
```json
{
  "position": { "x": 5, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "color": "#00FF00"
}
```

#### Yellow Cube (Above)
```json
{
  "position": { "x": 0, "y": 3, "z": 0 },
  "rotation": { "x": 30, "y": 30, "z": 30 },
  "color": "#FFFF00"
}
```

#### Purple Cube (Forward)
```json
{
  "position": { "x": 0, "y": 0, "z": -5 },
  "rotation": { "x": 0, "y": 90, "z": 0 },
  "color": "#800080"
}
```

### 2. Advanced Scenarios

#### Create a 3x3 Grid (Front Row)
```json
// Position (-2, 0, 0) - Left
{
  "position": { "x": -2, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "color": "#FF6B6B"
}

// Position (0, 0, 0) - Center
{
  "position": { "x": 0, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "color": "#4ECDC4"
}

// Position (2, 0, 0) - Right
{
  "position": { "x": 2, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "color": "#45B7D1"
}
```

#### Stacked Tower
```json
// Base
{
  "position": { "x": 0, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "color": "#8B4513"
}

// Middle
{
  "position": { "x": 0, "y": 1.5, "z": 0 },
  "rotation": { "x": 0, "y": 45, "z": 0 },
  "color": "#D2691E"
}

// Top
{
  "position": { "x": 0, "y": 3, "z": 0 },
  "rotation": { "x": 0, "y": 90, "z": 0 },
  "color": "#F4A460"
}
```

#### Rainbow Circle (8 cubes)
```json
// Red - 0°
{
  "position": { "x": 5, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "color": "#FF0000"
}

// Orange - 45°
{
  "position": { "x": 3.5, "y": 0, "z": -3.5 },
  "rotation": { "x": 0, "y": 45, "z": 0 },
  "color": "#FFA500"
}

// Yellow - 90°
{
  "position": { "x": 0, "y": 0, "z": -5 },
  "rotation": { "x": 0, "y": 90, "z": 0 },
  "color": "#FFFF00"
}

// Green - 135°
{
  "position": { "x": -3.5, "y": 0, "z": -3.5 },
  "rotation": { "x": 0, "y": 135, "z": 0 },
  "color": "#00FF00"
}

// Cyan - 180°
{
  "position": { "x": -5, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 180, "z": 0 },
  "color": "#00FFFF"
}

// Blue - 225°
{
  "position": { "x": -3.5, "y": 0, "z": 3.5 },
  "rotation": { "x": 0, "y": 225, "z": 0 },
  "color": "#0000FF"
}

// Indigo - 270°
{
  "position": { "x": 0, "y": 0, "z": 5 },
  "rotation": { "x": 0, "y": 270, "z": 0 },
  "color": "#4B0082"
}

// Violet - 315°
{
  "position": { "x": 3.5, "y": 0, "z": 3.5 },
  "rotation": { "x": 0, "y": 315, "z": 0 },
  "color": "#8B00FF"
}
```

### 3. Update Cube Example
```json
// PUT /api/world/cube/cube_1
{
  "position": { "x": 10, "y": 5, "z": -10 },
  "rotation": { "x": 45, "y": 90, "z": 135 },
  "color": "#FF1493"
}
```

---

## Testing Workflow

### Complete Test Sequence

1. **Get Initial State**
   - `GET /api/world`
   - Should return empty or existing world

2. **Add Multiple Cubes**
   - Use "Add Cube" requests from Postman collection
   - Add at least 5 cubes with different positions/colors

3. **Verify World State**
   - `GET /api/world`
   - Should show all added cubes with generated IDs

4. **Update a Cube**
   - Copy a cube ID from the GET response
   - `PUT /api/world/cube/{cube_id}`
   - Change position, rotation, or color

5. **Verify Update**
   - `GET /api/world`
   - Check that cube was updated

6. **Save World**
   - `POST /api/world/save`
   - Persists to `world-state.json`

7. **Remove a Cube**
   - `DELETE /api/world/cube/{id}`
   - Use a cube ID from previous GET

8. **Verify Deletion**
   - `GET /api/world`
   - Cube should be gone

9. **Reload from File**
   - `POST /api/world/reload`
   - Should restore the saved state (before deletion)

10. **Final Verification**
    - `GET /api/world`
    - Should match saved state

---

## Edge Cases to Test

### Invalid Requests
```json
// Missing required fields
{
  "position": { "x": 0, "y": 0, "z": 0 }
  // Missing rotation and color
}

// Invalid data types
{
  "position": { "x": "not-a-number", "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "color": "#FF0000"
}

// Malformed color
{
  "position": { "x": 0, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "color": "red"  // Should be hex format
}
```

### Boundary Values
```json
// Very large coordinates
{
  "position": { "x": 10000, "y": 10000, "z": 10000 },
  "rotation": { "x": 360, "y": 720, "z": 0 },
  "color": "#FFFFFF"
}

// Negative values
{
  "position": { "x": -100, "y": -50, "z": -75 },
  "rotation": { "x": -45, "y": -90, "z": -180 },
  "color": "#000000"
}
```

### Non-existent IDs
- `PUT /api/world/cube/invalid_id` - Should return 404
- `DELETE /api/world/cube/nonexistent` - Should handle gracefully

---

## Expected Responses

### Successful GET /api/world
```json
{
  "cubes": [
    {
      "id": "cube_1730000000000",
      "position": { "x": 0, "y": 0, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "color": "#FF0000"
    }
  ]
}
```

### Successful POST /api/world/cube
```json
{
  "cubes": [
    {
      "id": "cube_1730000000000",
      "position": { "x": 0, "y": 0, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "color": "#FF0000"
    }
  ]
}
```

### Successful DELETE
```json
{
  "cubes": []
}
```

### Error Response (404)
```json
{
  "error": "Cube not found"
}
```

---

## Quick cURL Commands

```bash
# Get world
curl http://localhost:5000/api/world

# Add cube
curl -X POST http://localhost:5000/api/world/cube \
  -H "Content-Type: application/json" \
  -d '{"position":{"x":0,"y":0,"z":0},"rotation":{"x":0,"y":0,"z":0},"color":"#FF0000"}'

# Update cube
curl -X PUT http://localhost:5000/api/world/cube/cube_1 \
  -H "Content-Type: application/json" \
  -d '{"position":{"x":5,"y":5,"z":5},"rotation":{"x":45,"y":45,"z":45},"color":"#00FF00"}'

# Delete cube
curl -X DELETE http://localhost:5000/api/world/cube/cube_1

# Save world
curl -X POST http://localhost:5000/api/world/save

# Reload world
curl -X POST http://localhost:5000/api/world/reload
```

---

## Notes

- Cube IDs are auto-generated as `cube_{timestamp}`
- World state persists to `Scenario-Builder/world-state.json`
- Position coordinates: x (left/right), y (up/down), z (forward/back)
- Rotation in degrees: x (pitch), y (yaw), z (roll)
- Color format: Hex color codes (e.g., `#FF0000`)

---

## Troubleshooting

- **Connection refused**: Make sure backend is running (`pnpm run dev`)
- **404 errors**: Check URL paths match exactly
- **Invalid JSON**: Validate JSON syntax in request bodies
- **Cube not found**: Verify cube ID exists using GET /api/world first
