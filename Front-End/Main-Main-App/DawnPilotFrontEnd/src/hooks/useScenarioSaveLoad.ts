import { useState, useCallback } from 'react';

import { URLS } from '../config';
// const SOCKET_URL = "http://192.168.1.107:5000";

const API_BASE_URL = URLS.SYNC_SOCKET;

export type SavedScenarioMetadata = {
  filename: string;
  name: string;
  description?: string;
  createdAt: string;
  entityCount: number;
};

export type SaveScenarioParams = {
  name: string;
  description?: string;
  camera?: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  };
};

export function useScenarioSaveLoad() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Save current scenario to backend
   */
  const saveScenario = useCallback(async (params: SaveScenarioParams) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to save scenario');
      }
      
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save scenario';
      setError(message);
      console.error('Error saving scenario:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load scenario from backend by filename
   */
  const loadScenario = useCallback(async (filename: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/load/${filename}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to load scenario');
      }
      
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load scenario';
      setError(message);
      console.error('Error loading scenario:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * List all saved scenarios
   */
  const listScenarios = useCallback(async (): Promise<SavedScenarioMetadata[]> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/list`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to list scenarios');
      }
      
      const data = await response.json();
      return data.scenarios || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list scenarios';
      setError(message);
      console.error('Error listing scenarios:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Delete a saved scenario
   */
  const deleteScenario = useCallback(async (filename: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/${filename}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to delete scenario');
      }
      
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete scenario';
      setError(message);
      console.error('Error deleting scenario:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    saveScenario,
    loadScenario,
    listScenarios,
    deleteScenario
  };
}
