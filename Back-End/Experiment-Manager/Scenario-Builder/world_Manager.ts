import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Recreate __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Types ===
type Vector3 = { x: number; y: number; z: number };
type Rotation = { x: number; y: number; z: number };

interface Cube {
  id: string;
  position: Vector3;
  rotation: Rotation;
  color: string;
}

interface WorldState {
  cubes: Cube[];
}

// === File Setup ===
const FILE_PATH = path.join(__dirname, 'world-state.json');

// Load or initialize world
let world: WorldState = { cubes: [] };

if (fs.existsSync(FILE_PATH)) {
  try {
    const data = fs.readFileSync(FILE_PATH, 'utf-8');
    world = JSON.parse(data);
    console.log('✅ Loaded world from file');
  } catch (err) {
    console.error('⚠️ Error loading file, starting with empty world');
    world = { cubes: [] };
  }
} else {
  console.log('📂 No world file found, starting fresh');
  saveWorld();
}

// === Functions ===
export function getWorld(): WorldState {
  return world;
}

export function addCube(
  position: Vector3 = { x: 0, y: 1, z: -3 },
  rotation: Rotation = { x: 0, y: 45, z: 0 },
  color: string = '#4CC3D9'
): WorldState {
  const newCube: Cube = {
    id: `cube-${Date.now()}`,
    position,
    rotation,
    color,
  };
  world.cubes.push(newCube);
  saveWorld();
  return world;
}

export function removeCube(id: string): WorldState {
  world.cubes = world.cubes.filter((cube) => cube.id !== id);
  saveWorld();
  return world;
}

export function saveWorld(): void {
  fs.writeFileSync(FILE_PATH, JSON.stringify(world, null, 2), 'utf-8');
}

export function reloadWorld(): void {
  if (fs.existsSync(FILE_PATH)) {
    const data = fs.readFileSync(FILE_PATH, 'utf-8');
    world = JSON.parse(data);
  }
}
