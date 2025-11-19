import express from 'express';
import cors from 'cors';
import os from 'os';
import bodyParser from 'body-parser';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { Server } from 'socket.io';
import { scenarioRouter } from './routes/scenarioRouter';
import { addCube, removeCube, getWorld, saveWorld, reloadWorld, updateCube } from './world_Manager';

const app = express();
const PORT = 5000;

// Create HTTPS server for both Express and Socket.IO
const httpsOptions = {
  key: readFileSync('./ssl/key.pem'),
  cert: readFileSync('./ssl/cert.pem')
};
const httpServer = createServer(httpsOptions, app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['polling', 'websocket']
});

app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', socketio: 'ready', timestamp: Date.now() });
});

app.use('/scenario',scenarioRouter);

// === WebSocket Real-Time Camera Tracking ===

// Store active clients and their camera states
const connectedClients = new Map<string, {
  id: string;
  type: 'mobile' | 'desktop';
  camera: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  };
}>();

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  // Register client type (mobile or desktop)
  socket.on('client:register', (data: { type: 'mobile' | 'desktop' }) => {
    connectedClients.set(socket.id, {
      id: socket.id,
      type: data.type,
      camera: {
        position: { x: 0, y: 2, z: 4 },
        rotation: { x: 0, y: 0, z: 0 }
      }
    });
    console.log(`📱 Client ${socket.id} registered as ${data.type}`);
    
    // Send current connected clients
    socket.emit('clients:list', Array.from(connectedClients.values()));
  });
  
  // Handle camera position updates from mobile device
  socket.on('camera:update', (data: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }) => {
    // Update stored camera state
    const client = connectedClients.get(socket.id);
    if (client) {
      client.camera = data;
    }
    
    // Broadcast to all other clients
    socket.broadcast.emit('camera:updated', {
      clientId: socket.id,
      ...data
    });
  });
  
  // Handle device motion/orientation data (from mobile sensors)
  socket.on('device:motion', (data: {
    acceleration?: { x: number; y: number; z: number };
    rotationRate?: { alpha: number; beta: number; gamma: number };
    orientation?: { alpha: number; beta: number; gamma: number };
  }) => {
    // Broadcast device motion to all clients for advanced sync
    socket.broadcast.emit('device:motion:update', {
      clientId: socket.id,
      ...data
    });
  });
  
  // Handle entity updates (for future use)
  socket.on('entity:update', (data: {
    entityId: string;
    component: string;
    value: any;
  }) => {
    // Broadcast entity updates
    socket.broadcast.emit('entity:updated', data);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    connectedClients.delete(socket.id);
    
    // Notify other clients
    socket.broadcast.emit('client:disconnected', { clientId: socket.id });
  });
});

// === Endpoints ===

// Get current world
app.get('/api/world', (req, res) => {
  res.json(getWorld());
});

// Add cube
app.post('/api/world/cube', (req, res) => {
  const { position, rotation, color } = req.body;
  const updated = addCube(position, rotation, color);
  res.json(updated);
});

// Remove cube
app.delete('/api/world/cube/:id', (req, res) => {
  const cubeId = req.params.id;
  const updated = removeCube(cubeId);
  res.json(updated);
});

// Update a single cube
app.put('/api/world/cube/:cube_id', (req, res) => {
  const { cube_id } = req.params;
  const { position, rotation, color } = req.body;
  
  const updated = updateCube(cube_id, position, rotation, color);
  
  if (updated) {
    res.json(updated);
  } else {
    res.status(404).json({ error: 'Cube not found' });
  }
});

// Manual save
app.post('/api/world/save', (req, res) => {
  saveWorld();
  res.json({ message: 'World saved successfully' });
});

// Reload from file
app.post('/api/world/reload', (req, res) => {
  reloadWorld();
  res.json(getWorld());
});

// Start server with Socket.IO support
httpServer.listen(PORT, '0.0.0.0', () => {
  // Get local IPs
  const nets = os.networkInterfaces();
  const results: string[] = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      // Only IPv4 and non-internal (not localhost)
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }

  // Log all available local IPs
  console.log('\n🚀 Server Started:');
  console.log('─────────────────────────────────────');
  results.forEach(ip => {
    console.log(`📡 HTTPS + WebSocket: https://${ip}:${PORT}`);
  });
  console.log(`🔌 Socket.IO ready for real-time sync`);
  console.log('─────────────────────────────────────\n');
});