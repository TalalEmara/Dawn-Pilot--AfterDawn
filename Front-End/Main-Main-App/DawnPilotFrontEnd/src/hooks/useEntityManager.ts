import { useState, useCallback } from 'react';
import type { Entity } from './useScenarioWorld';

// const API_BASE_URL = 'http://localhost:5000/scenario';
import { URLS } from '../ApiConfig';
// const SOCKET_URL = "http://192.168.1.107:5000";

const API_BASE_URL = URLS.SCENARIO_API;

interface CreateEntityFromModelParams {
  modelName: string;
  overrides?: Record<string, unknown>;
}

interface CreateCustomEntityParams {
  components?: Record<string, unknown>;
}

export function useEntityManager(onWorldUpdate?: (entities: Entity[]) => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create entity from model template
   */
  const createEntityFromModel = useCallback(async (params: CreateEntityFromModelParams) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/entities/from-model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create entity: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Reload world to get updated state
      if (onWorldUpdate) {
        const worldResponse = await fetch(`${API_BASE_URL}/scenario-world`);
        const worldData = await worldResponse.json();
        onWorldUpdate(worldData.entities);
      }
      
      return data.entity;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create entity';
      setError(message);
      console.error('Error creating entity from model:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [onWorldUpdate]);

  /**
   * Create custom entity with specific components
   */
  const createCustomEntity = useCallback(async (params: CreateCustomEntityParams) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/entities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create entity: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Reload world to get updated state
      if (onWorldUpdate) {
        const worldResponse = await fetch(`${API_BASE_URL}/scenario-world`);
        const worldData = await worldResponse.json();
        onWorldUpdate(worldData.entities);
      }
      
      return data.entity;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create custom entity';
      setError(message);
      console.error('Error creating custom entity:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [onWorldUpdate]);

  /**
   * Get specific entity by ID
   */
  const getEntity = useCallback(async (entityId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/entities/${entityId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get entity: ${response.statusText}`);
      }
      
      const entity = await response.json();
      return entity;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get entity';
      setError(message);
      console.error('Error getting entity:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Delete entity by ID with optimistic update
   */
  const deleteEntity = useCallback(async (entityId: string) => {
    try {
      setError(null);
      
      // ✅ OPTIMISTIC DELETE: Remove from UI immediately
      if (onWorldUpdate) {
        // This callback should update React state optimistically
        // We'll pass a flag to indicate this is a delete operation
        onWorldUpdate(entityId, 'delete');
      }
      
      setLoading(true);
      
      // Send delete request to backend
      const response = await fetch(`${API_BASE_URL}/entities/${entityId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete entity: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`✅ Entity ${entityId} deleted from backend`);
      
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete entity';
      setError(message);
      console.error('Error deleting entity:', err);
      
      // On error, reload to restore correct state
      if (onWorldUpdate) {
        const worldResponse = await fetch(`${API_BASE_URL}/scenario-world`);
        const worldData = await worldResponse.json();
        onWorldUpdate(worldData.entities);
      }
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, [onWorldUpdate]);

  /**
   * Query entities by components
   */
  const queryEntities = useCallback(async (componentNames: string[]) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/entities/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ components: componentNames })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to query entities: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.entities;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to query entities';
      setError(message);
      console.error('Error querying entities:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    createEntityFromModel,
    createCustomEntity,
    getEntity,
    deleteEntity,
    queryEntities
  };
}