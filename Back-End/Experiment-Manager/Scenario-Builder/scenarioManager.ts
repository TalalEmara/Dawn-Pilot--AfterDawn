import { EntityManager } from '../ECS-Pattern/ecsManager';
import { Position, Rotation, Color, Scale, Model } from '../ECS-Pattern/components';
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
  ['Model', Model]
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
export function createEntityFromModel(
  modelName: string, 
  overrides?: Record<string, any>): any {
  if (!modelExists(modelName)) {
    throw new Error(`Model "${modelName}" not found in definitions`);
  }

  const definition = getModelDefinition(modelName)!;
  
  // Merge definition components with overrides
  const components = { ...definition.components };
  if (overrides) {
    for (const [compName, compData] of Object.entries(overrides)) {
      components[compName] = { ...components[compName], ...compData };
    }
  }
 const entityObj = createEntity(components);

  // Add metadata name to the returned object
  entityObj.name = modelName;
  metadataMap.set(entityObj.id, { name: modelName });

  console.log(`Created entity from model "${modelName}":`, entityObj);
  return entityObj;}

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

  return entityToObject(entityId, entity);
}

/**
 * Remove entity completely
 */
export function removeEntity(entityId: string): boolean {
  const entity = objectMap.get(entityId);
  if (entity === undefined) return false;

  entityManager.removeEntity(entity);
  objectMap.delete(entityId);
  
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

// Ensure saved-scenarios directory exists
if (!fs.existsSync(SAVED_SCENARIOS_DIR)) {
  fs.mkdirSync(SAVED_SCENARIOS_DIR, { recursive: true });
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