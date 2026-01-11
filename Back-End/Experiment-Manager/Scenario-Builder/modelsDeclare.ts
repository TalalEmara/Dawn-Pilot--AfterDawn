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

import { Position } from "../ECS-Pattern/components";

export interface ModelDefinition {
  components: {
    [componentName: string]: any;
  };
  normalizeFactors?: {
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

  Car: {
    name: "Car",
    description: "Player character with full transform",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Model: { url: "/car" }
    },
    normalizeFactors: {
      Scale: { x: 0.00005, y: 0.00005, z: 0.00005 },
    }
  },
  
  TreeTrunk: {
    name: "Tree Trunk",
    description: "tree trunk model",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Model: { url: "/treeTrunk" },
    },
     normalizeFactors: {
      Scale: { x: 0.001, y: 0.001, z: 0.001 },
    }
  },

  Tree: {
    name: "Tree ",
    description: "tree model",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Model: { url: "/tree" },
    },
    normalizeFactors: {
      Scale: { x: 0.005, y: 0.005, z: 0.005 },
    }
  },
  Pole: {
    name: "Pole",
    description: "Pole model",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Model: { url: "/pole" },
    },
    normalizeFactors: {
      Scale: { x: 0.0005, y: 0.0005, z: 0.0005 },
    }
  },
  PlottedPlant: {
    name: "Plotted Plant",
    description: "Plotted Plant model",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Model: { url: "/plottedPlant" },
    }, 
    normalizeFactors: {
      Scale: { x: 0.5, y: 0.5, z: 0.5 },
    }
  },
  Man: {
    name: "Man",
    description: "Man model",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Model: { url: "/man" },
    },
  },
  Crossway: {
    name: "Crossway",
    description: "Street crossway section",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Model: { url: "/crossway" },
    }, 
    normalizeFactors: {
      Scale: { x: 0.04, y: 0.04, z: 0.04 },
      Rotation: { x:-90, y: 0, z: 0 },
    }
  },

  Garbage: {
    name: "Garbage",
    description: "Garbage object",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Model: { url: "/garbage" },
    },
    normalizeFactors: {
      Position: { x: 0, y: .302, z: 0 },
      Scale: { x: 0.001, y: 0.001, z: 0.001 },
    }
  },
  BusStop: {
    name: "Bus Stop",
    description: "Bus Stop object",
    components: {
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
      Model: { url: "/busStop" },
    },
    normalizeFactors: { 
      Scale: { x: 0.05, y: 0.05, z: 0.05 },
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