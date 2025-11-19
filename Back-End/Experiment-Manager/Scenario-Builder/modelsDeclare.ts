/**
 * Model Definitions
 * 
 * This file contains templates for different types of objects/models.
 * Each model defines which components it should have by default.
 * 
 * To add a new model:
 * 1. Add it to the ModelDefinitions object
 * 2. Specify the component names and their default values
 */

export interface ModelDefinition {
  components: {
    [componentName: string]: any;
  };
  description?: string;
  name: string;
}

export const ModelDefinitions: Record<string, ModelDefinition> = {
  
  // ========================================
  // Basic Cube
  // ========================================
  Box: {
    name: "box",
    description: "A simple colored cube",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 50, y: 50, z: 5 },
      Color: { value: "#ffffff" },
      Model: { url: "Aframe" }
    }
  },

 
  Sphere: {
    name: "Sphere",
    description: "A spherical object",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Color: { value: "#ff0000" },
      Model: { url: "Aframe" }
    }
  },
   // ========================================
  // Torus
  // ========================================
  Torus: {
    name: "Torus",
    description: "A ring object",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Color: { value: "#ffaa00" },
      Model: { url: "Aframe" }
    }
  },

  // ========================================
  // Light Source
  // ========================================
  Light: {
    name: "Light",
    description: "A light source (no model, just position and color)",
    components: {
      Position: { x: 0, y: 10, z: 0 },
      Color: { value: "#ffffff" },
      Model: { url: "Aframe" }
    }
  },

  // ========================================
  // Player Character
  // ========================================
  Car: {
    name: "Car",
    description: "Player character with full transform",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Model: { url: "/car.glb" }
    }
  },

};

/**
 * Get list of all available model names
 */
export function getAvailableModels(): string[] {
  return Object.keys(ModelDefinitions);
}

/**
 * Get definition for a specific model
 */
export function getModelDefinition(modelName: string): ModelDefinition | undefined {
  return ModelDefinitions[modelName];
}

/**
 * Check if a model exists
 */
export function modelExists(modelName: string): boolean {
  return modelName in ModelDefinitions;
}