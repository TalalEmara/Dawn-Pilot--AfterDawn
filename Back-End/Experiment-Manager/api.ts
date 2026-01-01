import express from 'express';
import cors from 'cors';
import os from 'os';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { scenarioRouter } from './routes/scenarioRouter';
import {
  addCube,
  removeCube,
  getWorld,
  saveWorld,
  reloadWorld,
  updateCube
} from './world_Manager';

const app = express();
const PORT = 5000;

const httpServer = createServer(app);

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/scenario', scenarioRouter);

// ========== WebSocket handling ==========

const connectedClients = new Map<string, {
  id: string;
  type: 'mobile' | 'desktop';
}>();

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('client:register', (data: { type: 'mobile' | 'desktop' }) => {
    connectedClients.set(socket.id, { id: socket.id, type: data.type });
    socket.emit('clients:list', Array.from(connectedClients.values()));
  });

  socket.on('camera:update', (data: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }) => {
    socket.volatile.broadcast.emit('camera:updated', {
      clientId: socket.id,
      position: data.position,
      rotation: data.rotation
    });
  });

//   socket.on('device:motion', (data: {
//     acceleration?: { x: number; y: number; z: number };
//     rotationRate?: { alpha: number; beta: number; gamma: number };
//     orientation?: { alpha: number; beta: number; gamma: number };
//   }) => {
//     socket.broadcast.emit('device:motion:update', {
//       clientId: socket.id,
//       ...data
//     });
//   });

//   socket.on('entity:update', (data: {
//     entityId: string;
//     component: string;
//     value: any;
//   }) => {
//     socket.broadcast.emit('entity:updated', data);
//   });

//   socket.on('disconnect', () => {
//     console.log(`Client disconnected: ${socket.id}`);
//     connectedClients.delete(socket.id);
//     socket.broadcast.emit('client:disconnected', { clientId: socket.id });
//   });
});

// ========== REST endpoints ==========

app.get('/api/world', (req, res) => {
  res.json(getWorld());
});

app.post('/api/world/cube', (req, res) => {
  const { position, rotation, color } = req.body;
  const updated = addCube(position, rotation, color);
  res.json(updated);
});

app.delete('/api/world/cube/:id', (req, res) => {
  const cubeId = req.params.id;
  const updated = removeCube(cubeId);
  res.json(updated);
});

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

app.post('/api/world/save', (req, res) => {
  saveWorld();
  res.json({ message: 'World saved successfully' });
});

app.post('/api/world/reload', (req, res) => {
  reloadWorld();
  res.json(getWorld());
});

// ========== Start server ==========

httpServer.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const results: string[] = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }

  results.forEach(ip => {
    console.log(`HTTP + WebSocket server at http://${ip}:${PORT}`);
  });
});
