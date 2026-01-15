import "aframe";
import "aframe-particle-system-component";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from "aframe-react";
import { useEffect, useRef, useState } from "react";
import { useScenarioWorld } from "../../hooks/useScenarioWorld";
import { useComponentManager } from "../../hooks/useComponentManager";
import { useCameraSync } from "../../hooks/useCameraSync";
import { useBinaryStream } from "../../hooks/useBinarySystem";
import { SERVER_IP } from "../../ApiConfig";
import groundTexture from "../../assets/ground/ground.jpg";
// Component to update texture from canvas
if (typeof AFRAME !== "undefined" && !AFRAME.components["canvas-updater"]) {
  AFRAME.registerComponent("canvas-updater", {
    schema: { src: { type: "selector" } },
    init: function () {
      const canvas = this.data.src;
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
      if (this.texture) this.texture.needsUpdate = true;
    },
  });
}

function MobileView() {
  const cameraRef = useRef<any>(null);
  const rigRef = useRef<any>(null);

  // State for AI WebSocket (Receiver Only)
  const [aiWebSocket, setAiWebSocket] = useState<WebSocket | null>(null);
  const hasReceivedPosition = useRef(false);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 0, z: 0 });

  const { world, loadWorld } = useScenarioWorld();
  const { clearAllTimers } = useComponentManager();

  // 1. SYNC CONNECTION (Port 5000)
  const {
    isConnected: isSyncConnected,
    setOnCameraUpdate,
    updateCamera,
  } = useCameraSync({
    clientType: "mobile",
    throttleMs: 16,
  });

  // 2. AI CONNECTION (Port 8000) - Receive Only
  useEffect(() => {
    const ws = new WebSocket(`ws://${SERVER_IP}:8000/ws/navigation-phosphene`);

    ws.onopen = () => {
      console.log("🟢 [Mobile] AI WebSocket Connected");
      setAiWebSocket(ws);
    };
    ws.onerror = (err) => console.error("🔴 AI Error:", err);
    ws.onclose = () => {
      console.log("🔴 [Mobile] AI WebSocket Disconnected");
      setAiWebSocket(null);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, []);

  // 3. RECEIVE HUD: Stream directly to canvas
  const hudCanvasRef = useBinaryStream(aiWebSocket);

  // 4. SEND ROTATION (Master of Rotation)
  useEffect(() => {
    const broadcastLoop = () => {
      if (cameraRef.current && isSyncConnected) {
        const camEl = cameraRef.current.el;
        const rigEl = rigRef.current?.el;

        // Get user head rotation
        const rot = camEl.getAttribute("rotation");
        // Get rig position (controlled by desktop)
        const pos = rigEl
          ? rigEl.getAttribute("position")
          : { x: 0, y: 0, z: 0 };

        if (rot) {
          // Send rotation so Desktop can match view
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

  // 5. RECEIVE POSITION (Slave of Position)
  useEffect(() => {
    setOnCameraUpdate((camera) => {
      const newPos = camera.position;
      // Apply -0.3 offset to y position (mobile camera lower than desktop)
      const adjustedY = newPos.y - 0;
      if (!hasReceivedPosition.current) {
        hasReceivedPosition.current = true;
        if (rigRef.current?.el?.object3D) {
          rigRef.current.el.object3D.position.set(newPos.x, adjustedY, newPos.z);
        }
      } else {
        const rigEl = rigRef.current?.el;
        if (rigEl) {
          // Smooth follow
          rigEl.setAttribute("animation__follow", {
            property: "position",
            to: `${newPos.x} ${adjustedY} ${newPos.z}`,
            dur: 200,
            easing: "easeOutQuad",
            startEvents: "follow-target",
            autoplay: false,
          });
          rigEl.emit("follow-target", null, false);
        }
      }
      setCameraPosition({ ...newPos, y: adjustedY });
    });
  }, [setOnCameraUpdate]);

  // Load World
  useEffect(() => {
    loadWorld().catch((err) => console.error("Failed to load world:", err));
    return () => clearAllTimers();
  }, [loadWorld, clearAllTimers]);

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
        .a-enter-vr-button { bottom: 20% !important; position: fixed !important; z-index: 99999 !important; }
        body { overflow: hidden !important; }
      `}</style>

      {/* Status UI */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          background: "rgba(0,0,0,0.5)",
          color: "white",
          padding: "8px",
          borderRadius: "4px",
          fontSize: "12px",
          fontFamily: "monospace",
          textAlign: "right",
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
        <div>
          AI (Recv): {aiWebSocket?.readyState === WebSocket.OPEN ? "🟢" : "🔴"}
        </div>
        <div>
          Pos: {cameraPosition.x.toFixed(1)}, {cameraPosition.y.toFixed(1)},{" "}
          {cameraPosition.z.toFixed(1)}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1000,
          background: "#0988efff",
          padding: "8px",
          borderRadius: "4px",
          fontSize: "12px",
          fontFamily: "monospace",
        }}
      >
        📱 Mobile Receiver
      </div>

      <Scene
        embedded
        vr-mode-ui="enabled: true"
        device-orientation-permission-ui="enabled: true"
        style={{ width: "100%", height: "100%" }}
        renderer="preserveDrawingBuffer: true; antialias: false"
      >
        <Entity primitive="a-sky" color="lightblue" />
        <Entity light={{ type: "ambient", color: "#ffffff", intensity: 1}} />
        {/* <Entity
          light={{ type: "directional", color: "#ffffff", intensity: 1.0 }}
          position="5 10 2"
        /> */}
        <Entity
          primitive="a-plane"
          position="0 0 0"
          rotation="-90 0 0"
          width="20"
          height="20"
          color="#ffffff"
          material={{ src: groundTexture, repeat: "20 20" }}
        />

        {/* World Entities */}
        {world.entities.map((e) => {
          const pos = e.Position || { x: 0, y: 0, z: 0 };
          const rot = e.Rotation || { x: 0, y: 0, z: 0 };
          const scl = e.Scale || { x: 1, y: 1, z: 1 };
          const color = e.Color?.value || "#fff";
          const url = e.Model?.url;
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
                material={`color: ${color}`}
                className={isObstacle ? "collidable" : ""}
              />
            );
          }
          return (
            <Entity
              key={e.id}
              className={isObstacle ? "collidable" : ""}
              gltf-model={`models${url}${url}.glb`}
              material={`color: ${color}`}
              position={`${pos.x} ${pos.y} ${pos.z}`}
              rotation={`${rot.x} ${rot.y} ${rot.z}`}
              scale={`${scl.x} ${scl.y} ${scl.z}`}
            />
          );
        })}

        {/* Rig (Position Controlled by Desktop) */}
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
            look-controls="enabled: true;"
            position="0 0 0"
          >
            {/* HUD Plane - Displays the Stream from AI */}
            {/* The canvas-updater component watches #hud-buffer which uses useBinaryStream to update */}
            <Entity
              className="hud-ignore"
              geometry="primitive: plane; width: 1.6; height: 0.9"
              position="0 0 -1" 
              canvas-updater="src: #hud-buffer"
              material="shader: flat; transparent: true; opacity: 1.0; depthTest: false"
              visible={true}
            />

            {/* Optional Background for Contrast */}
            <Entity
              geometry="primitive: plane; width: 10; height: 10"
              position="0 0 -1.1"
              material="color: black;"
            />
          </Entity>
        </Entity>
      </Scene>
    </div>
  );
}

export default MobileView;
