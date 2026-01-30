import 'aframe';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import React, { useEffect, useRef } from 'react';
import groundTexture from "../../../assets/ground/ground.jpg";

interface WorldSceneProps {
  entities: any[];
  onCameraRef?: React.RefObject<any>;
  isMobile?: boolean;
  showStats?: boolean;
  children?: React.ReactNode;
  worldWidth?: number;
  worldDepth?: number;
  groundZShift?: number;
  groundXShift?: number;
  isLiteMode?: boolean;
}

export const WorldScene: React.FC<WorldSceneProps> = ({
  entities,
  onCameraRef,
  isMobile = false,
  showStats = false,
  children,
  worldWidth = 40,
  worldDepth = 30,
  groundZShift = 2,
  groundXShift = 0,
  isLiteMode = false
}) => {
  const sceneRef = useRef<any>(null);

  // 🧹 CLEANUP LEAK: Force WebGL Context Disposal on Unmount
  useEffect(() => {
    return () => {
      const scene = sceneRef.current;
      if (scene) {
        console.log("🧹 Disposing A-Frame Scene & Renderer...");
        
        // 1. Dispose Renderer (Frees GPU Memory & WebGL Contexts)
        if (scene.renderer) {
          scene.renderer.dispose();
          scene.renderer.forceContextLoss();
          scene.renderer = null;
        }

        // 2. Deep Dispose of Objects (Frees Geometry/Material RAM)
        if (scene.object3D) {
          scene.object3D.traverse((node: any) => {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
              if (Array.isArray(node.material)) {
                node.material.forEach((m: any) => m.dispose());
              } else {
                node.material.dispose();
              }
            }
          });
        }
      }
    };
  }, []); // Run once on mount/unmount

// ==================================================
  // ==================================================
  // WORLD SETTINGS (Dynamic from Settings Panel)
  // ==================================================
  const WORLD_WIDTH = worldWidth; 
  const WORLD_DEPTH = worldDepth;

  // 1. Define the Ground's Center Z
  const GROUND_Z_SHIFT = groundZShift; 
  const GROUND_X_SHIFT = groundXShift;
  const GROUND_Z = -WORLD_DEPTH / 2 + GROUND_Z_SHIFT; 

  // 2. Define Wall Offsets relative to that center
  const wallOffsetX = WORLD_WIDTH / 2; // 20
  const wallOffsetZ = WORLD_DEPTH / 2; // 30

  // Texture Repeat
  const texRepeatX = WORLD_WIDTH / 2.5;
  const texRepeatZ = WORLD_DEPTH / 2.5;

  return (
    <Scene
      ref={sceneRef}
      embedded
      vr-mode-ui={`enabled: ${isMobile}`}
      renderer="preserveDrawingBuffer: true; antialias: false"
      style={{ width: '100%', height: '100%' }}
      {...(showStats ? { stats: true } : {})}
    >

       <Entity primitive="a-sky" color="#87CEEB" />
        <Entity light={{ type: "ambient", color: "#ffffff", intensity: 0.8 }} />
        <Entity light={{ type: "directional", color: "#ffffff", intensity: 1.0 }} position="5 10 2" />
       {/* GROUND PLANE (Centered at X shift, 0, calculated Z) */}
        <Entity
            key={`ground-${isLiteMode}`}
            primitive="a-plane"
            position={`${GROUND_X_SHIFT} ${isMobile? .6 :0} ${GROUND_Z}`}
            rotation="-90 0 0"
            width={WORLD_WIDTH}
            height={WORLD_DEPTH} 
            material={isLiteMode 
              ? { shader: 'flat', src: groundTexture, repeat: `${texRepeatX} ${texRepeatZ}`, fog: false, flatShading: true, dithering: false }
              : { src: groundTexture, repeat: `${texRepeatX} ${texRepeatZ}` }
            }
            segments-width={isLiteMode ? "10" : "50"}
            segments-height={isLiteMode ? "20" : "100"}
        />
            
        {/* ================================================== */}
        {/* BOUNDARY WALLS (Aligned to Ground Z)               */}
        {/* ================================================== */}
        
        {/* Left Wall (West) */}
        <Entity
          key={`wall-left-${isLiteMode}`}
          primitive="a-box"
          className="collidable"
          // Center X: -20, Center Z: -30 (Same as ground)
          position={`${-wallOffsetX} 5 ${GROUND_Z}`}
          width="1"
          height="10"
          depth={WORLD_DEPTH}
         material={isLiteMode 
           ? "shader: flat; color: white; opacity: 0.2; wireframe: true; fog: false; flatShading: true; dithering: false"
           : "color: white; depthTest: false; opacity: 0.2; wireframe: true"
         }
        />
        {/* Right Wall (East) */}
        <Entity
          key={`wall-right-${isLiteMode}`}
          primitive="a-box"
          className="collidable"
          // Center X: 20, Center Z: -30 (Same as ground)
          position={`${wallOffsetX} 5 ${GROUND_Z}`}
          width="1"
          height="10"
          depth={WORLD_DEPTH}
          material={isLiteMode 
            ? "shader: flat; color: white; opacity: 0.2; wireframe: true; fog: false; flatShading: true; dithering: false"
            : "color: white; depthTest: false; opacity: 0.2; wireframe: true"
          }
        />

        {/* Front Wall (North / Far Negative Z) */}
        <Entity
          key={`wall-front-${isLiteMode}`}
          primitive="a-box"
          className="collidable"
          // Center Z: -30 - 30 = -60 (The far edge)
          position={`0 5 ${GROUND_Z - wallOffsetZ}`}
          width={WORLD_WIDTH}
          height="10"
          depth="1"
          material={isLiteMode 
            ? "shader: flat; color: white; opacity: 0.2; wireframe: true; fog: false; flatShading: true; dithering: false"
            : "color: white; depthTest: false; opacity: 0.2; wireframe: true"
          }
        />

        {/* Back Wall (South / Origin Z) */}
        <Entity
          key={`wall-back-${isLiteMode}`}
          primitive="a-box"
          className="collidable"
          // Center Z: -30 + 30 = 0 (The start edge)
          position={`0 5 ${GROUND_Z + wallOffsetZ}`}
          width={WORLD_WIDTH}
          height="10"
          depth="1"
          material={isLiteMode 
            ? "shader: flat; color: white; opacity: 0.2; wireframe: true; fog: false; flatShading: true; dithering: false"
            : "color: white; depthTest: false; opacity: 0.2; wireframe: true"
          }
        />
        
        {/* ================================================== */}
            
      {/* Shared Entity Rendering Logic */}{entities.map((e) => {
        const pos = e.Position || { x: 0, y: 0, z: 0 };
        const adjustedPos = { ...pos, y: pos.y + (isMobile ? 0.6 : 0) };
        const rot = e.Rotation || { x: 0, y: 0, z: 0 };
        const scl = e.Scale || { x: 1, y: 1, z: 1 };
        const color = e.Color?.value || '#fff';
        const url = e.Model?.url;
        const isObstacle = e.name !== "Light";

        // 🎯 TARGET CHECK: Is this object named "Target"?
        const isTarget = e.name === "Target";

        // Collision weight logic
        const collisionWeight = e.Collision?.weight || { x: 1, y: 1, z: 1 };
        const collisionWeightFormatted = `x: ${collisionWeight.x}; y: ${collisionWeight.y}; z: ${collisionWeight.z}`;

        return (
          <React.Fragment key={e.id}>
            
            {/* 1. The Object Itself */}
            {url === 'Aframe' ? (
              <Entity
                primitive={`a-${e.name.toLowerCase()}`}
                position={`${adjustedPos.x} ${adjustedPos.y} ${adjustedPos.z}`}
                rotation={`${rot.x} ${rot.y} ${rot.z}`}
                scale={`${scl.x} ${scl.y} ${scl.z}`}
                material={isLiteMode 
                  ? `shader: flat; color: ${color}; fog: false; flatShading: true; dithering: false` 
                  : `color: ${color}`
                }
                className={isObstacle ? "collidable" : ""}
                collision-weight={collisionWeightFormatted}
              />
            ) : (
              <Entity
                className={isObstacle ? "collidable" : ""}
                gltf-model={`models${url}${url}.glb`}
                position={`${adjustedPos.x} ${adjustedPos.y} ${adjustedPos.z}`}
                rotation={`${rot.x} ${rot.y} ${rot.z}`}
                scale={`${scl.x} ${scl.y} ${scl.z}`}
                model-flattener={isLiteMode}
                material={isLiteMode 
                  ? `shader: flat; color: ${color}; fog: false; flatShading: true; dithering: false` 
                  : `color: ${color}`
                }
                collision-weight={collisionWeightFormatted}
              />
            )}

            {/* 2. THE GUIDE ARROW (Only if name is "Target") */}
            {isTarget && (
               <Entity
                 primitive="a-cone"
                 // Hover 4 meters above the object
                 position={`${adjustedPos.x} ${adjustedPos.y + 4} ${adjustedPos.z}`}
                 rotation="180 0 0" // Pointing Down
                 scale="0.1 0.5 0.1"
                 // bright yellow, ignore depth (see through walls), flat shading
                 material="color: #FFFF00; shader: flat; depthTest: false; transparent: true; opacity: 0.9"
                 // Bobbing animation
                 animation={`property: position; to: ${adjustedPos.x} ${adjustedPos.y + 3} ${adjustedPos.z}; dir: alternate; dur: 800; loop: true; easing: easeInOutSine`}
               />
            )}

          </React.Fragment>
        );
      })}

      {/* Render children (Sky, Lights, Ground, Camera, Rigs) */}
      {children}
    </Scene>
  );
};

export default WorldScene;