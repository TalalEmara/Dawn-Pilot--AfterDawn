import { EntityManager } from '../ECS-Pattern/ecsManager';
import { Position, Rotation, Color, Scale, Model, Collision } from '../ECS-Pattern/components';
import { Component } from '../ECS-Pattern/ecsManager';
import { Entity } from '../ECS-Pattern/types';
import { ModelDefinitions, getModelDefinition, modelExists } from './modelsDeclare';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === ECS Manager ===
const entityManager = new EntityManager();

// Map: object-id -> entity
const objectMap = new Map<string, Entity>();
const metadataMap = new Map<string, { name?: string }>();

// === Component Registry ===
// Map component names to their constructors for dynamic instantiation
const componentRegistry = new Map<string, new (...args: any[]) => Component>([
  ['Position', Position],
  ['Rotation', Rotation],
  ['Color', Color],
  ['Scale', Scale],
  ['Model', Model],
  ['Collision', Collision]
]);

// === Helper Functions ===

/**
 * Convert entity to object format with all its components
 */
function entityToObject(objectId: string, entity: Entity): any {
  const obj: any = { id: objectId };

  // Get all components for this entity
  const pos = entityManager.getComponent(entity, Position);
  if (pos) obj.Position = { x: pos.x, y: pos.y, z: pos.z };

  const rot = entityManager.getComponent(entity, Rotation);
  if (rot) obj.Rotation = { x: rot.x, y: rot.y, z: rot.z };

  const col = entityManager.getComponent(entity, Color);
  if (col) obj.Color = { value: col.value };

  const scale = entityManager.getComponent(entity, Scale);
  if (scale) obj.Scale = { x: scale.x, y: scale.y, z: scale.z };

  const model = entityManager.getComponent(entity, Model);
  if (model) obj.Model = { url: model.url };

  const collision = entityManager.getComponent(entity, Collision);
  if (collision) obj.Collision = { weight: collision.weight };

  return obj;
}

/**
 * Create component instance from data
 */
function createComponentInstance(ComponentClass: new (...args: any[]) => Component, data: any): Component {
  if (ComponentClass === Position) {
    return new Position(data.x, data.y, data.z);
  } else if (ComponentClass === Rotation) {
    return new Rotation(data.x, data.y, data.z);
  } else if (ComponentClass === Scale) {
    return new Scale(data.x, data.y, data.z);
  } else if (ComponentClass === Color) {
    return new Color(data.value);
  } else if (ComponentClass === Model) {
    return new Model(data.url);
  } else if (ComponentClass === Collision) {
    return new Collision(data.weight);
  }
  return new ComponentClass();
}

// === Public Functions ===

/**
 * Create new scenario world (resets everything)
 */
export function createScenarioWorld(): any {
  for (const [objectId, entity] of objectMap.entries()) {
    entityManager.removeEntity(entity);
  }
  objectMap.clear();
  
  return { entities: [] };
}

/**
 * Create entity from a model definition
 */
//

//

export function createEntityFromModel(modelName: string, overrides: Record<string, any> = {}) {
  const definition = getModelDefinition(modelName);
  if (!definition) throw new Error(`Model "${modelName}" not found`);

  // 1. Deep clone defaults
  const components = JSON.parse(JSON.stringify(definition.components));

  // 2. Merge overrides
  Object.entries(overrides).forEach(([key, val]) => {
    components[key] = { ...(components[key] || {}), ...val };
  });

  // 3. Apply normalization factors with component-specific logic
  const norms = definition.normalizeFactors || {};

  Object.entries(norms).forEach(([compName, factors]) => {
    if (components[compName]) {
      Object.entries(factors).forEach(([axis, factor]) => {
        // Ensure we are working with numbers
        if (typeof components[compName][axis] === 'number' && typeof factor === 'number') {
          
          if (compName === 'Scale') {
            // Scale: Multiply
            components[compName][axis] *= factor;
          } else if (compName === 'Position' || compName === 'Rotation') {
            // Position & Rotation: Add
            components[compName][axis] += factor;
          }
          
        }
      });
    }
  });

  // 4. Create and return entity
  const entity = createEntity(components);
  entity.name = modelName;
  metadataMap.set(entity.id, { name: modelName });

  console.log(`Created entity "${modelName}":`, entity);
  return entity;
}
/**
 * Create a new entity with optional initial components
 */
export function createEntity(components?: Record<string, any>): any {
  const objectId = `entity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const entity = entityManager.createEntity();
  
  objectMap.set(objectId, entity);

  // Add initial components if provided
  if (components) {
    for (const [componentName, componentData] of Object.entries(components)) {
      const ComponentClass = componentRegistry.get(componentName);
      if (ComponentClass) {
        const instance = createComponentInstance(ComponentClass, componentData);
        entityManager.addComponent(entity, instance);
      }
    }
  }

  // Auto-save after creating entity
  saveScenarioWorld();

  return entityToObject(objectId, entity);
}

/**
 * Add component to entity
 */
export function addComponentToEntity(
  entityId: string,
  componentName: string,
  componentData: any
): any {
  const entity = objectMap.get(entityId);
  if (entity === undefined) {
    throw new Error(`Entity ${entityId} not found`);
  }

  const ComponentClass = componentRegistry.get(componentName);
  if (!ComponentClass) {
    throw new Error(`Unknown component type: ${componentName}`);
  }

  const instance = createComponentInstance(ComponentClass, componentData);
  entityManager.addComponent(entity, instance);

  return entityToObject(entityId, entity);
}

/**
 * Remove component from entity
 */
export function removeComponentFromEntity(
  entityId: string,
  componentName: string
): any {
  const entity = objectMap.get(entityId);
  if (entity === undefined) {
    throw new Error(`Entity ${entityId} not found`);
  }

  const ComponentClass = componentRegistry.get(componentName);
  if (!ComponentClass) {
    throw new Error(`Unknown component type: ${componentName}`);
  }

  entityManager.removeComponent(entity, ComponentClass);

  return entityToObject(entityId, entity);
}

/**
 * Update component on entity
 */
export function updateComponentOnEntity(
  entityId: string,
  componentName: string,
  componentData: any
): any {
  const entity = objectMap.get(entityId);
  if (entity === undefined) {
    throw new Error(`Entity ${entityId} not found`);
  }

  const ComponentClass = componentRegistry.get(componentName);
  if (!ComponentClass) {
    throw new Error(`Unknown component type: ${componentName}`);
  }

  const component = entityManager.getComponent(entity, ComponentClass as any);
  if (!component) {
    throw new Error(`Entity ${entityId} does not have component ${componentName}`);
  }

  // Update component properties
  Object.assign(component, componentData);

  // Auto-save to persist changes (important for reload/save scenario)
  saveScenarioWorld();

  return entityToObject(entityId, entity);
}

/**
 * Remove entity completely
 */
export function removeEntity(entityId: string): boolean {
  console.log(`🗑️ removeEntity called for: ${entityId}`);
  console.log(`📊 objectMap size before deletion: ${objectMap.size}`);
  
  const entity = objectMap.get(entityId);
  if (entity === undefined) {
    console.log(`❌ Entity ${entityId} not found in objectMap`);
    console.log(`Available entities:`, Array.from(objectMap.keys()));
    return false;
  }

  entityManager.removeEntity(entity);
  objectMap.delete(entityId);
  metadataMap.delete(entityId);
  
  console.log(`📊 objectMap size after deletion: ${objectMap.size}`);
  
  // Auto-save to persist deletion
  saveScenarioWorld();
  
  return true;
}

/**
 * Get specific entity
 */
export function getEntity(entityId: string): any {
  const entity = objectMap.get(entityId);
  if (entity === undefined) {
    throw new Error(`Entity ${entityId} not found`);
  }

  return entityToObject(entityId, entity);
}

/**
 * Get all entities in scenario world
 */
export function getScenarioWorld(): any {
  const entities: any[] = [];

  for (const [objectId, entity] of objectMap.entries()) {
  const obj = entityToObject(objectId, entity);
  const meta = metadataMap.get(objectId);
  if (meta) Object.assign(obj, meta);
  entities.push(obj);
}


  return { entities };
}

/**
 * Query entities by components they have
 */
export function queryEntities(componentNames: string[]): any[] {
  const componentClasses = componentNames
    .map(name => componentRegistry.get(name))
    .filter(c => c !== undefined) as (new (...args: any[]) => Component)[];

  if (componentClasses.length !== componentNames.length) {
    throw new Error('One or more component types not found');
  }

  const entities = entityManager.getEntitiesWith(...componentClasses);
  
  const results: any[] = [];
  for (const entity of entities) {
    // Find the object ID for this entity
    for (const [objId, ent] of objectMap.entries()) {
      if (ent === entity) {
        results.push(entityToObject(objId, entity));
        break;
      }
    }
  }

  return results;
}

/**
 * Get all available model definitions
 */
export function getAvailableModels(): any {
  return Object.keys(ModelDefinitions).map(key => ({
    name: key,
    description: ModelDefinitions[key].description,
    components: Object.keys(ModelDefinitions[key].components)
  }));
}

// ========================================
// Scenario Save/Load System
// ========================================

const SAVED_SCENARIOS_DIR = path.join(__dirname, '../saved-scenarios');
const WORLD_STATE_FILE = path.join(__dirname, '../world-state.json');

// Ensure saved-scenarios directory exists
if (!fs.existsSync(SAVED_SCENARIOS_DIR)) {
  fs.mkdirSync(SAVED_SCENARIOS_DIR, { recursive: true });
}

/**
 * Save current scenario world state to disk (auto-save)
 * This ensures changes persist across restarts and scenario loads
 */
function saveScenarioWorld(): void {
  const world = getScenarioWorld();
  fs.writeFileSync(WORLD_STATE_FILE, JSON.stringify(world, null, 2), 'utf-8');
  console.log(`💾 World state auto-saved (${world.entities.length} entities)`);
}

export interface SavedScenario {
  name: string;
  description?: string;
  createdAt: string;
  entityCount: number;
  camera?: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  };
  entities: any[];
}

/**
 * Sanitize filename to be filesystem-safe
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Save current scenario world to a JSON file
 */
export function saveScenario(
  name: string,
  description?: string,
  camera?: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } }
): SavedScenario {
  const world = getScenarioWorld();
  
  const scenario: SavedScenario = {
    name,
    description,
    createdAt: new Date().toISOString(),
    entityCount: world.entities.length,
    camera,
    entities: world.entities
  };

  const sanitizedName = sanitizeFilename(name);
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${sanitizedName}-${timestamp}.json`;
  const filepath = path.join(SAVED_SCENARIOS_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(scenario, null, 2), 'utf-8');
  
  console.log(`✅ Scenario saved: ${filename}`);
  return scenario;
}

/**
 * Load scenario from a JSON file and restore the world state
 */
export function loadScenario(filename: string): SavedScenario {
  const filepath = path.join(SAVED_SCENARIOS_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    throw new Error(`Scenario file not found: ${filename}`);
  }

  const content = fs.readFileSync(filepath, 'utf-8');
  const scenario: SavedScenario = JSON.parse(content);

  // Clear current world
  createScenarioWorld();

  // Recreate all entities
  for (const entityData of scenario.entities) {
    const components: Record<string, any> = {};
    
    // Extract components from entity data
    if (entityData.Position) components.Position = entityData.Position;
    if (entityData.Rotation) components.Rotation = entityData.Rotation;
    if (entityData.Scale) components.Scale = entityData.Scale;
    if (entityData.Color) components.Color = entityData.Color;
    if (entityData.Model) components.Model = entityData.Model;

    const newEntity = createEntity(components);
    
    // Restore metadata (name)
    if (entityData.name) {
      metadataMap.set(newEntity.id, { name: entityData.name });
      newEntity.name = entityData.name;
    }
  }

  console.log(`✅ Scenario loaded: ${filename} (${scenario.entityCount} entities)`);
  return scenario;
}

/**
 * List all saved scenarios with metadata
 */
export function listSavedScenarios(): Array<{
  filename: string;
  name: string;
  description?: string;
  createdAt: string;
  entityCount: number;
}> {
  if (!fs.existsSync(SAVED_SCENARIOS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(SAVED_SCENARIOS_DIR)
    .filter(file => file.endsWith('.json'));

  return files.map(file => {
    try {
      const filepath = path.join(SAVED_SCENARIOS_DIR, file);
      const content = fs.readFileSync(filepath, 'utf-8');
      const scenario: SavedScenario = JSON.parse(content);
      
      return {
        filename: file,
        name: scenario.name,
        description: scenario.description,
        createdAt: scenario.createdAt,
        entityCount: scenario.entityCount
      };
    } catch (err) {
      console.error(`Error reading scenario file ${file}:`, err);
      return null;
    }
  }).filter(s => s !== null) as Array<{
    filename: string;
    name: string;
    description?: string;
    createdAt: string;
    entityCount: number;
  }>;
}

/**
 * Delete a saved scenario file
 */
export function deleteScenario(filename: string): boolean {
  const filepath = path.join(SAVED_SCENARIOS_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    return false;
  }

  fs.unlinkSync(filepath);
  console.log(`🗑️ Scenario deleted: ${filename}`);
  return true;
}