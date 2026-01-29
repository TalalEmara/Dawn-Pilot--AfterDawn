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
import { experimentVault } from './Scenario-Builder/ExperimentVault';

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
  socket.on('alert:status', (data: { status: 'DANGER' | 'SAFE' }) => {
    // Broadcast to everyone EXCEPT the sender (Researcher)
    socket.broadcast.emit('alert:status', data);
    console.log(`🚨 Alert Status Broadcast: ${data.status}`);
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
    
    
    if (experimentVault.isRecording()) {
      experimentVault.logEvent('CAM', {
        pos: data.position,
        rot: data.rotation
      });
    }
  });

  // VISION MODE SYNC
  socket.on('vision-mode:update', (data: { mode: string }) => {
    // Broadcast to all other clients (especially Mobile)
    socket.broadcast.emit('vision-mode:changed', { mode: data.mode });
    console.log(`Vision mode synced: ${data.mode}`);
    
    // Optionally log to experiment data
    if (experimentVault.isRecording()) {
      experimentVault.logEvent('VISION_MODE', { mode: data.mode });
    }
  });

  // EYE CONTROL SYNC
  socket.on('eye-control:update', (data: { control: string }) => {
    // Broadcast to all other clients (especially Mobile)
    socket.broadcast.emit('eye-control:changed', { control: data.control });
    console.log(`Eye control synced: ${data.control}`);
    
    // Optionally log to experiment data
    if (experimentVault.isRecording()) {
      experimentVault.logEvent('EYE_CONTROL', { control: data.control });
    }
  });

  // LITE MODE SYNC
  socket.on('lite-mode:update', (data: { enabled: boolean }) => {
    // Broadcast to all other clients (especially Mobile)
    socket.broadcast.emit('lite-mode:changed', { enabled: data.enabled });
    console.log(`Lite mode synced: ${data.enabled}`);
    
    // Optionally log to experiment data
    if (experimentVault.isRecording()) {
      experimentVault.logEvent('LITE_MODE', { enabled: data.enabled });
    }
  });

//  COLLISION EVENTS
  socket.on('experiment:collision', (data: { obstacleId: string }) => {
    if (experimentVault.isRecording()) {
      experimentVault.logEvent('COLLISION', data);
    }
  });


  socket.on('scenario-loaded', (data: { filename: string }) => {
    console.log(`🔄 Relay: Scenario Loaded -> ${data.filename}`);
    // Broadcast to everyone else (Mobile)
    socket.broadcast.emit('scenario-loaded', data); 
  });
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

// needs refactor
//EXperiment Vault

app.post('/api/experiment/start', (req, res) => {
  try {
    const { 
      subjectId, 
      scenarioId, 
      visionMode, 
      mobileId,
      laptopSocketId 
    } = req.body;

    experimentVault.startExperiment({
      laptopSocketId: laptopSocketId || 'unknown_laptop',
      mobileId: mobileId || 'unknown_mobile',
      subjectId: subjectId || 'Anonymous',
      scenarioId: scenarioId,
      visionMode: visionMode
    });

    res.json({ success: true, message: "Recording started" });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// STOP EXPERIMENT
app.post('/api/experiment/stop', (req, res) => {
  const filename = experimentVault.stopExperiment();
  if (filename) {
    res.json({ success: true, file: filename });
  } else {
    res.status(400).json({ error: "No active experiment to stop" });
  }
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
