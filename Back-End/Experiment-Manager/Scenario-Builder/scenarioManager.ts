import { EntityManager } from '../ECS-Pattern/ecsManager';
import { Position, Rotation, Color, Scale, Model } from '../ECS-Pattern/components';
import { Component } from '../ECS-Pattern/ecsManager';
import { Entity } from '../ECS-Pattern/types';
import { ModelDefinitions, getModelDefinition, modelExists } from './modelsDeclare';

// === ECS Manager ===
const entityManager = new EntityManager();

// Map: object-id -> entity
const objectMap = new Map<string, Entity>();

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

  return createEntity(components);
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