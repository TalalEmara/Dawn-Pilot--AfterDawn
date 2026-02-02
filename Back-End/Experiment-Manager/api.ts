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

app.use(cors({ origin: "*", credentials: true }));
app.use(bodyParser.json());

app.get('/health', (req, res) => { res.json({ status: 'ok' }); });
app.use('/scenario', scenarioRouter);

// ========== WebSocket handling ==========

const connectedClients = new Map<string, { id: string; type: 'mobile' | 'desktop'; }>();

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('client:register', (data) => {
    connectedClients.set(socket.id, { id: socket.id, type: data.type });
    socket.emit('clients:list', Array.from(connectedClients.values()));
  });

  socket.on('alert:status', (data) => {
    socket.broadcast.emit('alert:status', data);
  });

  socket.on('camera:update', (data) => {
    socket.volatile.broadcast.emit('camera:updated', {
      clientId: socket.id,
      position: data.position,
      rotation: data.rotation
    });
    if (experimentVault.isRecording()) {
      experimentVault.logEvent('CAM', { pos: data.position, rot: data.rotation });
    }
  });

  socket.on('vision-mode:update', (data) => {
    socket.broadcast.emit('vision-mode:changed', data);
    if (experimentVault.isRecording()) experimentVault.logEvent('VISION_MODE', data);
  });

  socket.on('eye-control:update', (data) => {
    socket.broadcast.emit('eye-control:changed', data);
    if (experimentVault.isRecording()) experimentVault.logEvent('EYE_CONTROL', data);
  });

  socket.on('lite-mode:update', (data) => {
    socket.broadcast.emit('lite-mode:changed', data);
    if (experimentVault.isRecording()) experimentVault.logEvent('LITE_MODE', data);
  });

  // THROTTLE SYNC
  socket.on('throttle:update', (data: { mobileMs: number }) => {
    // Broadcast to all other clients (especially Mobile)
    socket.broadcast.emit('throttle:changed', { mobileMs: data.mobileMs });
    console.log(`Throttle synced: ${data.mobileMs}ms`);
  });

  // WORLD DIMENSIONS SYNC
  socket.on('world-dimensions:update', (data: { width: number; depth: number; zShift: number; xShift: number }) => {
    socket.broadcast.emit('world-dimensions:changed', data);
    console.log(`🌍 World dimensions synced: ${data.width}x${data.depth}, Z:${data.zShift}, X:${data.xShift}`);
  });

//  COLLISION EVENTS
  socket.on('experiment:collision', (data: { obstacleId: string }) => {
    if (experimentVault.isRecording()) {
      experimentVault.logEvent('COLLISION', data);
    }
  });
  // 🧱 WALL COLLISION RELAY (The Fix)
  // =========================================================
  socket.on('walls-transparent:update', (data: { enabled: boolean }) => {
    console.log(`🧱 Walls Transparent Mode: ${data.enabled}`);
    socket.broadcast.emit('walls-transparent:changed', data);
  });

  socket.on('scenario-loaded', (data: { filename: string }) => {
    console.log(`🔄 Relay: Scenario Loaded -> ${data.filename}`);
    // Broadcast to everyone else (Mobile)
    socket.broadcast.emit('scenario-loaded', data); 
  });
});

// ========== REST endpoints (Standard) ==========

app.get('/api/world', (req, res) => { res.json(getWorld()); });
app.post('/api/world/cube', (req, res) => { res.json(addCube(req.body.position, req.body.rotation, req.body.color)); });
app.delete('/api/world/cube/:id', (req, res) => { res.json(removeCube(req.params.id)); });
app.put('/api/world/cube/:cube_id', (req, res) => { 
  const updated = updateCube(req.params.cube_id, req.body.position, req.body.rotation, req.body.color);
  updated ? res.json(updated) : res.status(404).json({ error: 'Cube not found' });
});
app.post('/api/world/save', (req, res) => { saveWorld(); res.json({ message: 'World saved' }); });
app.post('/api/world/reload', (req, res) => { reloadWorld(); res.json(getWorld()); });

app.post('/api/experiment/start', (req, res) => {
  try {
    experimentVault.startExperiment({
      laptopSocketId: req.body.laptopSocketId || 'unknown',
      mobileId: req.body.mobileId || 'unknown',
      subjectId: req.body.subjectId || 'Anonymous',
      scenarioId: req.body.scenarioId,
      visionMode: req.body.visionMode
    });
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/experiment/stop', (req, res) => {
  const filename = experimentVault.stopExperiment();
  filename ? res.json({ success: true, file: filename }) : res.status(400).json({ error: "No active experiment" });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});