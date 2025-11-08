import 'aframe';
import 'aframe-particle-system-component';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import React, { useEffect } from 'react';
import styles from './BuilderPage.module.css';
import BuilderSidePanel from '../../components/level-1/BuilderSidePanel/BuilderSidePanel';
import ScenarioContext from '../../contexts/ScenarioContext';
import { useScenarioWorld } from '../../hooks/useScenarioWorld';
import { useEntityManager } from '../../hooks/useEntityManager';
import { useComponentManager } from '../../hooks/useComponentManager';
import { useModelLibrary } from '../../hooks/useModelLibrary';
import PropertiesPanel from '../../components/level-1/PropertiesPanel/PropertiesPanel';
// import { useAFrameSync } from '../../hooks/useAframeSync';

const BuilderPage: React.FC = () => {
  // World management
  const {
    world,
    loading: worldLoading,
    error: worldError,
    loadWorld,
    createNewWorld,
    setWorld
  } = useScenarioWorld();

  // Entity operations
  const {
    loading: entityLoading,
    error: entityError,
    createEntityFromModel,
    createCustomEntity,
    deleteEntity,
    queryEntities
  } = useEntityManager((updatedEntities) => {
    // Update world state when entities change
    setWorld({ entities: updatedEntities });
  });

  // Component operations
  const {
    loading: componentLoading,
    updateComponentDebounced,
    clearAllTimers
  } = useComponentManager();

  // Model library
  const { models } = useModelLibrary();

  // A-Frame synchronization
  // useAFrameSync(world.entities, {
  //   onComponentChange: (entityId, componentName, componentData) => {
  //     console.log('Syncing component change:', entityId, componentName, componentData);
  //     updateComponentDebounced(entityId, componentName, componentData, 500);
  //   },
  //   watchedComponents: ['position', 'rotation', 'scale', 'color']
  // });

  // Load world on mount
  useEffect(() => {
    loadWorld().catch(err => {
      console.error('Failed to load world:', err);
      alert('Error loading world. Make sure backend is running.');
    });

    // Cleanup on unmount
    return () => {
      clearAllTimers();
    };
  }, [loadWorld, clearAllTimers]);

  // Handle adding entity from model
  const handleAddEntity = async (modelName: string, overrides?: Record<string, any>) => {
    try {
      await createEntityFromModel({ modelName, overrides });
    } catch (err) {
      console.error('Failed to add entity:', err);
      alert('Error adding entity. Make sure backend is running.');
    }
  };

  // Handle removing last entity
  const handleRemoveLastEntity = async () => {
    if (world.entities.length === 0) {
      alert('No entities to remove');
      return;
    }

    const lastEntity = world.entities[world.entities.length - 1];
    
    try {
      await deleteEntity(lastEntity.id);
    } catch (err) {
      console.error('Failed to remove entity:', err);
      alert('Error removing entity.');
    }
  };

  // Handle creating new world
  const handleCreateNewWorld = async () => {
    const confirmed = window.confirm('Are you sure you want to reset the world? All entities will be removed.');
    if (!confirmed) return;

    try {
      await createNewWorld();
      alert('New world created successfully!');
    } catch (err) {
      console.error('Failed to create new world:', err);
      alert('Error creating new world.');
    }
  };

  const isLoading = worldLoading || entityLoading || componentLoading;

  return (
    <ScenarioContext.Provider value={{
      world,
      models,
      loading: isLoading,
      error: worldError || entityError,
      loadWorld,
      createNewWorld: handleCreateNewWorld,
      addEntity: handleAddEntity,
      removeLastEntity: handleRemoveLastEntity,
      deleteEntity,
      queryEntities
    }}>
        {/* <PropertiesPanel /> */}
      <div className={styles.BuilderPageContainer}>
        <BuilderSidePanel />

        {/* Full screen AFrame scene */}
        <div style={{ flex: 1 }}>
          <div className={styles.overlayText}>
            ctrl + i to open inspector
          </div>
          
          <Scene
            embedded
            vr-mode-ui="enabled: true"
            style={{ width: '100%', height: '100%' }}
          >
            <Entity light={{ type: 'ambient', color: '#ffffff', intensity: 0.6 }} />
            <Entity light={{ type: 'directional', color: '#ffffff', intensity: 0.9 }} position="0 2 -6" />
            
            {/* Ground plane */}
            <Entity
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
  const color = e.Color?.value || '#fff';
  const url = e.Model?.url;

  console.log('Rendering entity:', e);
  console.log('Rendering url:', url);

  if (url === 'Aframe') {
    const tag = `a-${e.name.toLowerCase()}`; // e.g. Sphere -> a-sphere
    console.log('Rendering primitive tag:', tag);
    return (<Entity
      key={e.id}
      primitive={tag}
      position={`${pos.x} ${pos.y} ${pos.z}`}
      rotation={`${rot.x} ${rot.y} ${rot.z}`}
      scale={`${scl.x} ${scl.y} ${scl.z}`}
      material={`color: ${color}`}
    />);
  }

  return (
    <Entity
      key={e.id}
      gltfModel={url}
      position={`${pos.x} ${pos.y} ${pos.z}`}
      rotation={`${rot.x} ${rot.y} ${rot.z}`}
      scale={`${scl.x} ${scl.y} ${scl.z}`}
      material={`color: ${color}`}
    />
  );
})}


            {/* Camera */}
           <Entity
            primitive="a-camera"
            position="0 2 4"
            rotation="20 0 0"
            look-controls="enabled: true"
          />

          </Scene>
        </div>
      </div>
    </ScenarioContext.Provider>
  );
};

export default BuilderPage;