import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { addCube, removeCube, getWorld, saveWorld, reloadWorld, updateCube } from './Scenario-Builder/world_Manager';

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

// Start server
app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});