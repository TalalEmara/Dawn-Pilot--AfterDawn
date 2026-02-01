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

// ... canvas-updater (unchanged) ...
if (typeof AFRAME !== "undefined" && !AFRAME.components["canvas-updater"]) {
  AFRAME.registerComponent("canvas-updater", {
    schema: { src: { type: "selector" } },
    init: function (this: any) {
      const canvas = this.data.src;
      if (!canvas) return;
      this.texture = new AFRAME.THREE.CanvasTexture(canvas);
      this.texture.generateMipmaps = false;
      this.texture.minFilter = AFRAME.THREE.LinearFilter;
      this.texture.magFilter = AFRAME.THREE.LinearFilter;
      const mesh = this.el.getObject3D("mesh");
      if (!mesh) return;
      (mesh as any).material = new AFRAME.THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: AFRAME.THREE.DoubleSide });
    },
    tick: function (this: any) {
      const canvas = this.data.src;
      if (this.texture && canvas && canvas.needsUpdate) {
        this.texture.needsUpdate = true;
        canvas.needsUpdate = false;
      }
    },
  });
}

// --- WALL COLLISION COMPONENT (Mobile Receiver) ---
if (typeof AFRAME !== "undefined" && !AFRAME.components["wall-collision-visibility"]) {
  AFRAME.registerComponent("wall-collision-visibility", {
    schema: { duration: { type: "number", default: 2000 } },
    init: function (this: any) {
      this.onCollision = this.onCollision.bind(this);
      this.hideTimerRef = null;
      this.isVisible = false;
      this.el.addEventListener("collision", this.onCollision);
    },
    onCollision: function (this: any, event: any) {
      // 🛑 FILTER: On mobile, ONLY accept remote signals
      if (!event.detail?.isRemote) return;

      console.log("📱 [Mobile] Wall Visible:", this.el.id);
      
      if (!this.isVisible) {
        this.isVisible = true;
        this.el.object3D.renderOrder = 9999;
        this.el.setAttribute("material", {
          opacity: 0.9, transparent: true, color: "#FF0000", shader: "flat", depthTest: false, depthWrite: false,
        });
      }
      
      if (this.hideTimerRef) clearTimeout(this.hideTimerRef);
      this.hideTimerRef = setTimeout(() => {
        this.el.setAttribute("material", { opacity: 0, transparent: true });
        this.isVisible = false;
        this.hideTimerRef = null;
      }, this.data.duration);
    },
    remove: function (this: any) {
      this.el.removeEventListener("collision", this.onCollision);
      if (this.hideTimerRef) clearTimeout(this.hideTimerRef);
    },
  });
}

function MobileView() {
  const cameraRef = useRef<any>(null);
  const rigRef = useRef<any>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Vision Mode
  const [visionMode, setVisionMode] = useState(() => localStorage.getItem("mobile_visionMode") || "prosthetic");
  useEffect(() => { localStorage.setItem("mobile_visionMode", visionMode); }, [visionMode]);
  
  const [eyeControl, setEyeControl] = useState<"R" | "L">("R");
  const [liteMode, setLiteMode] = useState(false);
  const [mobileThrottle, setMobileThrottle] = useState(() => parseInt(localStorage.getItem("throttle_mobile") || "33"));
  const [alertStatus, setAlertStatus] = useState<"DANGER" | "SAFE">("SAFE");
  const [worldDimensions, setWorldDimensions] = useState({ width: 40, depth: 30, zShift: 2, xShift: 0 });

  // X-RAY STATE
  const [collisionActive, setCollisionActive] = useState(false);
  const collisionTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hasReceivedPosition = useRef(false);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 0, z: 0 });

  const { world, loadWorld } = useScenarioWorld();
  const { clearAllTimers } = useComponentManager();
  const { isConnected: isSyncConnected, setOnCameraUpdate, updateCamera, socket } = useCameraSync({ clientType: "mobile", throttleMs: mobileThrottle });
  const { socket: aiWebSocket, canvasRef: hudCanvasRef, isConnected: isAiConnected } = useAiStream();

  // FOV
  const depth = 0.1;
  const fovWidth = 17;
  const fovHeight = 17;
  const holeDistance = 0.08;
  const degToRad = (deg: number) => (deg * Math.PI) / 180;
  const hudWidth = 2 * depth * Math.tan(degToRad(fovWidth / 2));
  const hudHeight = 2 * depth * Math.tan(degToRad(fovHeight / 2));
  const baseHudX = holeDistance / 2 + 0.012;
  const hudX = eyeControl === "R" ? baseHudX : -baseHudX;

  const [wallsTransparent, setWallsTransparent] = useState(true);
  useEffect(() => {
    if (!socket) return;
    const handleWallUpdate = (data: { enabled: boolean }) => {
      setWallsTransparent(data.enabled);
    };
    socket.on("walls-transparent:changed", handleWallUpdate);
    return () => { socket.off("walls-transparent:changed", handleWallUpdate); };
  }, [socket]);
  // Listeners
  useEffect(() => {
    if (!socket) return;
    socket.on("vision-mode:changed", (d) => setVisionMode(d.mode));
    socket.on("eye-control:changed", (d) => setEyeControl(d.control));
    socket.on("lite-mode:changed", (d) => setLiteMode(d.enabled));
    socket.on("throttle:changed", (d) => { setMobileThrottle(d.mobileMs); localStorage.setItem("throttle_mobile", d.mobileMs.toString()); });
    socket.on("world-dimensions:changed", (d) => {
      console.log("📱 World dimensions updated:", d);
      setWorldDimensions({ width: d.width, depth: d.depth, zShift: d.zShift, xShift: d.xShift });
    });
    return () => { 
      socket.off("vision-mode:changed"); 
      socket.off("eye-control:changed"); 
      socket.off("lite-mode:changed"); 
      socket.off("throttle:changed");
      socket.off("world-dimensions:changed");
    };
  }, [socket]);

  // Alert Handler (unchanged)
  useEffect(() => {
    if (!socket) return;
    const handleAlert = (data: { status: "DANGER" | "SAFE" }) => {
      setAlertStatus(data.status);
    };
    socket.on("alert:status", handleAlert);
    return () => { socket.off("alert:status", handleAlert); };
  }, [socket]);



  // Sync / Load / Loop Logic (Unchanged)
  useEffect(() => {
    const broadcastLoop = () => {
      if (cameraRef.current && isSyncConnected) {
        const camEl = cameraRef.current.el;
        const rigEl = rigRef.current?.el;
        const rot = camEl.getAttribute("rotation");
        const pos = rigEl ? rigEl.getAttribute("position") : { x: 0, y: 0, z: 0 };
        if (rot) updateCamera({ position: { x: pos.x, y: pos.y, z: pos.z }, rotation: { x: rot.x, y: rot.y, z: rot.z } });
      }
      requestAnimationFrame(broadcastLoop);
    };
    const animationId = requestAnimationFrame(broadcastLoop);
    return () => cancelAnimationFrame(animationId);
  }, [updateCamera, isSyncConnected]);

  useEffect(() => {
    if (!socket) return undefined;
    const handleReload = () => setReloadTrigger((prev) => prev + 1);
    socket.on("scenario-loaded", handleReload);
    return () => { socket.off("scenario-loaded", handleReload); };
  }, [socket]);

  useEffect(() => {
    loadWorld().catch((err) => console.error("❌ Failed to load world:", err));
    return () => clearAllTimers();
  }, [loadWorld, clearAllTimers, reloadTrigger]);

  useEffect(() => {
    setOnCameraUpdate((camera) => {
      const newPos = camera.position;
      const HEIGHT_OFFSET = -1;
      const targetY = newPos.y + HEIGHT_OFFSET;
      if (!hasReceivedPosition.current) {
        hasReceivedPosition.current = true;
        rigRef.current.el.object3D.position.set(newPos.x, targetY, newPos.z);
      } else {
        const rigEl = rigRef.current?.el;
        if (rigEl) {
          rigEl.setAttribute("animation__follow", { property: "position", to: `${newPos.x} ${targetY} ${newPos.z}`, dur: 200, easing: "easeOutQuad", startEvents: "follow-target", autoplay: false });
          rigEl.emit("follow-target", null, false);
        }
      }
      setCameraPosition(newPos);
    });
  }, [setOnCameraUpdate]);

  useEffect(() => {
    return () => {
      try {
        const scene = document.querySelector("a-scene") as any;
        if (scene && scene.renderer && typeof scene.renderer.dispose === "function") scene.renderer.dispose();
        if (hudCanvasRef.current) { hudCanvasRef.current.width = 0; hudCanvasRef.current.height = 0; }
      } catch (err) {}
    };
  }, [hudCanvasRef]);

  return (
    <div style={{ background: "blue", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <style>{`.a-enter-vr-button { bottom: 20% !important; position: fixed !important; z-index: 99999 !important; } body { overflow: hidden !important; }`}</style>
      
      {/* ... Debug UI & Header ... */}
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1000, background: "rgba(0,0,0,0.5)", color: "white", padding: "8px 16px", borderRadius: "4px", fontSize: "12px", fontFamily: "monospace", textAlign: "right" }}>
        <canvas ref={hudCanvasRef} id="hud-buffer" width="640" height="360" style={{ display: "none" }} />
        <div>Mode: {visionMode}</div>
        <div>Sync: {isSyncConnected ? "🟢" : "🔴"}</div>
        <div>AI (Recv): {isAiConnected ? "🟢" : "🔴"}</div>
      </div>
      <div style={{ position: "absolute", top: 10, left: 10, zIndex: 1000, background: "#2196F3", color: "white", padding: "8px 16px", borderRadius: "4px", fontSize: "12px", fontFamily: "monospace" }}>
        📱 Mobile Viewer
      </div>

      <WorldScene 
        entities={world.entities} 
        isMobile={true} 
        isLiteMode={liteMode} 
        areWallsTransparent={wallsTransparent}
        worldWidth={worldDimensions.width}
        worldDepth={worldDimensions.depth}
        groundZShift={worldDimensions.zShift}
        groundXShift={worldDimensions.xShift}
      >
        <Entity ref={rigRef} animation__follow={{ property: "position", dur: 200, easing: "easeOutQuad", startEvents: "follow-target", autoplay: false }}>
          <Entity ref={cameraRef} primitive="a-entity" camera="active: true" look-controls="enabled: true; touchEnabled: true; magicWindowTrackingEnabled: false;" position="0 0 0">
            
            {/* NORMAL MODE */}
            {visionMode === "normal" && (
              <>
                <Entity geometry={{ primitive: "plane", width: 5, height: (5 - hudHeight) / 2 }} position={`0 ${(5 + hudHeight) / 4} -${depth + 0.001}`} material="color: black; shader: flat; transparent: false;" />
                <Entity geometry={{ primitive: "plane", width: 5, height: (5 - hudHeight) / 2 }} position={`0 -${(5 + hudHeight) / 4} -${depth + 0.001}`} material="color: black; shader: flat; transparent: false;" />
                <Entity geometry={{ primitive: "plane", width: holeDistance, height: hudHeight }} position={`0 0 -${depth + 0.001}`} material="color: black; shader: flat; transparent: false;" />
                <Entity geometry={{ primitive: "plane", width: 2.5, height: hudHeight }} position={`-${holeDistance / 2 + hudWidth + 1.25} 0 -${depth + 0.001}`} material="color: black; shader: flat; transparent: false;" />
                <Entity geometry={{ primitive: "plane", width: 2.5, height: hudHeight }} position={`${holeDistance / 2 + hudWidth + 1.25} 0 -${depth + 0.001}`} material="color: black; shader: flat; transparent: false;" />
              </>
            )}

            {/* PROSTHETIC MODE */}
            {visionMode !== "normal" && (
              <>
                {/* 👀 BLACK BLINDER 
                   Controlled by 'collisionActive' state.
                   Opacity 1 = Full Black (Normal)
                   Opacity 0.1 = See-through (Collision)
                */}
                <Entity
                  geometry="primitive: plane; width: 5; height: 5"
                  position={`0 0 -0.11`}
                  material={{
                    color: "black",
                    shader: "flat",
                    transparent: true,
                    opacity: collisionActive ? 0.1 : 1, // <--- X-RAY EFFECT
                  }}
                />

                <Entity className="hud-ignore" geometry={{ primitive: "plane", width: hudWidth, height: hudHeight }} position={`${hudX} 0 -${depth}`} canvas-updater="src: #hud-buffer" />
              </>
            )}

            {alertStatus === "DANGER" && (
              <Entity position={`${hudX} 0 -0.09`}>
                <Entity geometry={{ primitive: "plane", width: 0.025, height: 0.01 }} material={{ color: "#770000", opacity: 0.9, transparent: true }} />
                <Entity text={{ value: "⚠️ TURN BACK ⚠️\nUNSAFE AREA", align: "center", color: "#FFF", width: 0.015, wrapCount: 15 }} position="0 0 0.001" />
              </Entity>
            )}
          </Entity>
        </Entity>
      </WorldScene>
    </div>
  );
}

export default MobileView;