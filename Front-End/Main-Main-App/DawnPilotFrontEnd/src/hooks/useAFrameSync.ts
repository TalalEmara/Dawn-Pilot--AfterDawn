import { useEffect, useCallback, useRef } from 'react';
import type { Entity } from './useScenarioWorld';

interface AFrameSyncOptions {
  onComponentChange?: (
    entityId: string,
    componentName: string,
    componentData: unknown
  ) => void;
  debounceMs?: number;
  watchedComponents?: string[];
}

export function useAFrameSync(
  entities: Entity[],
  options: AFrameSyncOptions = {}
) {
  const {
    onComponentChange,
    debounceMs = 500,
    watchedComponents = ['position', 'rotation', 'scale', 'color']
  } = options;

  const entityMapRef = useRef<Map<number, string>>(new Map());

  /**
   * Setup listeners for A-Frame component changes
   */
  const setupListeners = useCallback(() => {
    console.log('Setting up A-Frame listeners, entity count:', entities.length);
    
    const scene = document.querySelector('a-scene');
    if (!scene) {
      console.log('Scene not found');
      return;
    }

    const aframeEntities = document.querySelectorAll('[gltf-model], [primitive]');
    console.log('Found A-Frame entities:', aframeEntities.length);
    
    aframeEntities.forEach((aframeEntity, index) => {
      // Map A-Frame entity index to backend entity ID
      if (entities[index]) {
        entityMapRef.current.set(index, entities[index].id);
      }

      function handleComponentChange(evt: unknown) {
        const componentName = evt.detail.name;
        
        if (!watchedComponents.includes(componentName)) {
          return;
        }

        console.log('Component changed:', componentName, 'on entity', index);
        
        const entityId = entityMapRef.current.get(index);
        if (!entityId) {
          console.warn('No entity ID mapped for index', index);
          return;
        }

        // Get component data from A-Frame
        let componentData: unknown;
        
        if (componentName === 'position' || componentName === 'rotation' || componentName === 'scale') {
          const value = aframeEntity.getAttribute(componentName) as unknown as { x: number; y: number; z: number };
          componentData = { x: value.x, y: value.y, z: value.z };
        } else if (componentName === 'color') {
          componentData = { value: aframeEntity.getAttribute('color') as string };
        } else {
          componentData = aframeEntity.getAttribute(componentName);
        }

        // Map A-Frame component names to backend component names
        const componentNameMap: { [key: string]: string } = {
          'position': 'Position',
          'rotation': 'Rotation',
          'scale': 'Scale',
          'color': 'Color'
        };

        const backendComponentName = componentNameMap[componentName] || componentName;

        if (onComponentChange) {
          onComponentChange(entityId, backendComponentName, componentData);
        }
      }
      
      // Store the handler so we can remove it later
      (aframeEntity as any)._handleComponentChange = handleComponentChange;
      aframeEntity.addEventListener('componentchanged', handleComponentChange);
    });
  }, [entities, onComponentChange, watchedComponents]);

  /**
   * Cleanup listeners
   */
  const cleanupListeners = useCallback(() => {
    console.log('Cleaning up A-Frame listeners');
    
    const aframeEntities = document.querySelectorAll('[gltf-model], [primitive]');
    aframeEntities.forEach(aframeEntity => {
      if ((aframeEntity as any)._handleComponentChange) {
        aframeEntity.removeEventListener(
          'componentchanged',
          (aframeEntity as any)._handleComponentChange
        );
        delete (aframeEntity as any)._handleComponentChange;
      }
    });
    
    entityMapRef.current.clear();
  }, []);

  /**
   * Setup listeners when scene is ready
   */
  useEffect(() => {
    const scene = document.querySelector('a-scene');
    if (!scene) {
      console.log('Scene not found');
      return;
    }

    const initListeners = () => {
      console.log('Scene loaded, setting up listeners');
      setupListeners();
    };

    if (scene.hasLoaded) {
      console.log('Scene already loaded');
      initListeners();
    } else {
      console.log('Waiting for scene to load');
      scene.addEventListener('loaded', initListeners);
    }

    return () => {
      cleanupListeners();
      if (scene) {
        scene.removeEventListener('loaded', initListeners);
      }
    };
  }, [setupListeners, cleanupListeners]);

  return {
    setupListeners,
    cleanupListeners
  };
}