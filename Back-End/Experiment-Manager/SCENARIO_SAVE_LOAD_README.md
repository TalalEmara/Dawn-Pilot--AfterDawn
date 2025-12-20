# Scenario Save/Load Feature - API Documentation

## Overview
The save/load scenario feature allows you to save the complete state of your 3D world including all entities with their properties and camera position, then load it back later.

## Backend API Endpoints

### 1. Save Scenario
**Endpoint:** `POST /scenario/save`

**Request Body:**
```json
{
  "name": "My City Layout",
  "description": "A detailed city layout with buildings and roads",
  "camera": {
    "position": { "x": 0, "y": 2, "z": 4 },
    "rotation": { "x": 20, "y": 0, "z": 0 }
  }
}
```

**Response:**
```json
{
  "message": "Scenario 'My City Layout' saved successfully!",
  "scenario": {
    "name": "My City Layout",
    "description": "A detailed city layout with buildings and roads",
    "createdAt": "2025-11-29T01:43:00.000Z",
    "entityCount": 5
  }
}
```

### 2. List Saved Scenarios
**Endpoint:** `GET /scenario/list`

**Response:**
```json
{
  "scenarios": [
    {
      "filename": "my-city-layout-2025-11-29.json",
      "name": "My City Layout",
      "description": "A detailed city layout with buildings and roads",
      "createdAt": "2025-11-29T01:43:00.000Z",
      "entityCount": 5
    }
  ],
  "count": 1
}
```

### 3. Load Scenario
**Endpoint:** `GET /scenario/load/:filename`

**Example:** `GET /scenario/load/my-city-layout-2025-11-29.json`

**Response:**
```json
{
  "message": "Scenario 'My City Layout' loaded successfully!",
  "scenario": {
    "name": "My City Layout",
    "description": "A detailed city layout with buildings and roads",
    "createdAt": "2025-11-29T01:43:00.000Z",
    "entityCount": 5,
    "camera": {
      "position": { "x": 0, "y": 2, "z": 4 },
      "rotation": { "x": 20, "y": 0, "z": 0 }
    }
  },
  "world": {
    "entities": [...]
  }
}
```

### 4. Delete Scenario
**Endpoint:** `DELETE /scenario/:filename`

**Example:** `DELETE /scenario/my-city-layout-2025-11-29.json`

**Response:**
```json
{
  "message": "Scenario 'my-city-layout-2025-11-29.json' deleted successfully!",
  "filename": "my-city-layout-2025-11-29.json"
}
```

## Saved Scenario File Format

Scenarios are saved as JSON files in: `Back-End/Experiment-Manager/saved-scenarios/`

**Example File:** `my-city-layout-2025-11-29.json`
```json
{
  "name": "My City Layout",
  "description": "A detailed city layout with buildings and roads",
  "createdAt": "2025-11-29T01:43:00.000Z",
  "entityCount": 5,
  "camera": {
    "position": { "x": 0, "y": 2, "z": 4 },
    "rotation": { "x": 20, "y": 0, "z": 0 }
  },
  "entities": [
    {
      "id": "entity-1732851780000-abc123",
      "name": "Box",
      "Position": { "x": 0, "y": 0, "z": 0 },
      "Rotation": { "x": 0, "y": 0, "z": 0 },
      "Scale": { "x": 50, "y": 50, "z": 5 },
      "Color": { "value": "#ffffff" },
      "Model": { "url": "Aframe" }
    }
  ]
}
```

## Frontend Usage

### Save Scenario
1. Click "💾 Save Scenario" button in BuilderPage
2. Enter scenario name (required) and description (optional)
3. Camera position is automatically captured
4. Click "Save Scenario" to confirm

### Load Scenario
1. Click "📂 Load Scenario" button in BuilderPage
2. Browse the list of saved scenarios
3. Click on a scenario to select it
4. Confirm the load action (this replaces your current world)
5. Camera position is automatically restored

### Features
- **Auto-save camera position**: Your current view is saved with the scenario
- **Rich metadata**: Each scenario includes name, description, creation date, and entity count
- **Safe loading**: Confirmation dialog prevents accidental world replacement
- **Delete scenarios**: Optional delete button in the load dialog
- **Visual feedback**: Entity count badges and formatted dates

## Testing the Feature

1. Start the backend server:
   ```bash
   cd Back-End/Experiment-Manager
   npm run dev
   ```

2. Start the frontend:
   ```bash
   cd Front-End/Main-Main-App/DawnPilotFrontEnd
   npm run dev
   ```

3. Create some entities in the builder
4. Click "Save Scenario" and enter a name
5. Modify the world
6. Click "Load Scenario" and select your saved scenario
7. Verify everything is restored correctly

## Notes
- Scenario filenames are auto-generated as: `{sanitized-name}-{date}.json`
- Camera position is optional in the save request
- Loading a scenario clears the current world first
- Deletion is permanent (no undo)
