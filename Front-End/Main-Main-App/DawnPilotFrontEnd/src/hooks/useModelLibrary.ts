import { useState, useCallback, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:5000/scenario';
// const API_BASE_URL = 'http://192.168.1.106:5000/scenario';

export interface ModelInfo {
  name: string;
  description?: string;
  components: string[];
}

export function useModelLibrary() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load available model definitions
   */
  const loadModels = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/models`);
      
      if (!response.ok) {
        throw new Error(`Failed to load models: ${response.statusText}`);
      }
      
      const data = await response.json();
      setModels(data.models);
      
      return data.models;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load models';
      setError(message);
      console.error('Error loading models:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get model by name
   */
  const getModelByName = useCallback((modelName: string) => {
    return models.find(m => m.name === modelName);
  }, [models]);

  /**
   * Check if model exists
   */
  const modelExists = useCallback((modelName: string) => {
    return models.some(m => m.name === modelName);
  }, [models]);

  /**
   * Auto-load models on mount
   */
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  return {
    models,
    loading,
    error,
    loadModels,
    getModelByName,
    modelExists
  };
}