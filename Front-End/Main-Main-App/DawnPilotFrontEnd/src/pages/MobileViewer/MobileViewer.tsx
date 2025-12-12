import "aframe";
import "aframe-particle-system-component";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from "aframe-react";
import { useEffect, useRef, useState } from "react";
import { useScenarioWorld } from "../../hooks/useScenarioWorld";
import { useComponentManager } from "../../hooks/useComponentManager";
import { useFrameBuffer, getFolderHandle } from "../../hooks/useFrameBuffer";
import { useCameraSync } from "../../hooks/useCameraSync";
import carImg from "../../assets/frame_159_234589.png.png"; 
import { useBinaryStream } from "../../hooks/useBinarySystem";
import { useMockStream } from "../../hooks/testing/useMockSteam";
// import { SOCKET_URL } from '../../config/api';
const SOCKET_URL = "http://192.168.1.117:5000";
if (typeof AFRAME !== "undefined" && !AFRAME.components["canvas-updater"]) {
  AFRAME.registerComponent("canvas-updater", {
    schema: { src: { type: "selector" } }, 

    init: function () {
      const canvas = this.data.src;
      // Access THREE via the global AFRAME object
      this.texture = new AFRAME.THREE.CanvasTexture(canvas);

      const mesh = this.el.getObject3D("mesh");
      if (mesh) {
        mesh.material = new AFRAME.THREE.MeshBasicMaterial({
          map: this.texture,
          transparent: true,
          side: AFRAME.THREE.DoubleSide,
        });
      }
    },

    tick: function () {
      if (this.texture) {
        this.texture.needsUpdate = true;
      }
    },
  });
}
function MobileView() {
  const cameraRef = useRef<any>(null);
  const rigRef = useRef<any>(null);

  const hasReceivedPosition = useRef(false);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 0, z: 0 });

  const { world, loadWorld } = useScenarioWorld();
  const { clearAllTimers } = useComponentManager();

  // Mobile follows desktop camera
  const { isConnected, setOnCameraUpdate } = useCameraSync({
    clientType: "mobile",
    throttleMs: 16,
  });
  // This paints incoming WebSocket frames to 'hudCanvasRef'
  // const hudCanvasRef = useBinaryStream(socket);
  // Enable framebuffer capture / saving
  useFrameBuffer({
    logInterval: 1000,
    logPixelData: false,
    downsamplePercentage: 50,
  });
  const hudCanvasRef = useMockStream();
  // Load world once
  useEffect(() => {
    loadWorld()
      .then((data) => {
        console.log("Mobile - World loaded, entities:", data.entities.length);
      })
      .catch((err) => {
        console.error("Failed to load world:", err);
        alert("Error loading world. Make sure backend is running.");
      });

    return () => {
      clearAllTimers();
    };
  }, [loadWorld, clearAllTimers]);

  // When desktop camera updates, move/animate rig
  useEffect(() => {
    setOnCameraUpdate((camera) => {
      const newPos = camera.position;

      if (!hasReceivedPosition.current) {
        hasReceivedPosition.current = true;
        if (rigRef.current?.el?.object3D) {
          rigRef.current.el.object3D.position.set(newPos.x, newPos.y, newPos.z);
        }
      } else {
        const rigEl = rigRef.current?.el;
        if (rigEl) {
          rigEl.setAttribute("animation__follow", {
            property: "position",
            to: `${newPos.x} ${newPos.y} ${newPos.z}`,
            dur: 200,
            easing: "easeOutQuad",
            startEvents: "follow-target",
            autoplay: false,
          });
          rigEl.emit("follow-target", null, false);
        }
      }

      setCameraPosition(newPos);
    });
  }, [setOnCameraUpdate]);

  return (
    <div
      style={{
        background: "black",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <style>{`
        .a-enter-vr-button {
          bottom: 20% !important;
          position: fixed !important;
          z-index: 99999 !important;
        }
        body {
          overflow: hidden !important;
        }
      `}</style>

      {/* WebSocket Connection Status */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          background: isConnected ? "#4CAF50" : "#f44336",
          color: "white",
          padding: "8px 16px",
          borderRadius: "4px",
          fontSize: "12px",
          fontFamily: "monospace",
        }}
      >
        {/* --- 4. The Hidden Buffer Canvas --- */}
        {/* A-Frame reads from this canvas. It is invisible to the user. */}
        <canvas
          ref={hudCanvasRef}
          id="hud-buffer"
          width="640"
          height="360"
          style={{ display: "none" }}
        />
        {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
        <div style={{ fontSize: "9px", marginTop: "4px", opacity: 0.8 }}>
          {SOCKET_URL}
        </div>
      </div>

      {/* Mobile Mode Status */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1000,
          background: "#2196F3",
          color: "white",
          padding: "8px 16px",
          borderRadius: "4px",
          fontSize: "12px",
          fontFamily: "monospace",
        }}
      >
        📱 Mobile Viewer (Following Desktop)
      </div>

      {/* Camera Position Display */}
      <div
        style={{
          position: "absolute",
          top: 50,
          right: 10,
          zIndex: 1000,
          background: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "8px",
          borderRadius: "4px",
          fontSize: "10px",
          fontFamily: "monospace",
        }}
      >
        <div>X: {cameraPosition.x.toFixed(2)}</div>
        <div>Y: {cameraPosition.y.toFixed(2)}</div>
        <div>Z: {cameraPosition.z.toFixed(2)}</div>
      </div>

      {/* Folder picker button – calls getFolderHandle from user gesture */}
      <button
        style={{
          position: "absolute",
          bottom: 10,
          right: 10,
          zIndex: 1000,
          padding: "8px 16px",
          borderRadius: 4,
          border: "none",
          cursor: "pointer",
          background: "#FF9800",
          color: "#fff",
          fontSize: "12px",
          fontFamily: "monospace",
        }}
        onClick={async () => {
          try {
            await getFolderHandle(); // opens showDirectoryPicker once
          } catch (err) {
            console.error("Failed to select folder", err);
          }
        }}
      >
        Select Folder to Save Frames
      </button>

      <Scene
        embedded
        vr-mode-ui="enabled: true"
        device-orientation-permission-ui="enabled: true"
        fog="type: linear; color: #111; near: 50; far: 200"
        style={{ width: "100%", height: "100%" }}
      >
        <Entity primitive="a-assets">
          <img id="comicbook" crossOrigin="anonymous" src={carImg} />
        </Entity>

        {/* Sky */}
        <Entity primitive="a-sky" color="#87CEEB" />

        {/* Lights */}
        <Entity light={{ type: "ambient", color: "#ffffff", intensity: 0.8 }} />
        <Entity
          light={{ type: "directional", color: "#ffffff", intensity: 1.0 }}
          position="5 10 2"
        />
        <Entity
          light={{ type: "directional", color: "#ffffff", intensity: 0.9 }}
          position="0 2 -6"
        />

        {/* Ground */}
        <Entity
          primitive="a-plane"
          position="0 -1 -4"
          rotation="-90 0 0"
          width="1000"
          height="1000"
          color="#000000"
        />

        {/* Entities from backend */}
        {world.entities.map((e) => {
          const pos = e.Position || { x: 0, y: 0, z: 0 };
          const rot = e.Rotation || { x: 0, y: 0, z: 0 };
          const scl = e.Scale || { x: 1, y: 1, z: 1 };
          const color = e.Color?.value || "#fff";
          const url = e.Model?.url;

          if (url === "Aframe") {
            const tag = `a-${e.name.toLowerCase()}`;
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
              gltf-model={url}
              position={`${pos.x} ${pos.y} ${pos.z}`}
              rotation={`${rot.x} ${rot.y} ${rot.z}`}
              scale={`${scl.x} ${scl.y} ${scl.z}`}
            />
          );
        })}

        {/* Rig: position from desktop, orientation from phone */}
        <Entity
          ref={rigRef}
          animation__follow={{
            property: "position",
            dur: 200,
            easing: "easeOutQuad",
            startEvents: "follow-target",
            autoplay: false,
          }}
        >
          <Entity
            ref={cameraRef}
            primitive="a-camera"
            look-controls="enabled: true; touchEnabled: true; magicWindowTrackingEnabled: false; pointerLockEnabled: false"
          >
            {/* <Entity
              position="0 0 -1.5"
              layer="type: quad; src: #comicbook; width: 5; height: 3"
            /> */}

            {/* --- 6. The Dynamic HUD --- */}
            {/* We replaced 'layer' with a plane using our custom component. */}
            <Entity
              geometry="primitive: plane; width: 5; height: 2.5"
              position="0 0 -1.5"
              canvas-updater="src: #hud-buffer"
            />
          </Entity>
        </Entity>
      </Scene>
    </div>
  );
}

export default MobileView;
