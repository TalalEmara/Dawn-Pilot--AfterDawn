import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { addCube, removeCube, getWorld, saveWorld, reloadWorld } from './Scenario-Builder/world_Manager';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

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

// Start server
app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});
