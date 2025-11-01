import { Router } from "express";
import { 
  createScenarioWorld, 
  createEntity,
  createEntityFromModel,
  removeEntity,
  getEntity,
  addComponentToEntity,
  removeComponentFromEntity,
  updateComponentOnEntity,
  getScenarioWorld,
  queryEntities,
  getAvailableModels
} from "../Scenario-Builder/scenarioManager";

const scenarioRouter = Router();

// ========================================
// Test Endpoint
// ========================================
scenarioRouter.get('/test', (req, res) => {
  res.json({ message: 'Scenario Router is working!' });
});

// ========================================
// Get Available Models
// GET /models
// ========================================
scenarioRouter.get('/models', (req, res) => {
  try {
    const models = getAvailableModels();
    res.json({ 
      models,
      count: models.length
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get models',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========================================
// Create New Scenario World
// POST /scenario-worlds
// ========================================
scenarioRouter.post('/scenario-worlds', (req, res) => {
  try {
    const world = createScenarioWorld();
    res.status(201).json({ 
      message: 'New scenario world created!',
      world 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to create scenario world',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========================================
// Get Current Scenario World
// GET /scenario-world
// ========================================
scenarioRouter.get('/scenario-world', (req, res) => {
  try {
    const world = getScenarioWorld();
    res.json(world);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get scenario world',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========================================
// Create Entity from Model Definition
// POST /entities/from-model
// Body: { 
//   modelName: "Cube",
//   overrides: { Position: { x: 5, y: 0, z: 0 } }
// }
// ========================================
scenarioRouter.post('/entities/from-model', (req, res) => {
  try {
    const { modelName, overrides } = req.body;
    
    if (!modelName) {
      return res.status(400).json({ 
        error: 'modelName is required',
        example: { modelName: 'Cube', overrides: { Position: { x: 5 } } }
      });
    }
    
    const entity = createEntityFromModel(modelName, overrides);
    
    res.status(201).json({ 
      message: `Entity created from model "${modelName}"!`,
      entity 
    });
  } catch (error) {
    res.status(400).json({ 
      error: 'Failed to create entity from model',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========================================
// Create Entity (custom components)
// POST /entities
// Body: { components: { Position: {...}, Rotation: {...}, ... } }
// ========================================
scenarioRouter.post('/entities', (req, res) => {
  try {
    const { components } = req.body;
    
    const entity = createEntity(components);
    
    res.status(201).json({ 
      message: 'Entity created!',
      entity 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to create entity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========================================
// Get Entity
// GET /entities/:entityId
// ========================================
scenarioRouter.get('/entities/:entityId', (req, res) => {
  try {
    const { entityId } = req.params;
    const entity = getEntity(entityId);
    
    res.json(entity);
  } catch (error) {
    res.status(404).json({ 
      error: 'Entity not found',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========================================
// Delete Entity
// DELETE /entities/:entityId
// ========================================
scenarioRouter.delete('/entities/:entityId', (req, res) => {
  try {
    const { entityId } = req.params;
    
    const removed = removeEntity(entityId);
    
    if (!removed) {
      return res.status(404).json({ 
        error: 'Entity not found',
        entityId 
      });
    }
    
    res.json({ 
      message: `Entity ${entityId} removed!`,
      entityId
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to remove entity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========================================
// Add Component to Entity
// POST /entities/:entityId/components/:componentName
// Body: component data (e.g., { x: 0, y: 0, z: 0 })
// ========================================
scenarioRouter.post('/entities/:entityId/components/:componentName', (req, res) => {
  try {
    const { entityId, componentName } = req.params;
    const componentData = req.body;
    
    const entity = addComponentToEntity(entityId, componentName, componentData);
    
    res.status(201).json({ 
      message: `Component ${componentName} added to entity ${entityId}!`,
      entity 
    });
  } catch (error) {
    res.status(400).json({ 
      error: 'Failed to add component',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========================================
// Update Component on Entity
// PUT /entities/:entityId/components/:componentName
// Body: component data (e.g., { x: 5, y: 10, z: 0 })
// ========================================
scenarioRouter.put('/entities/:entityId/components/:componentName', (req, res) => {
  try {
    const { entityId, componentName } = req.params;
    const componentData = req.body;
    
    const entity = updateComponentOnEntity(entityId, componentName, componentData);
    
    res.json({ 
      message: `Component ${componentName} updated on entity ${entityId}!`,
      entity 
    });
  } catch (error) {
    res.status(400).json({ 
      error: 'Failed to update component',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========================================
// Remove Component from Entity
// DELETE /entities/:entityId/components/:componentName
// ========================================
scenarioRouter.delete('/entities/:entityId/components/:componentName', (req, res) => {
  try {
    const { entityId, componentName } = req.params;
    
    const entity = removeComponentFromEntity(entityId, componentName);
    
    res.json({ 
      message: `Component ${componentName} removed from entity ${entityId}!`,
      entity 
    });
  } catch (error) {
    res.status(400).json({ 
      error: 'Failed to remove component',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========================================
// Query Entities by Components
// POST /entities/query
// Body: { components: ["Position", "Rotation"] }
// ========================================
scenarioRouter.post('/entities/query', (req, res) => {
  try {
    const { components } = req.body;
    
    if (!Array.isArray(components)) {
      return res.status(400).json({ 
        error: 'components must be an array of component names'
      });
    }
    
    const entities = queryEntities(components);
    
    res.json({ 
      entities,
      count: entities.length,
      query: components
    });
  } catch (error) {
    res.status(400).json({ 
      error: 'Failed to query entities',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { scenarioRouter };