import { useState, useCallback } from 'react';

export interface Entity {
  Collision: any;
  name: string;
  id: string;
  Position?: { x: number; y: number; z: number };
  Rotation?: { x: number; y: number; z: number };
  Scale?: { x: number; y: number; z: number };
  Color?: { value: string };
  Model?: { url: string };
}

interface ScenarioWorld {
  entities: Entity[];
}
import { URLS } from '../ApiConfig';
// const SOCKET_URL = "http://192.168.1.107:5000";

const API_BASE_URL = URLS.SCENARIO_API;


export function useScenarioWorld() {
  const [world, setWorld] = useState<ScenarioWorld>({ entities: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load the current scenario world
   */
  const loadWorld = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/scenario-world`);
      
      if (!response.ok) {
        throw new Error(`Failed to load world: ${response.statusText}`);
      }
      
      const data = await response.json();
      setWorld(data);
      
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load world';
      setError(message);
      console.error('Error loading world:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a new empty scenario world (resets everything)
   */
  const createNewWorld = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/scenario-worlds`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create world: ${response.statusText}`);
      }
      
      const data = await response.json();
      setWorld(data.world);
      
      return data.world;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create world';
      setError(message);
      console.error('Error creating world:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    world,
    loading,
    error,
    loadWorld,
    createNewWorld,
    setWorld
  };
}