/**
 * Example integration of YOLO Dataset Generator
 * 
 * This file demonstrates how to integrate the yolo-dataset-generator component
 * into your existing Researcher view for generating synthetic training data.
 */

import "aframe";
import "../AFrameComponents/VRMovementControls";
import "../AFrameComponents/YoloDatasetGenerator"; // ← Add this import
import { Entity, Scene } from "aframe-react";
import { useRef, useState } from "react";
import { useScenarioWorld } from "../hooks/useScenarioWorld";

function YoloDatasetExample() {
  const { world } = useScenarioWorld();
  const [captureEnabled, setCaptureEnabled] = useState(false);
  const [captureInterval, setCaptureInterval] = useState(60);
  
  const handleStartCapture = () => {
    setCaptureEnabled(true);
    console.log("📸 Starting YOLO dataset capture...");
  };

  const handleStopCapture = () => {
    setCaptureEnabled(false);
    console.log("⏹️ Stopped YOLO dataset capture");
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      
      {/* Control Panel */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          background: "rgba(0,0,0,0.8)",
          color: "white",
          padding: "16px",
          borderRadius: "8px",
          fontSize: "14px",
          fontFamily: "monospace",
        }}
      >
        <h3 style={{ margin: "0 0 12px 0" }}>🎯 YOLO Dataset Generator</h3>
        
        <div style={{ marginBottom: "12px" }}>
          <label>
            Capture Interval (frames):
            <input
              type="number"
              value={captureInterval}
              onChange={(e) => setCaptureInterval(parseInt(e.target.value))}
              style={{ 
                marginLeft: "8px", 
                width: "60px",
                background: "#333",
                color: "white",
                border: "1px solid #555",
                padding: "4px"
              }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleStartCapture}
            disabled={captureEnabled}
            style={{
              padding: "8px 16px",
              background: captureEnabled ? "#555" : "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: captureEnabled ? "not-allowed" : "pointer",
            }}
          >
            ▶️ Start
          </button>
          <button
            onClick={handleStopCapture}
            disabled={!captureEnabled}
            style={{
              padding: "8px 16px",
              background: !captureEnabled ? "#555" : "#f44336",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: !captureEnabled ? "not-allowed" : "pointer",
            }}
          >
            ⏹️ Stop
          </button>
        </div>

        <div style={{ marginTop: "12px", fontSize: "12px", color: "#aaa" }}>
          Status: {captureEnabled ? "🔴 Recording" : "⚪ Idle"}
        </div>
      </div>

      {/* A-Frame Scene */}
      <Scene
        embedded
        vr-mode-ui="enabled: false"
        renderer="preserveDrawingBuffer: true; antialias: false"
        
        {/* ========================================
            YOLO Dataset Generator Configuration
            ======================================== */}
        yolo-dataset-generator={`
          enabled: ${captureEnabled};
          targetClass: detectable;
          captureInterval: ${captureInterval};
          autoDownload: true;
          logToConsole: true;
          occlusionCheckLayers: collidable;
          classMapping: {"Box": 0, "Sphere": 1, "Cylinder": 2, "Car": 3};
          minVisiblePixels: 10;
        `}
        
        style={{ width: "100%", height: "100%" }}
      >
        {/* Sky */}
        <Entity primitive="a-sky" color="#87CEEB" />

        {/* Lighting */}
        <Entity light={{ type: "ambient", color: "#ffffff", intensity: 0.8 }} />
        <Entity
          light={{ type: "directional", color: "#ffffff", intensity: 0.6 }}
          position="5 10 5"
        />

        {/* Ground */}
        <Entity
          primitive="a-plane"
          rotation="-90 0 0"
          scale="50 50 1"
          color="#7CFC00"
          className="collidable"
        />

        {/* ========================================
            DETECTABLE OBJECTS
            Must have:
            - className="detectable"
            - data-entity-name="NameMatchingClassMapping"
            ======================================== */}

        {/* Box Examples */}
        <Entity
          primitive="a-box"
          position="-3 0.5 -5"
          scale="1 1 1"
          color="#FF0000"
          className="detectable collidable"
          data-entity-name="Box"
        />

        <Entity
          primitive="a-box"
          position="3 0.5 -5"
          scale="1 1 1"
          color="#FF6666"
          className="detectable collidable"
          data-entity-name="Box"
        />

        {/* Sphere Examples */}
        <Entity
          primitive="a-sphere"
          position="-1 1 -7"
          scale="1 1 1"
          color="#0000FF"
          className="detectable"
          data-entity-name="Sphere"
        />

        <Entity
          primitive="a-sphere"
          position="1 1 -7"
          scale="0.8 0.8 0.8"
          color="#6666FF"
          className="detectable"
          data-entity-name="Sphere"
        />

        {/* Cylinder Examples */}
        <Entity
          primitive="a-cylinder"
          position="0 1 -10"
          scale="1 1 1"
          color="#00FF00"
          className="detectable collidable"
          data-entity-name="Cylinder"
        />

        {/* Occluding Wall (blocks view of objects behind it) */}
        <Entity
          primitive="a-box"
          position="0 2 -8"
          scale="6 4 0.5"
          color="#888888"
          material="opacity: 0.7; transparent: true"
          className="collidable"
        />

        {/* Object behind wall (should be occluded in certain angles) */}
        <Entity
          primitive="a-sphere"
          position="0 1 -9"
          scale="1 1 1"
          color="#FF00FF"
          className="detectable"
          data-entity-name="Sphere"
        />

        {/* Dynamic entities from backend */}
        {world.entities.map((e) => {
          const pos = e.Position || { x: 0, y: 0, z: 0 };
          const rot = e.Rotation || { x: 0, y: 0, z: 0 };
          const scl = e.Scale || { x: 1, y: 1, z: 1 };
          const url = e.Model?.url;

          // Determine if entity should be detectable
          const isDetectable = e.name !== "Light" && e.name !== "Zone";
          const isObstacle = e.name !== "Light";

          if (url === "Aframe") {
            const tag = `a-${e.name.toLowerCase()}`;
            return (
              <Entity
                key={e.id}
                primitive={tag}
                position={`${pos.x} ${pos.y} ${pos.z}`}
                rotation={`${rot.x} ${rot.y} ${rot.z}`}
                scale={`${scl.x} ${scl.y} ${scl.z}`}
                className={
                  isDetectable ? "detectable collidable" : ""
                }
                data-entity-name={e.name}
              />
            );
          }

          return (
            <Entity
              key={e.id}
              gltf-model={url}
              position={`${pos.x} ${pos.y} ${pos.z}`}
              rotation={`${rot.x} ${rot.y} ${rot.z}`}
              scale={`${scl.x} ${scl.y} ${scl.z}`}
              className={
                isDetectable ? "detectable collidable" : ""
              }
              data-entity-name={e.name}
            />
          );
        })}

        {/* Camera with VR controls */}
        <Entity
          primitive="a-camera"
          position="0 1.6 5"
          look-controls="enabled: true"
          wasd-controls="enabled: true; acceleration: 65"
        />
      </Scene>
    </div>
  );
}

export default YoloDatasetExample;

/* ========================================
   USAGE NOTES
   ========================================

   1. Start/Stop Capture:
      - Click "Start" to begin capturing frames
      - Move around the scene with WASD + mouse
      - Objects will be automatically detected and labeled
      - Files will download automatically (frame_XXXX.jpg + frame_XXXX.txt)

   2. Adjust Capture Rate:
      - Lower interval = more frames (heavier)
      - Higher interval = fewer frames (lighter)
      - Recommended: 60 frames (~1 per second at 60fps)

   3. Class Mapping:
      - Edit classMapping in yolo-dataset-generator config
      - Must match data-entity-name attributes
      - Example: {"Box": 0, "Sphere": 1, "Car": 2}

   4. Occlusion Testing:
      - Move camera so objects are behind the wall
      - They should be detected as occluded and skipped

   5. Output Files:
      - frame_0000.jpg, frame_0000.txt
      - frame_0001.jpg, frame_0001.txt
      - etc.

   6. Console Logs:
      - Open browser console (F12)
      - See real-time detection info
      - YOLO annotations logged for each frame

   ======================================== */
