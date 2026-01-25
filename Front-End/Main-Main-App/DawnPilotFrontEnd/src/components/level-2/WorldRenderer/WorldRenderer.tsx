import 'aframe';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import React from 'react';
import groundTexture from "../../../assets/ground/ground.jpg";

interface WorldSceneProps {
  entities: any[];
  onCameraRef?: React.RefObject<any>;
  isMobile?: boolean;
  showStats?: boolean;
  children?: React.ReactNode;
}

export const WorldScene: React.FC<WorldSceneProps> = ({
  entities,
  onCameraRef, // Intended for camera ref passing if needed, though camera usually passed in children
  isMobile = false,
  showStats = false,
  children
}) => {
  return (
    <Scene
      embedded
      vr-mode-ui={`enabled: ${isMobile}`}
      renderer="preserveDrawingBuffer: true; antialias: false"
      style={{ width: '100%', height: '100%' }}
      {...(showStats ? { stats: true } : {})}
    >

       <Entity primitive="a-sky" color="#87CEEB" />
        <Entity light={{ type: "ambient", color: "#ffffff", intensity: 0.8 }} />
        <Entity light={{ type: "directional", color: "#ffffff", intensity: 1.0 }} position="5 10 2" />
        
            <Entity
              primitive="a-plane"
              position="0 0 0"
              rotation="-90 0 0"
              width="50"
              height="100"
              material={{ src: groundTexture, repeat: "20 20" }}
              segments-width="50"
              segments-height="100"
            />
            
      {/* Shared Entity Rendering Logic */}
      {entities.map((e) => {
        const pos = e.Position || { x: 0, y: 0, z: 0 };
        const rot = e.Rotation || { x: 0, y: 0, z: 0 };
        const scl = e.Scale || { x: 1, y: 1, z: 1 };
        const color = e.Color?.value || '#fff';
        const url = e.Model?.url;
        const isObstacle = e.name !== "Light";

        // Collision weight logic (from Researcher view)
        const collisionWeight = e.Collision?.weight || { x: 1, y: 0.5, z: 0.5 };
        const collisionWeightFormatted = `x: ${collisionWeight.x}; y: ${collisionWeight.y}; z: ${collisionWeight.z}`;

        // 1. Primitive Entities (A-Frame)
        if (url === 'Aframe') {
          const tag = `a-${e.name.toLowerCase()}`;
          return (
            <Entity
              key={e.id}
              primitive={tag}
              position={`${pos.x} ${pos.y} ${pos.z}`}
              rotation={`${rot.x} ${rot.y} ${rot.z}`}
              scale={`${scl.x} ${scl.y} ${scl.z}`}
              material={`color: ${color}`}
              className={isObstacle ? "collidable" : ""}
              collision-weight={collisionWeightFormatted}
            />
          );
        }

        // 2. GLTF Models
        // Standardized path construction used in Builder/Researcher
        const modelPath = `models${url}${url}.glb`;

        return (
          <Entity
            key={e.id}
            className={isObstacle ? "collidable" : ""}
            gltf-model={modelPath}
            position={`${pos.x} ${pos.y} ${pos.z}`}
            rotation={`${rot.x} ${rot.y} ${rot.z}`}
            scale={`${scl.x} ${scl.y} ${scl.z}`}
            material={`color: ${color}`}
            collision-weight={collisionWeightFormatted}
          />
        );
      })}

      {/* Render children (Sky, Lights, Ground, Camera, Rigs) */}
      {children}
    </Scene>
  );
};

export default WorldScene;