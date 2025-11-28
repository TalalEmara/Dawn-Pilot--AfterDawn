import { useEffect, useRef } from "react";
import type { Entity } from "./useScenarioWorld";

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
    watchedComponents = ["position", "rotation", "scale", "color"],
  } = options;

  const entityMapRef = useRef<Map<number, string>>(new Map());
  const initializedRef = useRef(false);
  const readyForEventsRef = useRef(false);

  // Keep latest callback and watched list in refs so effect deps stay minimal
  const onComponentChangeRef = useRef<typeof onComponentChange>();
  const watchedComponentsRef = useRef<string[]>(watchedComponents);

  useEffect(() => {
    onComponentChangeRef.current = onComponentChange;
  }, [onComponentChange]);

  useEffect(() => {
    watchedComponentsRef.current = watchedComponents;
  }, [watchedComponents]);

  useEffect(() => {
    if (entities.length === 0) {
      // No ECS entities, ensure everything is cleaned
      const aframeEntities = document.querySelectorAll("[ecs-entity]");
      aframeEntities.forEach((aframeEntity) => {
        if ((aframeEntity as any)._handleComponentChange) {
          aframeEntity.removeEventListener(
            "componentchanged",
            (aframeEntity as any)._handleComponentChange
          );
          delete (aframeEntity as any)._handleComponentChange;
        }
      });
      entityMapRef.current.clear();
      initializedRef.current = false;
      readyForEventsRef.current = false;
      return;
    }

    const scene = document.querySelector("a-scene") as any;
    if (!scene) {
      console.log("Scene not found");
      return;
    }

    const setupListeners = () => {
      if (initializedRef.current) {
        console.log("A-Frame listeners already initialized");
        return;
      }

      console.log(
        "Setting up A-Frame listeners, entity count:",
        entities.length
      );

      const aframeEntities = document.querySelectorAll("[ecs-entity]");
      console.log("Found ECS A-Frame entities:", aframeEntities.length);

      entityMapRef.current.clear();

      aframeEntities.forEach((aframeEntity, index) => {
        const entity = entities[index];
        if (!entity) return;

        entityMapRef.current.set(index, entity.id);
        console.log("Mapped DOM index", index, "to entityId", entity.id);

        function handleComponentChange(evt: any) {
          // Ignore events until initial setup finishes
          if (!readyForEventsRef.current) {
            return;
          }

          const componentName = evt.detail?.name;
          if (!componentName) return;

          const watched = watchedComponentsRef.current;
          if (!watched || !watched.includes(componentName)) return;

          console.log(
            "Component changed:",
            componentName,
            "on entity index",
            index
          );

          const entityId = entityMapRef.current.get(index);
          if (!entityId) return;

          let componentData: unknown;
          if (
            componentName === "position" ||
            componentName === "rotation" ||
            componentName === "scale"
          ) {
            const value = aframeEntity.getAttribute(componentName) as {
              x: number;
              y: number;
              z: number;
            };
            componentData = { x: value.x, y: value.y, z: value.z };
          } else if (componentName === "color") {
            componentData = {
              value: aframeEntity.getAttribute("color") as string,
            };
          } else {
            componentData = aframeEntity.getAttribute(componentName);
          }

          const componentNameMap: { [key: string]: string } = {
            position: "Position",
            rotation: "Rotation",
            scale: "Scale",
            color: "Color",
          };

          const backendComponentName =
            componentNameMap[componentName] || componentName;

          const cb = onComponentChangeRef.current;
          if (cb) {
            cb(entityId, backendComponentName, componentData);
          }
        }

        (aframeEntity as any)._handleComponentChange = handleComponentChange;
        aframeEntity.addEventListener("componentchanged", handleComponentChange);
      });

      initializedRef.current = true;

      // After current tick, allow events (so we skip the initial A-Frame setup events)
      setTimeout(() => {
        readyForEventsRef.current = true;
      }, 0);
    };

    const cleanupListeners = () => {
      console.log("Cleaning up A-Frame listeners");
      const aframeEntities = document.querySelectorAll("[ecs-entity]");
      aframeEntities.forEach((aframeEntity) => {
        if ((aframeEntity as any)._handleComponentChange) {
          aframeEntity.removeEventListener(
            "componentchanged",
            (aframeEntity as any)._handleComponentChange
          );
          delete (aframeEntity as any)._handleComponentChange;
        }
      });
      entityMapRef.current.clear();
      initializedRef.current = false;
      readyForEventsRef.current = false;
    };

    const initListeners = () => {
      console.log("Scene loaded, setting up listeners");
      setupListeners();
    };

    if (scene.hasLoaded) {
      console.log("Scene already loaded");
      initListeners();
    } else {
      console.log("Waiting for scene to load");
      scene.addEventListener("loaded", initListeners);
    }

    return () => {
      console.log("=== EFFECT CLEANUP ===");
      cleanupListeners();
      if (scene) {
        scene.removeEventListener("loaded", initListeners);
      }
    };
  }, [entities.length]); // only re-run when count of ECS entities actually changes
}
