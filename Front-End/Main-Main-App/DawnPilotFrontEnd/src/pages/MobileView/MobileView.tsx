import 'aframe';
import 'aframe-particle-system-component';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import { useScenarioWorld } from '../../hooks/useScenarioWorld';
import { useEffect } from 'react';
import { useComponentManager } from '../../hooks/useComponentManager';
import { useFrameBuffer } from '../../hooks/useFrameBuffer';

function MobileView() {
  // Enable buffer debugging (only in development)
  useFrameBuffer({
    logInterval: 50,      // Log every 3 seconds
    logPixelData: true,
    downsamplePercentage: 50     // Set to true to sample center pixel color
  });

  const {
    world,
    loadWorld,
  } = useScenarioWorld();

  const {
    clearAllTimers
  } = useComponentManager();

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

    function getFolderHandle() {
        throw new Error('Function not implemented.');
    }

  return (
    
    <div style={{ background: "Black", width: "100vw", height: "100vh" }}>
      <button
            onClick={async () => {
                await getFolderHandle();
            }}
            >
            Select Folder to Save Frames
            </button>
      <Scene
        embedded
        vr-mode-ui="enabled: true"
        style={{ width: "100%", height: "100%" }}
      >
        <Entity light={{ type: "ambient", color: "#ffffff", intensity: 0.6 }} />
        <Entity
          light={{ type: "directional", color: "#ffffff", intensity: 0.9 }}
          position="0 2 -6"
        />

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
          const color = e.Color?.value || "#fff";
          const url = e.Model?.url;

          console.log("Rendering entity:", e);
          console.log("Rendering url:", url);

          if (url === "Aframe") {
            const tag = `a-${e.name.toLowerCase()}`; // e.g. Sphere -> a-sphere
            console.log("Rendering primitive tag:", tag);
            return (
              <Entity
                key={e.id}
                primitive={tag}
                position={`${pos.x} ${pos.y} ${pos.z}`}
                rotation={`${rot.x} ${rot.y} ${rot.z}`}
                scale={`${scl.x} ${scl.y} ${scl.z}`}
                material={`color: ${color}`}
              />
            );
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
  );
}

export default MobileView;