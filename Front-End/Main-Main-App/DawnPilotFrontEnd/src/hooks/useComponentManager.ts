import { useState, useCallback, useRef } from 'react';
import type { Entity } from './useScenarioWorld';

// const API_BASE_URL = 'http://localhost:5000/scenario';
const API_BASE_URL = 'http://192.168.1.117:5000/scenario';


export function useComponentManager(onEntityUpdate?: (entity: Entity) => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Debounce timers for each entity-component pair
  const updateTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  /**
   * Add component to entity
   */
  const addComponent = useCallback(async (
    entityId: string,
    componentName: string,
    componentData: unknown
  ) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `${API_BASE_URL}/entities/${entityId}/components/${componentName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(componentData)
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to add component: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (onEntityUpdate) {
        onEntityUpdate(data.entity);
      }
      
      return data.entity;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add component';
      setError(message);
      console.error('Error adding component:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [onEntityUpdate]);

  /**
   * Update component on entity (immediate)
   */
  const updateComponent = useCallback(async (
    entityId: string,
    componentName: string,
    componentData: unknown
  ) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `${API_BASE_URL}/entities/${entityId}/components/${componentName}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(componentData)
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to update component: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (onEntityUpdate) {
        onEntityUpdate(data.entity);
      }
      
      return data.entity;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update component';
      setError(message);
      console.error('Error updating component:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [onEntityUpdate]);

  /**
   * Update component with debouncing (for frequent updates like dragging)
   */
  const updateComponentDebounced = useCallback((
    entityId: string,
    componentName: string,
    componentData: unknown,
    debounceMs: number = 500
  ) => {
    const key = `${entityId}-${componentName}`;
    
    // Clear existing timeout
    if (updateTimeoutRef.current[key]) {
      clearTimeout(updateTimeoutRef.current[key]);
    }
    
    // Set new timeout
    updateTimeoutRef.current[key] = setTimeout(async () => {
      try {
        await updateComponent(entityId, componentName, componentData);
        console.log(`Component ${componentName} updated for entity ${entityId}`);
      } catch (err) {
        console.error('Debounced update failed:', err);
      }
    }, debounceMs);
  }, [updateComponent]);

  /**
   * Remove component from entity
   */
  const removeComponent = useCallback(async (
    entityId: string,
    componentName: string
  ) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `${API_BASE_URL}/entities/${entityId}/components/${componentName}`,
        {
          method: 'DELETE'
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to remove component: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (onEntityUpdate) {
        onEntityUpdate(data.entity);
      }
      
      return data.entity;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove component';
      setError(message);
      console.error('Error removing component:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [onEntityUpdate]);

  /**
   * Clear all debounce timers (cleanup)
   */
  const clearAllTimers = useCallback(() => {
    Object.values(updateTimeoutRef.current).forEach(timeout => clearTimeout(timeout));
    updateTimeoutRef.current = {};
  }, []);

  return {
    loading,
    error,
    addComponent,
    updateComponent,
    updateComponentDebounced,
    removeComponent,
    clearAllTimers
  };
}