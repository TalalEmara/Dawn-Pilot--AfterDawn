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

  // ========================================
  // Sphere
  // ========================================
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
  // Light Source
  // ========================================
  Light: {
    name: "Light",
    description: "A light source (no model, just position and color)",
    components: {
      Position: { x: 0, y: 10, z: 0 },
      Color: { value: "#ffffff" }
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

  // ========================================
  // Obstacle
  // ========================================
  Obstacle: {
    name: "Obstacle",
    description: "An obstacle in the scene",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 2, y: 2, z: 2 },
      Color: { value: "#888888" },
      Model: { url: "/models/obstacle.glb" }
    }
  },

  // ========================================
  // Collectible Item
  // ========================================
  Collectible: {
    name: "Collectible",
    description: "A collectible item",
    components: {
      Position: { x: 0, y: 1, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 0.5, y: 0.5, z: 0.5 },
      Color: { value: "#ffff00" },
      Model: { url: "/models/coin.glb" }
    }
  },

  // ========================================
  // Building
  // ========================================
  Building: {
    name: "Building",
    description: "A large building structure",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 10, y: 20, z: 10 },
      Color: { value: "#8b4513" },
      Model: { url: "/models/building.glb" }
    }
  },

  // ========================================
  // Vehicle
  // ========================================
  Vehicle: {
    name: "Vehicle",
    description: "A vehicle (car, truck, etc.)",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Color: { value: "#0000ff" },
      Model: { url: "/models/vehicle.glb" }
    }
  },

  // ========================================
  // Tree
  // ========================================
  Tree: {
    name: "Tree",
    description: "A tree for environment",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Scale: { x: 3, y: 5, z: 3 },
      Color: { value: "#228b22" },
      Model: { url: "/models/tree.glb" }
    }
  },

  // ========================================
  // Camera Point
  // ========================================
  CameraPoint: {
    name: "Camera Point",
    description: "A camera position marker (no visible model)",
    components: {
      Position: { x: 0, y: 5, z: 10 },
      Rotation: { x: 0, y: 0, z: 0 }
    }
  },

  // ========================================
  // Spawn Point
  // ========================================
  SpawnPoint: {
    name: "Spawn Point",
    description: "A spawn point marker",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Color: { value: "#00ff00" }
    }
  }

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