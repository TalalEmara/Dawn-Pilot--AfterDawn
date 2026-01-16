import "aframe";
import "aframe-particle-system-component";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity } from "aframe-react";
import { useEffect, useRef, useState } from "react";
import { useScenarioWorld } from "../../hooks/useScenarioWorld";
import { useComponentManager } from "../../hooks/useComponentManager";
import { getFolderHandle } from "../../hooks/useFrameBuffer";
import { useCameraSync } from "../../hooks/useCameraSync";
import carImg from "../../assets/frame_159_234589.png.png";
import { useAiStream } from "../../hooks/useAiStream";
import WorldScene from "../../components/level-2/WorldRenderer/WorldRenderer";
import { SERVER_IP } from "../../ApiConfig";

// --- DEBUGGED CANVAS UPDATER ---
if (typeof AFRAME !== "undefined" && !AFRAME.components["canvas-updater"]) {
  AFRAME.registerComponent("canvas-updater", {
    schema: { src: { type: "selector" } },

    init: function () {
      console.log("🛠️ [Updater] Init called");
      
      const canvas = this.data.src;
      if (!canvas) {
        console.error("❌ [Updater] Canvas element not found!");
        return;
      }
      console.log("✅ [Updater] Found canvas:", canvas.id, canvas.width, canvas.height);

      // Create Texture
      try {
        this.texture = new AFRAME.THREE.CanvasTexture(canvas);
        console.log("✅ [Updater] Texture created:", this.texture);
      } catch (e) {
        console.error("❌ [Updater] Failed to create texture:", e);
      }

      // Check Mesh
      const mesh = this.el.getObject3D("mesh");
      if (!mesh) {
        console.warn("⚠️ [Updater] No mesh found on entity yet. Waiting for load...");
        this.el.addEventListener("model-loaded", () => {
          console.log("🛠️ [Updater] Model loaded, retrying init...");
          this.init();
        });
        return;
      }

      console.log("✅ [Updater] Mesh found, applying material...");
      
      // Apply Material
      try {
        mesh.material = new AFRAME.THREE.MeshBasicMaterial({
          map: this.texture,
          transparent: true,
          side: AFRAME.THREE.DoubleSide,
        });
        mesh.material.map.needsUpdate = true;
        console.log("✅ [Updater] Material applied successfully.");
      } catch (e) {
        console.error("❌ [Updater] Failed to apply material:", e);
      }
    },

    tick: function () {
      const canvas = this.data.src;
      // useBinarySystem writes to this attribute when it draws
      if (this.texture && canvas.getAttribute('data-updated') !== this.lastUpdated) {
        this.texture.needsUpdate = true;
        this.lastUpdated = canvas.getAttribute('data-updated');
      }
    },
  });
}

function MobileView() {
  const cameraRef = useRef<any>(null);
  const rigRef = useRef<any>(null);
  
  // Position Sync State
  const hasReceivedPosition = useRef(false);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 0, z: 0 });

  const { world, loadWorld } = useScenarioWorld();
  const { clearAllTimers } = useComponentManager();

  // 1. SYNC CONNECTION
  const { isConnected: isSyncConnected, setOnCameraUpdate, updateCamera } = useCameraSync({
    clientType: "mobile",
    throttleMs: 16,
  });

  // 2. AI CONNECTION (Receive Only)
  const { 
    socket: aiWebSocket, 
    canvasRef: hudCanvasRef, 
    isConnected: isAiConnected 
  } = useAiStream();

  // Debug Hook status
  useEffect(() => {
    console.log("📊 [MobileView] AI Stream Status:", {
      connected: isAiConnected,
      socketReady: aiWebSocket?.readyState,
      canvasRef: hudCanvasRef.current ? "Attached" : "Missing"
    });
  }, [isAiConnected, aiWebSocket, hudCanvasRef]);

  // 3. SEND ROTATION
  useEffect(() => {
    const broadcastLoop = () => {
      if (cameraRef.current && isSyncConnected) {
        const camEl = cameraRef.current.el;
        const rigEl = rigRef.current?.el;

        const rot = camEl.getAttribute("rotation");
        const pos = rigEl ? rigEl.getAttribute("position") : { x: 0, y: 0, z: 0 };

        if (rot) {
          updateCamera({
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation: { x: rot.x, y: rot.y, z: rot.z },
          });
        }
      }
      requestAnimationFrame(broadcastLoop);
    };
    const animationId = requestAnimationFrame(broadcastLoop);
    return () => cancelAnimationFrame(animationId);
  }, [updateCamera, isSyncConnected]);

  // Load world logic
  useEffect(() => {
    loadWorld()
      .then(() => console.log("🌍 [MobileView] World loaded"))
      .catch((err) => console.error("❌ [MobileView] Failed to load world:", err));

    return () => clearAllTimers();
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
// Add this inside MobileView function
useEffect(() => {
  if (!aiWebSocket || aiWebSocket.readyState !== WebSocket.OPEN) return;

  // Send a ping every second to keep the connection "Active" on the server
  const timer = setInterval(() => {
    console.log("💓 Sending heartbeat...");
    aiWebSocket.send(JSON.stringify({ type: "ping" })); 
  }, 1000);

  return () => clearInterval(timer);
}, [aiWebSocket]);
  return (
    <div style={{ background: "black", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <style>{`
        .a-enter-vr-button { bottom: 20% !important; position: fixed !important; z-index: 99999 !important; }
        body { overflow: hidden !important; }
      `}</style>

      {/* Debug Info UI */}
      <div style={{
        position: "absolute", top: 10, right: 10, zIndex: 1000,
        background: "rgba(0,0,0,0.5)", color: "white", padding: "8px 16px",
        borderRadius: "4px", fontSize: "12px", fontFamily: "monospace", textAlign: "right"
      }}>
        {/* HIDDEN CANVAS - CRITICAL FOR TEXTURE */}
        <canvas
          ref={hudCanvasRef}
          id="hud-buffer"
          width="640"
          height="360"
          style={{ display: "none" }} // Must exist in DOM even if hidden
        />
        <div>Sync: {isSyncConnected ? "🟢" : "🔴"}</div>
        <div>AI (Recv): {isAiConnected ? "🟢" : "🔴"}</div>
      </div>

      <div style={{
          position: "absolute", top: 10, left: 10, zIndex: 1000,
          background: "#2196F3", color: "white", padding: "8px 16px",
          borderRadius: "4px", fontSize: "12px", fontFamily: "monospace",
        }}>
        📱 Mobile Viewer
      </div>

      <button
        style={{
          position: "absolute", bottom: 10, right: 10, zIndex: 1000,
          padding: "8px 16px", borderRadius: 4, border: "none", cursor: "pointer",
          background: "#FF9800", color: "#fff", fontSize: "12px", fontFamily: "monospace",
        }}
        onClick={async () => {
          try { await getFolderHandle(); } 
          catch (err) { console.error("Failed to select folder", err); }
        }}
      >
        Select Folder
      </button>

      {/* --- INTEGRATED WORLD RENDERER --- */}
      <WorldScene entities={world.entities} isMobile={true}>
        
        {/* 1. Environment Overrides (Sky, Lights, Ground) */}
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

        {/* 2. Mobile Player Rig */}
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
            {/* 3. HUD Plane - The component logic ensures manual material creation */}
            <Entity
              className="hud-ignore"
              geometry="primitive: plane; width: 2; height: 1"
              position="0 0 -1.5"
              canvas-updater="src: #hud-buffer"
              // IMPORTANT: No 'material' prop here to avoid A-Frame overriding our custom material
            />
          </Entity>
        </Entity>

      </WorldScene>
    </div>
  );
}

export default MobileView;