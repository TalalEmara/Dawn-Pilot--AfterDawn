# WebSocket Integration Guide

## Overview
The API now supports real-time communication via WebSocket connections alongside traditional REST endpoints.

## Connection

```typescript
const ws = new WebSocket('ws://localhost:5000');

ws.addEventListener('open', () => {
  console.log('Connected to WebSocket');
});

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
});

ws.addEventListener('close', () => {
  console.log('Disconnected from WebSocket');
});

ws.addEventListener('error', (error) => {
  console.error('WebSocket error:', error);
});
```

## Message Types

### Receiving Messages

When you first connect, you'll receive the current world state:
```json
{
  "type": "world-state",
  "data": { /* current world state */ }
}
```

After any world change, you'll receive updates:
- `"type": "cube-added"` - New cube added
- `"type": "cube-removed"` - Cube removed
- `"type": "cube-updated"` - Cube properties updated
- `"type": "world-saved"` - World saved
- `"type": "world-reloaded"` - World reloaded
- `"type": "error"` - Error occurred

### Sending Messages

#### Add Cube
```json
{
  "type": "add-cube",
  "data": {
    "position": { "x": 0, "y": 0, "z": 0 },
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "color": "#FF0000"
  }
}
```

#### Remove Cube
```json
{
  "type": "remove-cube",
  "data": {
    "id": "cube-id-here"
  }
}
```

#### Update Cube
```json
{
  "type": "update-cube",
  "data": {
    "cubeId": "cube-id-here",
    "position": { "x": 1, "y": 1, "z": 1 },
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "color": "#00FF00"
  }
}
```

#### Save World
```json
{
  "type": "save-world",
  "data": {}
}
```

#### Reload World
```json
{
  "type": "reload-world",
  "data": {}
}
```

## Example Client Implementation

```typescript
class WorldClient {
  private ws: WebSocket;
  private messageHandlers: Map<string, Function> = new Map();

  constructor(url: string) {
    this.ws = new WebSocket(url);
    
    this.ws.addEventListener('open', () => this.onOpen());
    this.ws.addEventListener('message', (event) => this.onMessage(event));
    this.ws.addEventListener('close', () => this.onClose());
    this.ws.addEventListener('error', (event) => this.onError(event));
  }

  private onOpen() {
    console.log('Connected');
  }

  private onMessage(event: MessageEvent) {
    const message = JSON.parse(event.data);
    const handler = this.messageHandlers.get(message.type);
    if (handler) handler(message.data);
  }

  private onClose() {
    console.log('Disconnected');
  }

  private onError(event: Event) {
    console.error('Error:', event);
  }

  subscribe(type: string, handler: (data: any) => void) {
    this.messageHandlers.set(type, handler);
  }

  send(type: string, data: any) {
    this.ws.send(JSON.stringify({ type, data }));
  }

  addCube(position: any, rotation: any, color: string) {
    this.send('add-cube', { position, rotation, color });
  }

  removeCube(id: string) {
    this.send('remove-cube', { id });
  }

  updateCube(cubeId: string, position: any, rotation: any, color: string) {
    this.send('update-cube', { cubeId, position, rotation, color });
  }

  saveWorld() {
    this.send('save-world', {});
  }

  reloadWorld() {
    this.send('reload-world', {});
  }
}

// Usage
const client = new WorldClient('ws://localhost:5000');

client.subscribe('world-state', (data) => {
  console.log('World state:', data);
});

client.subscribe('cube-added', (data) => {
  console.log('Cube added:', data);
});

client.addCube(
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  '#FF0000'
);
```

## Installation

Run the following command in the `Back-End/Experiment-Manager` directory:

```bash
pnpm install
```

## Starting the Server

```bash
pnpm dev
```

The server will output:
```
✅ Backend running at http://192.168.x.x:5000
🔗 WebSocket available at ws://192.168.x.x:5000
```

## Benefits

- **Real-time updates**: All connected clients receive updates instantly
- **Reduced latency**: No polling required
- **Bidirectional communication**: Server can push updates without client requests
- **Connection tracking**: Server maintains list of active connections
