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
import { URLS, SERVER_IP } from "../../config";
// Port 8000 for Phosphene AI (Stream)

if (typeof AFRAME !== "undefined" && !AFRAME.components["canvas-updater"]) {
  AFRAME.registerComponent("canvas-updater", {
    schema: { src: { type: "selector" } }, // Accepts ID of the canvas

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
  
  // State for the AI WebSocket (separate from the sync socket)
  const [aiWebSocket, setAiWebSocket] = useState<WebSocket | null>(null);
  const frameIdRef = useRef<number>(0);

  const hasReceivedPosition = useRef(false);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 0, z: 0 });

  const { world, loadWorld } = useScenarioWorld();
  const { clearAllTimers } = useComponentManager();

 // ---------------------------------------------------------
  // CONNECTION 1: SYNC BACKEND (Port 5000)
  // ---------------------------------------------------------
  // useCameraSync imports the URL internally from config/api.ts
  const { isConnected: isSyncConnected, setOnCameraUpdate } = useCameraSync({
    clientType: "mobile",
    throttleMs: 16,
  });

  // ---------------------------------------------------------
  // CONNECTION 2: AI BACKEND (Port 8000) - Native WebSocket
  // ---------------------------------------------------------
  useEffect(() => {
    const ws = new WebSocket(`ws://${SERVER_IP}:8000/ws/navigation-phosphene`);

    ws.onopen = () => {
      console.log("🟢 AI WebSocket Connected");
      setAiWebSocket(ws);
    };

    ws.onerror = (error) => {
      console.error("🔴 AI WebSocket Error:", error);
    };

    ws.onclose = () => {
      console.log("🔴 AI WebSocket Disconnected");
      setAiWebSocket(null);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);
  // ---------------------------------------------------------
  // HOOK WIRING
  // ---------------------------------------------------------
  
  // 1. RECEIVE: Pass the WebSocket to the receiver hook
  const hudCanvasRef = useBinaryStream(aiWebSocket);

  // Helper to convert Blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
        resolve(base64.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // 2. SEND: Capture RGB + depth and send as JSON via WebSocket
  useFrameBuffer({
    enabled: aiWebSocket?.readyState === WebSocket.OPEN,
    logInterval: 1000/1,  // ~15 FPS
    onFrame: async (rgbBlob, depthBlob) => {
      if (aiWebSocket?.readyState !== WebSocket.OPEN) return;
      
      try {
        const rgbBase64 = await blobToBase64(rgbBlob);
        const depthBase64 = depthBlob ? await blobToBase64(depthBlob) : null;
        
        if (!depthBase64) {
          console.warn("⚠️ Depth not captured, skipping frame");
          return;
        }
        
        frameIdRef.current++;
        
        const message = {
          type: "frame",
          frame_id: String(frameIdRef.current).padStart(3, '0'),
          rgb: rgbBase64,
          depth: depthBase64,
          stage: "phosphene"  // Full pipeline
        };
        
        aiWebSocket.send(JSON.stringify(message));
      } catch (error) {
        console.error("Error sending frame:", error);
      }
    }
  });

  // Load world logic
  useEffect(() => {
    loadWorld()
      .then((data) => {
        console.log("Mobile - World loaded, entities:", data.entities.length);
      })
      .catch((err) => {
        console.error("Failed to load world:", err);
      });

    return () => {
      clearAllTimers();
    };
  }, [loadWorld, clearAllTimers]);

  // Sync Rig Position logic
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

      {/* Connection Status UI */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          background: "rgba(0,0,0,0.5)",
          color: "white",
          padding: "8px 16px",
          borderRadius: "4px",
          fontSize: "12px",
          fontFamily: "monospace",
          textAlign: "right"
        }}
      >
        {/* Hidden Buffer Canvas for HUD Texture */}
        <canvas
          ref={hudCanvasRef}
          id="hud-buffer"
          width="640"
          height="360"
          style={{ display: "none" }}
        />
        
        <div>Sync: {isSyncConnected ? "🟢" : "🔴"}</div>
        <div>AI: {aiWebSocket?.readyState === WebSocket.OPEN ? "🟢" : "🔴"}</div>
      </div>

      {/* Mobile Label */}
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
        📱 Mobile Viewer
      </div>

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
            await getFolderHandle();
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
        renderer="preserveDrawingBuffer: true; antialias: true"
      >
        <Entity primitive="a-assets">
          <img id="comicbook" crossOrigin="anonymous" src={carImg} />
        </Entity>

        <Entity primitive="a-sky" color="#87CEEB" />
        <Entity light={{ type: "ambient", color: "#ffffff", intensity: 0.8 }} />
        <Entity light={{ type: "directional", color: "#ffffff", intensity: 1.0 }} position="5 10 2" />

        <Entity
          primitive="a-plane"
          position="0 -1 -4"
          rotation="-90 0 0"
          width="1000"
          height="1000"
          color="#000000"
        />

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
            look-controls="enabled: true; touchEnabled: true;"
          >
            {/* ✅ HUD Plane using the AI Stream */}
            <Entity
              geometry="primitive: plane; width: 5; height: 2.5"
              position="0 0 -1.5"
              canvas-updater="src: #hud-buffer"
              material="shader: flat; transparent: true; depthTest: false"
            />
          </Entity>
        </Entity>
      </Scene>
    </div>
  );
}

export default MobileView;