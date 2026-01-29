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

    init: function (this: any) {
      const canvas = this.data.src;
      if (!canvas) return;

      this.texture = new AFRAME.THREE.CanvasTexture(canvas);
      const mesh = this.el.getObject3D("mesh");
      if (!mesh) return;

      (mesh as any).material = new AFRAME.THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        side: AFRAME.THREE.DoubleSide,
      });
      (mesh as any).material.map.needsUpdate = true;
    },

    tick: function (this: any) {
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
  const [reloadTrigger, setReloadTrigger] = useState(0);  
  
  // 1. ADD VISION MODE STATE
// ✅ 1. CHANGED: Load from storage
  const [visionMode, setVisionMode] = useState(() => {
    const saved = localStorage.getItem("mobile_visionMode");
    return saved || 'prosthetic';
  });

  // ✅ 2. ADDED: Save to storage
  useEffect(() => {
    localStorage.setItem("mobile_visionMode", visionMode);
  }, [visionMode]);

  // EYE CONTROL STATE (R or L)
  const [eyeControl, setEyeControl] = useState<'R' | 'L'>('R');
  
  // LITE MODE STATE
  const [liteMode, setLiteMode] = useState(false);
  
  // UI State
  const [alertStatus, setAlertStatus] = useState<'DANGER' | 'SAFE'>('SAFE');

  // --- LOGIC REFS (For Socket Listener) ---
  const alertStartTime = useRef<number>(0);       
  const isAlertVisible = useRef<boolean>(false);  
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null); 

  // Position Sync State
  const hasReceivedPosition = useRef(false);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 0, z: 0 });

  const { world, loadWorld } = useScenarioWorld();
  const { clearAllTimers } = useComponentManager();

  // 1. SYNC CONNECTION
  const { isConnected: isSyncConnected, setOnCameraUpdate, updateCamera, socket } = useCameraSync({
    clientType: "mobile",
    throttleMs: 1000/30,
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
  // CHHHHHANGEEE HEEEEEEEEEEEEEREEEEEEE
  const holeDistance = 0.08;


  const degToRad = (deg: number) => (deg * Math.PI) / 180;
  const hudWidth = 2 * depth * Math.tan(degToRad(fovWidth / 2));
  const hudHeight = 2 * depth * Math.tan(degToRad(fovHeight / 2));
  
  // Calculate HUD X position based on eye control
  const baseHudX = holeDistance/2 + 0.012;
  const hudX = eyeControl === 'R' ? baseHudX : -baseHudX;

  // --- LISTEN FOR VISION MODE UPDATES ---
// --- LISTEN FOR VISION MODE UPDATES ---
  useEffect(() => {
    if (!socket) return;
    const handleModeUpdate = (data: { mode: string }) => {
      setVisionMode(data.mode);
    };
    
    // ✅ FIX: Listen for 'changed', not 'update'
    socket.on('vision-mode:changed', handleModeUpdate);
    
    return () => {
      socket.off('vision-mode:changed', handleModeUpdate);
    };
  }, [socket]);

  // --- LISTEN FOR EYE CONTROL UPDATES ---
  useEffect(() => {
    if (!socket) return;
    const handleEyeControlUpdate = (data: { control: 'R' | 'L' }) => {
      setEyeControl(data.control);
    };
    
    socket.on('eye-control:changed', handleEyeControlUpdate);
    
    return () => {
      socket.off('eye-control:changed', handleEyeControlUpdate);
    };
  }, [socket]);

  // --- LISTEN FOR LITE MODE UPDATES ---
  useEffect(() => {
    if (!socket) return;
    const handleLiteModeUpdate = (data: { enabled: boolean }) => {
      setLiteMode(data.enabled);
    };
    
    socket.on('lite-mode:changed', handleLiteModeUpdate);
    
    return () => {
      socket.off('lite-mode:changed', handleLiteModeUpdate);
    };
  }, [socket]);
  // --- SOCKET LISTENER WITH MINIMUM DURATION LOGIC ---
  useEffect(() => {
    if (!socket) return;

    const handleAlert = (data: { status: 'DANGER' | 'SAFE' }) => {
      if (data.status === 'DANGER') {
        if (!isAlertVisible.current) {
           isAlertVisible.current = true;
           alertStartTime.current = Date.now();
           setAlertStatus('DANGER');
        }
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
      } 
      else { 
        if (isAlertVisible.current) {
           const MIN_DURATION = 2000;
           const elapsed = Date.now() - alertStartTime.current;

           if (elapsed < MIN_DURATION) {
             if (!hideTimerRef.current) {
                const remaining = MIN_DURATION - elapsed;
                hideTimerRef.current = setTimeout(() => {
                  setAlertStatus('SAFE');
                  isAlertVisible.current = false;
                  hideTimerRef.current = null;
                }, remaining);
             }
           } else {
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
    if (!socket) return undefined;
    const handleReload = () => {
      setReloadTrigger(prev => prev + 1);
    };
    socket.on("scenario-loaded", handleReload);
    return () => {
      socket.off("scenario-loaded", handleReload);
    };
  }, [socket]);

  useEffect(() => {
    loadWorld()
      .then(() => console.log("🌍 [MobileView] World loaded"))
      .catch((err) => console.error("❌ [MobileView] Failed to load world:", err));
    return () => {
      clearAllTimers();
    };
  }, [loadWorld, clearAllTimers, reloadTrigger]);

  // Sync Rig Position logic
// Inside MobileViewer.tsx (Sync Rig Position logic)
useEffect(() => {
  setOnCameraUpdate((camera) => {
    const newPos = camera.position;
    
    // Define your desired height offset
    const HEIGHT_OFFSET = -1; 

    // Apply it to the Y coordinate
    const targetY = newPos.y + HEIGHT_OFFSET; 

    if (!hasReceivedPosition.current) {
      hasReceivedPosition.current = true;
      // Use targetY here
      rigRef.current.el.object3D.position.set(newPos.x, targetY, newPos.z);
    } else {
      const rigEl = rigRef.current?.el;
      if (rigEl) {
        rigEl.setAttribute("animation__follow", {
          property: "position",
          // Use targetY here
          to: `${newPos.x} ${targetY} ${newPos.z}`, 
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
        <div>Mode: {visionMode}</div>
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

      <WorldScene entities={world.entities} isMobile={true} isLiteMode={liteMode}>
        
        {/* Environment Overrides */}
      

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
            primitive="a-entity" 
            camera="active: true"
            look-controls="enabled: true; touchEnabled: true; magicWindowTrackingEnabled: false;"
            position="0 0 0" 
          >
            {/* ========================================================= */}
            {/* 🕶️ MODE 1: NORMAL VISION (Stereoscopic Mask)               */}
            {/* ========================================================= */}
            {visionMode === 'normal' && (
              <>
                {/* Top Bar */}
                <Entity
                  geometry={{ primitive: "plane", width: 5, height: (5 - hudHeight) / 2 }}
                  position={`0 ${(5 + hudHeight) / 4} -${depth + 0.001}`}
                  material="color: black; shader: flat; transparent: false;"
                />
                {/* Bottom Bar */}
                <Entity
                  geometry={{ primitive: "plane", width: 5, height: (5 - hudHeight) / 2 }}
                  position={`0 -${(5 + hudHeight) / 4} -${depth + 0.001}`}
                  material="color: black; shader: flat; transparent: false;"
                />
                {/* Center Divider */}
                <Entity
                  geometry={{ primitive: "plane", width: holeDistance, height: hudHeight }}
                  position={`0 0 -${depth + 0.001}`}
                  material="color: black; shader: flat; transparent: false;"
                />
                {/* Left Blinder */}
                <Entity
                  geometry={{ primitive: "plane", width: 2.5, height: hudHeight }}
                  position={`-${(holeDistance/2) + hudWidth + 1.25} 0 -${depth + 0.001}`}
                  material="color: black; shader: flat; transparent: false;"
                />
                {/* Right Blinder */}
                <Entity
                  geometry={{ primitive: "plane", width: 2.5, height: hudHeight }}
                  position={`${(holeDistance/2) + hudWidth + 1.25} 0 -${depth + 0.001}`}
                  material="color: black; shader: flat; transparent: false;"
                />
              </>
            )}

            {/* ========================================================= */}
            {/* 🤖 MODE 2: PROSTHETIC / LOW RES (HUD + Full Blinder)      */}
            {/* ========================================================= */}
            {visionMode !== 'normal' && (
              <>
                {/* Full Blackout Blinder (Behind HUD) */}
                <Entity
                  geometry="primitive: plane; width: 5; height: 5"
                  position={`0 0 -${depth + 0.01}`} 
                  material="color: black; shader: flat; transparent: false;"
                />
                
                {/* The HUD Screen (AI Stream) */}
                <Entity
                  className="hud-ignore"
                  geometry={{
                    primitive: "plane",
                    width: hudWidth,
                    height: hudHeight
                  }}
                  position={`${hudX} 0 -${depth}`}
                  canvas-updater="src: #hud-buffer"
                />
              </>
            )}

            {/* 3. SAFETY ALERT OVERLAY (With Correct Z-Index) */}
            {alertStatus === 'DANGER' && (
                <Entity position={`${hudX} 0 -0.09`}>
                   {/* Red Background */}
                   <Entity 
                     geometry={{ primitive: "plane", width: 0.025, height: 0.01 }}
                     material={{ color: "#770000", opacity: 0.9, transparent: true }}
                   />
                   
                   {/* Warning Text */}
                   <Entity 
                     text={{ 
                       value: "⚠️ TURN BACK ⚠️\nUNSAFE AREA", 
                       align: "center", 
                       color: "#FFF", 
                       width: 0.015,
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