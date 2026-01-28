import 'aframe';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import React, { useMemo } from 'react';
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
// ==================================================
  // ==================================================
  // HARDCODED WORLD SETTINGS
  // ==================================================
  const WORLD_WIDTH = 40; 
  const WORLD_DEPTH = 30;

  // 1. Define the Ground's Center Z
  // You want the ground to start at 0 and go to -60, so center is -30.
  const GROUND_Z =  -WORLD_DEPTH / 2 +2; 

  // 2. Define Wall Offsets relative to that center
  const wallOffsetX = WORLD_WIDTH / 2; // 20
  const wallOffsetZ = WORLD_DEPTH / 2; // 30

  // Texture Repeat
  const texRepeatX = WORLD_WIDTH / 2.5;
  const texRepeatZ = WORLD_DEPTH / 2.5;

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
       {/* GROUND PLANE (Centered at 0, 0, -30) */}
        <Entity
            primitive="a-plane"
            position={`0 0 ${GROUND_Z}`}
            rotation="-90 0 0"
            width={WORLD_WIDTH}
            height={WORLD_DEPTH} 
            material={{ src: groundTexture, repeat: `${texRepeatX} ${texRepeatZ}` }}
            segments-width="50"
            segments-height="100"
        />
            
        {/* ================================================== */}
        {/* BOUNDARY WALLS (Aligned to Ground Z)               */}
        {/* ================================================== */}
        
        {/* Left Wall (West) */}
        <Entity
          primitive="a-box"
          className="collidable"
          // Center X: -20, Center Z: -30 (Same as ground)
          position={`${-wallOffsetX} 5 ${GROUND_Z}`}
          width="1"
          height="10"
          depth={WORLD_DEPTH}
          material="opacity: 0; transparent: true"
        />

        {/* Right Wall (East) */}
        <Entity
          primitive="a-box"
          className="collidable"
          // Center X: 20, Center Z: -30 (Same as ground)
          position={`${wallOffsetX} 5 ${GROUND_Z}`}
          width="1"
          height="10"
          depth={WORLD_DEPTH}
          material="opacity: 0; transparent: true"
        />

        {/* Front Wall (North / Far Negative Z) */}
        <Entity
          primitive="a-box"
          className="collidable"
          // Center Z: -30 - 30 = -60 (The far edge)
          position={`0 5 ${GROUND_Z - wallOffsetZ}`}
          width={WORLD_WIDTH}
          height="10"
          depth="1"
          material="opacity: 0; transparent: true"
        />

        {/* Back Wall (South / Origin Z) */}
        <Entity
          primitive="a-box"
          className="collidable"
          // Center Z: -30 + 30 = 0 (The start edge)
          position={`0 5 ${GROUND_Z + wallOffsetZ}`}
          width={WORLD_WIDTH}
          height="10"
          depth="1"
          material="opacity: 0; transparent: true"
        />
        
        {/* ================================================== */}
            
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