import "aframe";
import "aframe-particle-system-component";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity } from "aframe-react";
import { useEffect, useRef, useState } from "react";
import { useScenarioWorld } from "../../hooks/useScenarioWorld";
import { useComponentManager } from "../../hooks/useComponentManager";
import { useCameraSync } from "../../hooks/useCameraSync";
import { useAiStream } from "../../hooks/useAiStream";
import WorldScene from "../../components/level-2/WorldRenderer/WorldRenderer";

// --- DEBUGGED CANVAS UPDATER ---
if (typeof AFRAME !== "undefined" && !AFRAME.components["canvas-updater"]) {
  AFRAME.registerComponent("canvas-updater", {
    schema: { src: { type: "selector" } },

    init: function () {
      const canvas = this.data.src;
      if (!canvas) return;

      this.texture = new AFRAME.THREE.CanvasTexture(canvas);
      const mesh = this.el.getObject3D("mesh");
      if (!mesh) return;

      mesh.material = new AFRAME.THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        side: AFRAME.THREE.DoubleSide,
      });
      mesh.material.map.needsUpdate = true;
    },

    tick: function () {
      const canvas = this.data.src;
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
  
  // UI State
  const [alertStatus, setAlertStatus] = useState<'DANGER' | 'SAFE'>('SAFE');

  // --- LOGIC REFS (For Socket Listener) ---
  const alertStartTime = useRef<number>(0);       // When did the alert first appear?
  const isAlertVisible = useRef<boolean>(false);  // Track visibility without waiting for React state update
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null); // Reference to the "Safe" timer

  // Position Sync State
  const hasReceivedPosition = useRef(false);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 0, z: 0 });

  const { world, loadWorld } = useScenarioWorld();
  const { clearAllTimers } = useComponentManager();

  // 1. SYNC CONNECTION
  const { isConnected: isSyncConnected, setOnCameraUpdate, updateCamera, socket } = useCameraSync({
    clientType: "mobile",
    throttleMs: 16,
  });

  // 2. AI CONNECTION (Receive Only)
  const { 
    socket: aiWebSocket, 
    canvasRef: hudCanvasRef, 
    isConnected: isAiConnected 
  } = useAiStream();

  // 3. FOV & BLINDER CALCULATIONS
  const depth = 0.1; 
  const fovWidth = 17; 
  const fovHeight = 17; 
  const degToRad = (deg: number) => (deg * Math.PI) / 180;
  const hudWidth = 2 * depth * Math.tan(degToRad(fovWidth / 2));
  const hudHeight = 2 * depth * Math.tan(degToRad(fovHeight / 2));

  // --- SOCKET LISTENER WITH MINIMUM DURATION LOGIC ---
  useEffect(() => {
    if (!socket) return;

    const handleAlert = (data: { status: 'DANGER' | 'SAFE' }) => {
      // DANGER SIGNAL RECEIVED
      if (data.status === 'DANGER') {
        
        // If we were previously SAFE, mark the start time
        if (!isAlertVisible.current) {
           isAlertVisible.current = true;
           alertStartTime.current = Date.now();
           setAlertStatus('DANGER');
        }

        // If a "Hide Timer" was pending (e.g. we momentarily went SAFE),
        // cancel it immediately because we are back in danger.
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
      } 
      
      // SAFE SIGNAL RECEIVED
      else { 
        // Only hide if we are currently showing an alert
        if (isAlertVisible.current) {
           const MIN_DURATION = 2000; // 2 Seconds
           const elapsed = Date.now() - alertStartTime.current;

           if (elapsed < MIN_DURATION) {
             // If 2 seconds haven't passed yet, wait for the remaining time
             if (!hideTimerRef.current) {
                const remaining = MIN_DURATION - elapsed;
                hideTimerRef.current = setTimeout(() => {
                  setAlertStatus('SAFE');
                  isAlertVisible.current = false;
                  hideTimerRef.current = null;
                }, remaining);
             }
           } else {
             // If 2 seconds have passed, hide immediately
             setAlertStatus('SAFE');
             isAlertVisible.current = false;
           }
        }
      }
    };

    socket.on('alert:status', handleAlert);

    return () => {
      socket.off('alert:status', handleAlert);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [socket]);

  // Broadcast Loop
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

  // Keep-alive Heartbeat
  useEffect(() => {
    if (!aiWebSocket || aiWebSocket.readyState !== WebSocket.OPEN) return;
    const timer = setInterval(() => {
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
        <canvas
          ref={hudCanvasRef}
          id="hud-buffer"
          width="640"
          height="360"
          style={{ display: "none" }}
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

      <WorldScene entities={world.entities} isMobile={true}>
        
        {/* Environment Overrides */}
        <Entity primitive="a-sky" color="#87CEEB" />
        <Entity light={{ type: "ambient", color: "#ffffff", intensity: 0.8 }} />
        <Entity light={{ type: "directional", color: "#ffffff", intensity: 1.0 }} position="5 10 2" />
        <Entity
          primitive="a-plane"
          position="0 -1 -4"
          rotation="-90 0 0"
          width="1000"
          height="1000"
          material={{ src: groundTexture, repeat: "20 20" }}
        />

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
            {/* 1. THE BLINDER */}
           
{/* <Entity
              geometry={{ primitive: "plane", width: 5, height: (5 - hudHeight) / 2 }}
              position={`0 ${(5 + hudHeight) / 4} -${depth + 0.01}`}
              material="color: black; shader: flat; transparent: false;"
            />
            <Entity
              geometry={{ primitive: "plane", width: 5, height: (5 - hudHeight) / 2 }}
              position={`0 -${(5 + hudHeight) / 4} -${depth + 0.01}`}
              material="color: black; shader: flat; transparent: false;"
            />
            <Entity
              geometry={{ primitive: "plane", width: (5 - hudWidth) / 2, height: hudHeight }}
              position={`-${(5 + hudWidth) / 4} 0 -${depth + 0.01}`}
              material="color: black; shader: flat; transparent: false;"
            />
            <Entity
              geometry={{ primitive: "plane", width: (5 - hudWidth) / 2, height: hudHeight }}
              position={`${(5 + hudWidth) / 4} 0 -${depth + 0.01}`}
              material="color: black; shader: flat; transparent: false;"
            /> */}
            
             {/* <Entity
              geometry="primitive: plane; width: 5; height: 5"
              position={`0 0 -${depth + 0.01}`} 
              material="color: black; shader: flat; transparent: false;"
            />
            <Entity
              className="hud-ignore"
              geometry={{
                primitive: "plane",
                width: hudWidth,
                height: hudHeight
              }}
              position={`0 0 -${depth}`}
              canvas-updater="src: #hud-buffer"
            /> */}

            {/* 3. SAFETY ALERT OVERLAY (With Correct Z-Index) */}
            {alertStatus === 'DANGER' && (
                <Entity position="0 0 -0.09">
                   {/* Red Background */}
                   <Entity 
                     geometry={{ primitive: "plane", width: 0.15, height: 0.06 }}
                     material={{ color: "#770000", opacity: 0.9, transparent: true }}
                   />
                   
                   {/* Warning Text */}
                   <Entity 
                     text={{ 
                       value: "⚠️ TURN BACK ⚠️\nUNSAFE AREA", 
                       align: "center", 
                       color: "#FFF", 
                       width: 0.14,
                       wrapCount: 15
                     }}
                     position="0 0 0.001"
                   />
                </Entity>
             )}
          </Entity>
        </Entity>

      </WorldScene>
    </div>
  );
}

export default MobileView;