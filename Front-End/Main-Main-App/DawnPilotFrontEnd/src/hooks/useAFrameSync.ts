import { useEffect, useRef } from "react";
import type { Entity } from "./useScenarioWorld";

interface AFrameSyncOptions {
  onComponentChange?: (
    entityId: string,
    componentName: string,
    componentData: unknown
  ) => void;
  onEntityRemove?: (entityId: string) => void;
  debounceMs?: number;
  watchedComponents?: string[];
}

/**
 * Helper to check if two values are effectively equal.
 * This prevents infinite loops where React sets a value -> A-Frame fires event -> React sets value again.
 */
const isEffectivelyEqual = (valA: any, valB: any): boolean => {
  if (valA === valB) return true;

  // Handle Vector3 objects {x, y, z}
  if (
    typeof valA === "object" &&
    valA !== null &&
    typeof valB === "object" &&
    valB !== null
  ) {
    // Check for A-Frame vector structure
    if ("x" in valA && "x" in valB) {
      const epsilon = 0.001; // Tolerance for float precision differences
      const xDiff = Math.abs(valA.x - valB.x);
      const yDiff = Math.abs(valA.y - valB.y);
      const zDiff = Math.abs((valA.z || 0) - (valB.z || 0)); // Handle z being optional sometimes
      return xDiff < epsilon && yDiff < epsilon && zDiff < epsilon;
    }
    
    // Check for Color objects {value: string}
    if ("value" in valA && "value" in valB) {
      return valA.value === valB.value;
    }
  }
  
  return false;
};

export function useAFrameSync(
  entities: Entity[],
  options: AFrameSyncOptions = {}
) {
  const {
    onComponentChange,
    onEntityRemove,
    watchedComponents = ["position", "rotation", "scale", "color"],
  } = options;

  // Store latest entities in a Ref so event listeners always access fresh data
  const entitiesRef = useRef<Entity[]>(entities);
  const onComponentChangeRef = useRef(onComponentChange);
  const onEntityRemoveRef = useRef(onEntityRemove);
  const initializedRef = useRef(false);

  // Update refs whenever props change
  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);

  useEffect(() => {
    onComponentChangeRef.current = onComponentChange;
  }, [onComponentChange]);

  useEffect(() => {
    onEntityRemoveRef.current = onEntityRemove;
  }, [onEntityRemove]);

  useEffect(() => {
    const scene = document.querySelector("a-scene") as any;
    
    // Cleanup function references for removal later
    const cleanupMap = new Map<Element, (evt: any) => void>();
    let mutationObserver: MutationObserver | null = null;
    let deletionTimeout: NodeJS.Timeout | null = null;

    const setupListeners = () => {
      // If already initialized for this entity count, skip (optional safety)
      // but we allow re-running if entity count changed to bind new elements
      
      const aframeEntities = document.querySelectorAll("[ecs-entity]");
      
      aframeEntities.forEach((el, index) => {
        const aframeEntity = el as any;

        // Skip if we already attached a listener to this specific element
        // (Note: In a robust app, you might want to remove all and re-add to be safe)
        if (aframeEntity._ecsSyncAttached) return;

        const handleComponentChange = (evt: any) => {
          // 1. Get the latest entity state corresponding to this DOM node
          // We assume DOM order matches the 'entities' array order (React standard behavior)
          const currentEntity = entitiesRef.current[index];
          if (!currentEntity) return;

          const componentName = evt.detail.name;
          if (!watchedComponents.includes(componentName)) return;

          // 2. Extract new data from the event/DOM
          let newData: any;
          if (["position", "rotation", "scale"].includes(componentName)) {
            // Read directly from attribute to be safe, or use evt.detail.newData
            const attr = aframeEntity.getAttribute(componentName);
            newData = { x: attr.x, y: attr.y, z: attr.z };
          } else if (componentName === "color") {
            newData = { value: aframeEntity.getAttribute("color") };
          } else {
            newData = aframeEntity.getAttribute(componentName);
          }

          // 3. Map component name to our Entity interface keys
          let currentReactState: any;
          let backendComponentName = componentName;

          if (componentName === "position") {
            currentReactState = currentEntity.Position;
            backendComponentName = "Position";
          } else if (componentName === "rotation") {
            currentReactState = currentEntity.Rotation;
            backendComponentName = "Rotation";
          } else if (componentName === "scale") {
            currentReactState = currentEntity.Scale;
            backendComponentName = "Scale";
          } else if (componentName === "color") {
            currentReactState = currentEntity.Color;
            backendComponentName = "Color";
          }

          // 4. ECHO CANCELLATION:
          // If the value from A-Frame matches what React already thinks it is,
          // ignore the event. This stops the loop.
          if (currentReactState && isEffectivelyEqual(currentReactState, newData)) {
            return;
          }

          console.log(`Syncing change for ${currentEntity.id}:`, componentName);

          // 5. Trigger the update
          if (onComponentChangeRef.current) {
            onComponentChangeRef.current(
              currentEntity.id,
              backendComponentName,
              newData
            );
          }
        };

        // Attach listener
        aframeEntity.addEventListener("componentchanged", handleComponentChange);
        aframeEntity._ecsSyncAttached = true; // Mark as attached
        
        // Store for cleanup
        cleanupMap.set(aframeEntity, handleComponentChange);
      });

      // ========================================
      // Setup MutationObserver for entity deletions
      // ========================================
      if (onEntityRemoveRef.current && scene) {
        mutationObserver = new MutationObserver((mutations) => {
          // Debounce deletion checks to avoid race conditions
          if (deletionTimeout) clearTimeout(deletionTimeout);
          
          deletionTimeout = setTimeout(() => {
            // Get current DOM entity elements
            const currentEntityElements = Array.from(
              document.querySelectorAll('[ecs-entity]')
            );
            
            // Get entity IDs currently in DOM (using data-entity-id attribute)
            const domEntityIds = new Set(
              currentEntityElements
                .map((el) => el.getAttribute('data-entity-id'))
                .filter(Boolean)
            );
            
            // Find entities that are in React state but not in DOM anymore
            const deletedEntities = entitiesRef.current.filter(
              (entity) => !domEntityIds.has(entity.id)
            );
            
            // Process deletions (only if we actually found deleted entities)
            if (deletedEntities.length > 0) {
              deletedEntities.forEach((entity) => {
                console.log(`🗑️ Entity removed from inspector: ${entity.id}`);
                if (onEntityRemoveRef.current) {
                  onEntityRemoveRef.current(entity.id);
                }
              });
            }
          }, 100); // 100ms debounce
        });

        // Observe the scene for child removals
        mutationObserver.observe(scene, {
          childList: true,
          subtree: true
        });
      }
    };

    const runSetup = () => {
       if (!scene) return;
       if (scene.hasLoaded) {
         setupListeners();
       } else {
         scene.addEventListener("loaded", setupListeners);
       }
    };

    if (scene) {
      runSetup();
    }

    // Cleanup function
    return () => {
      cleanupMap.forEach((handler, element: any) => {
        element.removeEventListener("componentchanged", handler);
        delete element._ecsSyncAttached;
      });
      cleanupMap.clear();
      
      // Clear deletion timeout
      if (deletionTimeout) {
        clearTimeout(deletionTimeout);
      }
      
      // Disconnect mutation observer
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      
      if (scene) {
        scene.removeEventListener("loaded", setupListeners);
      }
    };
  }, [entities.length, watchedComponents]); // Only re-bind if number of entities changes
}