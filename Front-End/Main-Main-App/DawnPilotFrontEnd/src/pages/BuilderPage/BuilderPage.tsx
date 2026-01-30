import "aframe";
import "aframe-particle-system-component";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity as AEntity, Scene } from "aframe-react";
import { useCallback, useEffect, useState } from "react";
import styles from "./BuilderPage.module.css";
import BuilderSidePanel from "../../components/level-1/BuilderSidePanel/BuilderSidePanel";
import ScenarioContext from "../../contexts/ScenarioContext";
import { useScenarioWorld } from "../../hooks/useScenarioWorld";
import { useEntityManager } from "../../hooks/useEntityManager";
import { useComponentManager } from "../../hooks/useComponentManager";
import { useModelLibrary } from "../../hooks/useModelLibrary";
import PropertiesPanel from "../../components/level-1/PropertiesPanel/PropertiesPanel";
import { useAFrameSync } from "../../hooks/useAFrameSync";
import { usePersistentCamera } from "../../hooks/BuilderMode/usePersistentCamera";
import { useScenarioSaveLoad } from "../../hooks/useScenarioSaveLoad";
import ScenarioSaveDialog from "../../components/level-1/ScenarioSaveDialog/ScenarioSaveDialog";
import ScenarioLoadDialog from "../../components/level-1/ScenarioLoadDialog/ScenarioLoadDialog";

const BuilderPage = () => {

  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  // World management
  const {
    world,
    loading: worldLoading,
    error: worldError,
    loadWorld,
    createNewWorld,
    setWorld,
  } = useScenarioWorld();

  // Entity operations – callback handles both updates and deletes
  const {
    loading: entityLoading,
    error: entityError,
    createEntityFromModel,
    createCustomEntity,
    deleteEntity,
    queryEntities,
  } = useEntityManager((dataOrId, action) => {
    if (action === 'delete' && typeof dataOrId === 'string') {
      // Optimistic delete: remove from UI immediately
      setWorld({
        entities: world.entities.filter(e => e.id !== dataOrId)
      });
    } else if (Array.isArray(dataOrId)) {
      // Full entity array update (for create operations)
      setWorld({ entities: dataOrId });
    }
  });

  // Component operations (used by inspector sync) – callback receives single entity
  // ... inside BuilderPage component ...

  // Component operations (used by inspector sync)
  // No callback needed - we do optimistic updates in handleComponentChange
  const {
    loading: componentLoading,
    updateComponentDebounced,
    clearAllTimers,
  } = useComponentManager();

  // Model library
  const { models } = useModelLibrary();

  // Camera persistence (frontend only)
  const { saveCameraNow, getCurrentCamera, setCameraState } = usePersistentCamera();

  // Scenario save/load
  const { 
    ///////////// what is this //////////////////
    /////////////////////////////////////////////
    saveScenario: saveScenarioAPI, 
    loadScenario: loadScenarioAPI, 
    listScenarios,
    deleteScenario: deleteScenarioAPI,
    loading: saveLoadLoading 
  } = useScenarioSaveLoad();

  // Dialog states
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<any[]>([]);

  // Track if A-Frame inspector is open
  const [inspectorActive, setInspectorActive] = useState(false);

  useEffect(() => {
    const handleOpen = () => setInspectorActive(true);
    const handleClose = async () => {
      setInspectorActive(false);
      // Wait for any pending debounced updates to complete (500ms + buffer)
      await new Promise(resolve => setTimeout(resolve, 600));
      // Reload world state from backend to ensure sync
      try {
        await loadWorld();
        console.log('✅ World state reloaded after inspector close');
      } catch (err) {
        console.error('❌ Failed to reload world after inspector close:', err);
      }
    };

    window.addEventListener("inspector-opened", handleOpen as any);
    window.addEventListener("inspector-closed", handleClose as any);

    return () => {
      window.removeEventListener("inspector-opened", handleOpen as any);
      window.removeEventListener("inspector-closed", handleClose as any);
    };
  }, [loadWorld]);

  // Debug: track world object churn
  useEffect(() => {
    console.log("world object changed");
  }, [world]);

  // Stable callback for inspector → backend sync with optimistic update
  const handleComponentChange = useCallback(
    (entityId: string, componentName: string, componentData: unknown) => {
      console.log(
        "Syncing component change:",
        entityId,
        componentName,
        componentData
      );
      
      // ✅ OPTIMISTIC UPDATE: Immediately update React state
      setWorld({
        entities: world.entities.map((e) =>
          e.id === entityId 
            ? { ...e, [componentName]: componentData } 
            : e
        ),
      });
      
      // ⏱️ DEBOUNCED SAVE: Save to backend after 500ms of inactivity
      updateComponentDebounced(entityId, componentName, componentData, 500);
    },
    [updateComponentDebounced]
  );

  // Stable callback for entity removal in inspector
  const handleEntityRemove = useCallback(
    async (entityId: string) => {
      console.log(`🗑️ Inspector deleted entity ${entityId}, syncing to backend...`);
      
      try {
        // Import API config
        const { URLS } = await import('../../ApiConfig');
        
        // Call backend API directly (without optimistic update)
        // The DOM element is ALREADY removed by inspector, so we don't want React to try removing it
        const response = await fetch(`${URLS.SCENARIO_API}/entities/${entityId}`, {
          method: 'DELETE'
        });
        
        if (!response.ok) {
          throw new Error(`Failed to delete entity: ${response.statusText}`);
        }
        
        console.log(`✅ Entity ${entityId} deleted from backend`);
        
        // Instead of updating state directly (which causes React to try removing DOM),
        // reload the entire world from backend. This is safer and avoids race conditions.
        await loadWorld();
        console.log(`✅ World reloaded after deletion`);
      } catch (err) {
        console.error(`❌ Failed to delete entity ${entityId}:`, err);
        // On error, reload world to restore correct state
        await loadWorld();
      }
    },
    [loadWorld]
  );

  // A-Frame synchronization: persist inspector edits for ECS entities
  useAFrameSync(world.entities, {
    onComponentChange: handleComponentChange,
    onEntityRemove: handleEntityRemove,
    watchedComponents: ["position", "rotation", "scale", "color"],
  });

  // Load world on first mount only
  useEffect(() => {
    loadWorld().catch((err) => {
      console.error("Failed to load world:", err);
      alert("Error loading world. Make sure backend is running.");
    });

    return () => {
      clearAllTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearAllTimers]);

  // Handle adding entity from model
  const handleAddEntity = async (
    modelName: string,
    overrides?: Record<string, any>
  ) => {
    try {
      await createEntityFromModel({ modelName, overrides });
    } catch (err) {
      console.error("Failed to add entity:", err);
      alert("Error adding entity. Make sure backend is running.");
    }
  };

  // Handle removing last entity
  const handleRemoveLastEntity = async () => {
    if (world.entities.length === 0) {
      alert("No entities to remove");
      return;
    }

    const lastEntity = world.entities[world.entities.length - 1];

    try {
      await deleteEntity(lastEntity.id);
    } catch (err) {
      console.error("Failed to remove entity:", err);
      alert("Error removing entity.");
    }
  };

  // Handle creating new world
  const handleCreateNewWorld = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to reset the world? All entities will be removed."
    );
    if (!confirmed) return;

    try {
      await createNewWorld();
      alert("New world created successfully!");
    } catch (err) {
      console.error("Failed to create new world:", err);
      alert("Error creating new world.");
    }
  };

  // Handle save scenario
  const handleSaveScenario = async (name: string, description?: string) => {
    try {
      const camera = getCurrentCamera();
      await saveScenarioAPI({ 
        name, 
        description,
        camera: camera || undefined 
      });
      alert(`Scenario "${name}" saved successfully!`);
      setShowSaveDialog(false);
    } catch (err) {
      console.error('Failed to save scenario:', err);
      alert('Error saving scenario. Make sure backend is running.');
    }
  };

  // Handle load scenario
  const handleLoadScenario = async (filename: string) => {
    try {
      const result = await loadScenarioAPI(filename);
      
      // Update world state
      setWorld(result.world);
      
      // Restore camera position if available
      if (result.scenario.camera && setCameraState) {
        setTimeout(() => {
          setCameraState(result.scenario.camera);
        }, 100);
      }
      
      alert(`Scenario "${result.scenario.name}" loaded successfully!`);
      setShowLoadDialog(false);
    } catch (err) {
      console.error('Failed to load scenario:', err);
      alert('Error loading scenario. Make sure backend is running.');
    }
  };

  // Handle delete scenario
  const handleDeleteScenario = async (filename: string) => {
    try {
      await deleteScenarioAPI(filename);
      // Refresh the list
      const scenarios = await listScenarios();
      setSavedScenarios(scenarios);
    } catch (err) {
      console.error('Failed to delete scenario:', err);
      alert('Error deleting scenario.');
    }
  };

  // Load scenarios list when opening load dialog
  const handleOpenLoadDialog = async () => {
    try {
      const scenarios = await listScenarios();
      setSavedScenarios(scenarios);
      setShowLoadDialog(true);
    } catch (err) {
      console.error('Failed to list scenarios:', err);
      alert('Error loading scenarios list.');
    }
  };

  const isLoading = worldLoading || entityLoading || componentLoading;

  // GPU Memory Cleanup - Dispose A-Frame scene and renderer on unmount
  useEffect(() => {
    return () => {
      console.log("🧹 Cleaning up A-Frame scene and GPU resources (Builder)...");
      
      // 1. Force A-Frame to release the renderer
      const scene = document.querySelector('a-scene');
      if (scene) {
        const sceneEl = scene as any;
        
        // Dispose of the Three.js renderer to free GPU memory
        if (sceneEl.renderer) {
          sceneEl.renderer.dispose();
          console.log("✅ Builder: Renderer disposed");
        }
        
        // Remove the scene from DOM to free DOM memory
        if (scene.parentNode) {
          scene.parentNode.removeChild(scene);
          console.log("✅ Builder: Scene removed from DOM");
        }
      }
    };
  }, []);

  return (
    <ScenarioContext.Provider
      value={{
        world,
        models,
        loading: isLoading,
        error: worldError || entityError,
        loadWorld: async () => { await loadWorld(); },
        createNewWorld: handleCreateNewWorld,
        addEntity: handleAddEntity,
        removeLastEntity: handleRemoveLastEntity,
        deleteEntity,
        queryEntities,
        onModelSelect: (name: string) => {
            setSelectedModel(name);
        },
      }}
    >
      <div className={styles.BuilderPageContainer}>
        <BuilderSidePanel />

        {/* Save/Load Dialogs */}
        {showSaveDialog && (
          <ScenarioSaveDialog
            onSave={handleSaveScenario}
            onCancel={() => setShowSaveDialog(false)}
            loading={saveLoadLoading}
          />
        )}
        {selectedModel && (
            <PropertiesPanel 
                modelName={selectedModel} 
                onClose={() => setSelectedModel(null)} 
            />
        )}
        {showLoadDialog && (
          <ScenarioLoadDialog
            scenarios={savedScenarios}
            onLoad={handleLoadScenario}
            onCancel={() => setShowLoadDialog(false)}
            onDelete={handleDeleteScenario}
            loading={saveLoadLoading}
          />
        )}

        {/* Full screen A-Frame scene */}
        <div style={{ flex: 1 }}>
          <div className={styles.overlayText}>
            ctrl + i to open inspector
            <button style={{ marginLeft: 12 }} onClick={saveCameraNow}>
              Save Camera
            </button>
            <button 
              style={{ marginLeft: 12, backgroundColor: '#00d9ff', color: '#000', fontWeight: 'bold' }} 
              onClick={() => setShowSaveDialog(true)}
              disabled={isLoading}
            >
              💾 Save Scenario
            </button>
            <button 
              style={{ marginLeft: 12, backgroundColor: '#00ff88', color: '#000', fontWeight: 'bold' }} 
              onClick={handleOpenLoadDialog}
              disabled={isLoading}
            >
              📂 Load Scenario
            </button>
            <button 
              style={{ marginLeft: 12, backgroundColor: '#ff4444', color: '#fff', fontWeight: 'bold' }} 
              onClick={handleCreateNewWorld}
              disabled={isLoading}
            >
              🗑️ Clear World
            </button>
          </div>

          <Scene
            embedded
            vr-mode-ui="enabled: true"
            style={{ width: "100%", height: "100%" }}
          >
            <AEntity
              light={{ type: "ambient", color: "#ffffff", intensity: 0.6 }}
            />
            <AEntity
              light={{
                type: "directional",
                color: "#ffffff",
                intensity: 0.9,
              }}
              position="0 2 -6"
            />

            {/* Ground plane */}
            <AEntity
              primitive="a-plane"
              position="0 -1 -4"
              rotation="-90 0 0"
              width="20"
              height="20"
              color="#222222"
            />

            {/* Render entities from backend */}
            {world.entities.map((e) => {
              const pos = e.Position || { x: 0, y: 0, z: 0 };
              const rot = e.Rotation || { x: 0, y: 0, z: 0 };
              const scl = e.Scale || { x: 1, y: 1, z: 1 };
              const color = e.Color?.value || "#fff";
              const url = e.Model?.url;

              // Only set attributes when inspector is NOT active
              // This prevents React from interfering with inspector-controlled positions
              const entityProps = inspectorActive ? {} : {
                position: `${pos.x} ${pos.y} ${pos.z}`,
                rotation: `${rot.x} ${rot.y} ${rot.z}`,
                scale: `${scl.x} ${scl.y} ${scl.z}`
              };

              // Add error boundary key to help React recover from DOM sync issues
              const safeKey = `${e.id}-${world.entities.length}`;

              if (url === "Aframe") {
                const primitiveName =
                  typeof e.name === "string" && e.name.length > 0
                    ? `a-${e.name.toLowerCase()}`
                    : "a-box"; // safe default

                return (
                  <AEntity
                    key={e.id}
                    ecs-entity
                    data-entity-id={e.id}
                    primitive={primitiveName}
                    {...entityProps}
                    material={`color: ${color}`}
                  />
                );
              }

              return (
                <AEntity
                  key={e.id}
                  ecs-entity
                  data-entity-id={e.id}
                  gltf-model={`models${url}${url}.glb`}
                  {...entityProps}
                  material={`color: ${color}`}
                />
              );
            })}

            {/* Camera (frontend-only, persisted via hook) */}
            <AEntity primitive="a-camera" look-controls="enabled: true" />
          </Scene>
        </div>
      </div>
    </ScenarioContext.Provider>
  );
};

export default BuilderPage;
