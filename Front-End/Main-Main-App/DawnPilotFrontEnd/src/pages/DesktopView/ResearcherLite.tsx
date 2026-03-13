import React, { useEffect, useRef, useState } from "react";
import styles from "./ResearcherLite.module.css";
import "aframe";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity } from "aframe-react";
import { useScenarioWorld } from "../../hooks/useScenarioWorld";
import WorldScene from "../../components/level-2/WorldRenderer/WorldRenderer";
import ExperimentSidebar from "../../components/level-1/ExperimentSidebar/ExperimentSidebar";
import { useAiStream } from "../../hooks/useAiStream";
import { useCameraSync } from "../../hooks/useCameraSync";
import { useFrameBuffer } from "../../hooks/useFrameBuffer";
import { useScenarioSaveLoad } from "../../hooks/useScenarioSaveLoad";
import ScenarioLoadDialog from "../../components/level-1/ScenarioLoadDialog/ScenarioLoadDialog";

// --- WALL COLLISION VISIBILITY: Show walls only when colliding (like alert system) ---
if (typeof AFRAME !== "undefined" && !AFRAME.components["wall-collision-visibility"]) {
  AFRAME.registerComponent('wall-collision-visibility', {
    schema: {
      duration: { type: 'number', default: 2000 }
    },

    init: function(this: any) {
      this.onCollision = this.onCollision.bind(this);
      this.hideTimerRef = null;
      this.isVisible = false;
      this.collisionStartTime = 0;
      
      // Listen for collision events
      this.el.addEventListener('collision', this.onCollision);
      
      console.log('🧱 Wall collision visibility initialized on:', this.el.id || 'wall');
    },

    onCollision: function(this: any, event: any) {
      console.log('🚨 Wall collision detected!', event.detail);
      
      // Start showing the wall
      if (!this.isVisible) {
        this.isVisible = true;
        this.collisionStartTime = Date.now();
        
        // Make wall visible with proper material settings
        this.el.setAttribute('material', {
          opacity: 0.9,
          transparent: true,
          color: '#FF0000',
          shader: 'flat',
          depthTest: false,
          depthWrite: false
        });
        
        console.log('✅ Wall now visible (red)');
      }
      
      // Clear any existing hide timer
      if (this.hideTimerRef) {
        clearTimeout(this.hideTimerRef);
        this.hideTimerRef = null;
      }
      
      // Set new hide timer with minimum duration logic
      const MIN_DURATION = this.data.duration;
      const elapsed = Date.now() - this.collisionStartTime;
      
      const hideDelay = elapsed < MIN_DURATION ? MIN_DURATION - elapsed : 0;
      
      this.hideTimerRef = setTimeout(() => {
        this.el.setAttribute('material', {
          opacity: 0,
          transparent: true
        });
        this.isVisible = false;
        this.hideTimerRef = null;
        console.log('👻 Wall hidden again');
      }, hideDelay);
    },

    remove: function(this: any) {
      this.el.removeEventListener('collision', this.onCollision);
      if (this.hideTimerRef) {
        clearTimeout(this.hideTimerRef);
      }
    }
  });
}

function ResearcherLite() {
  const cameraRef = useRef<any>(null);
  const hitboxRef = useRef<any>(null);
  const cameraInitialized = useRef<boolean>(false);
  const [currentScenarioId, setCurrentScenarioId] = useState("default_world");
  const [mobileId, setMobileId] = useState<string>("");
  const [wallsTransparent, setWallsTransparent] = useState(true);
  
  
  const [visionMode, setVisionMode] = useState(() => {
    const saved = localStorage.getItem("researcher_visionMode");
    return saved || "prosthetic";
  });

  const [subjectId, setSubjectId] = useState(() => {
    const saved = localStorage.getItem("subject_id");
    return saved || "NOT_SET";
  });

  const [frameBufferSettings, setFrameBufferSettings] = useState(() => {
    const frequency = localStorage.getItem('frameBuffer_frequency');
    const downsampling = localStorage.getItem('frameBuffer_downsampling');
    return {
      frequency: frequency ? parseInt(frequency) : 10,
      downsamplePercentage: downsampling ? parseInt(downsampling) : 50
    };
  });

  const [worldSettings, setWorldSettings] = useState(() => {
    const width = localStorage.getItem('world_width');
    const depth = localStorage.getItem('world_depth');
    const zShift = localStorage.getItem('world_zShift');
    const xShift = localStorage.getItem('world_xShift');
    return {
      width: width ? parseInt(width) : 40,
      depth: depth ? parseInt(depth) : 30,
      zShift: zShift ? parseInt(zShift) : 2,
      xShift: xShift ? parseInt(xShift) : 0
    };
  });

  const [liteMode, setLiteMode] = useState(() => {
    const saved = localStorage.getItem('world_liteMode');
    return saved === 'true';
  });

  const [throttleSettings, setThrottleSettings] = useState(() => {
    const desktop = localStorage.getItem('throttle_desktop');
    const mobile = localStorage.getItem('throttle_mobile');
    return {
      desktopMs: desktop ? parseInt(desktop) : 33,
      mobileMs: mobile ? parseInt(mobile) : 33
    };
  });

  const { world, loadWorld, setWorld } = useScenarioWorld();
  const {
    socket: aiWebSocket,
    canvasRef: aiHudCanvasRef,
    isConnected: aiConnected,
  } = useAiStream({
    reconnectDependency: visionMode,
    transport: "phosphene-binary",
  });

  const { isConnected, updateCamera, setOnCameraUpdate, socket } =
    useCameraSync({
      clientType: "desktop",
      throttleMs: throttleSettings.desktopMs,
    });

  const {
    loadScenario: loadScenarioAPI,
    listScenarios,
    deleteScenario: deleteScenarioAPI,
    loading: saveLoadLoading,
  } = useScenarioSaveLoad();

  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<any[]>([]);

  useEffect(() => {
    loadWorld().catch((err) =>
      console.error("Researcher - Failed to load world:", err),
    );
  }, [loadWorld]);

  useFrameBuffer({
    downsamplePercentage: frameBufferSettings.downsamplePercentage,
    includeDepthCapture: true,
    includeDepthBlob: false,
    enabled: aiWebSocket?.readyState === WebSocket.OPEN,
    logInterval: 1000 / frameBufferSettings.frequency,
    onFrame: async (pixelBuffer, width, height, _depthBlob, depthBuffer) => {
      if (aiWebSocket?.readyState !== WebSocket.OPEN) return;

      try {
        if (visionMode === "normal") { return; } // No processing for normal mode

        // Packet v2: [4B rgb_size][4B width][4B height][4B depth_size][RGBA][DEPTH_RGBA]
        const rgbSize = pixelBuffer.byteLength;
        const depthBytes = depthBuffer && depthBuffer.byteLength > 0 ? depthBuffer : pixelBuffer;
        const depthSize = depthBytes.byteLength;
        const totalBytes = 16 + rgbSize + depthSize;
        const packet = new Uint8Array(totalBytes);

        const header = new DataView(packet.buffer, 0, 16);
        header.setUint32(0, rgbSize, true);
        header.setUint32(4, width, true);
        header.setUint32(8, height, true);
        header.setUint32(12, depthSize, true);

        packet.set(pixelBuffer, 16);
        packet.set(depthBytes, 16 + rgbSize);

        if (aiWebSocket.bufferedAmount > 500_000) return;
        aiWebSocket.send(packet.buffer);
      } catch (error) {
        console.error("❌ Error sending frame:", error);
      }
    },
  });
   useEffect(() => {
    if (!socket) return;
    const handleCameraUpdate = (data: any) => {
      if (data.clientId && data.clientId !== socket.id)
        setMobileId(data.clientId);
    };
    socket.on("camera:updated", handleCameraUpdate);
    return () => {
      socket.off("camera:updated", handleCameraUpdate);
    };
  }, [socket]);
    useEffect(() => {
    if (socket && socket.connected) {
      socket.emit('vision-mode:update', { mode: visionMode });
    }
  }, [visionMode, socket]);

  useEffect(() => {
    if (socket && socket.connected) {
      socket.emit('lite-mode:update', { enabled: liteMode });
    }
  }, [liteMode, socket]);

  useEffect(() => {
    if (socket && socket.connected) {
      socket.emit('throttle:update', { mobileMs: throttleSettings.mobileMs });
    }
  }, [throttleSettings.mobileMs, socket]);

  useEffect(() => {
    if (socket && socket.connected) {
      socket.emit('world-dimensions:update', { 
        width: worldSettings.width,
        depth: worldSettings.depth,
        zShift: worldSettings.zShift,
        xShift: worldSettings.xShift
      });
    }
  }, [worldSettings, socket]);


  
  // Set initial camera position ONCE (prevent re-render from resetting position)
  useEffect(() => {
    if (cameraRef.current?.el && !cameraInitialized.current) {
      cameraRef.current.el.setAttribute("position", "0 1.6 0");
      cameraInitialized.current = true;
    }
  },[]);

 // Master of Position (broadcasts position only, receives rotation from mobile)
  useEffect(() => {
    let animationId: number;
    const broadcastCamera = () => {
      const el = cameraRef.current?.el;
      
      // Only broadcast position - rotation comes from mobile device
      if (el && el.object3D) {
        const { x, y, z } = el.object3D.position;

        updateCamera({
          position: { x, y, z },
        });
      }
      
      animationId = requestAnimationFrame(broadcastCamera);
    };
    
    animationId = requestAnimationFrame(broadcastCamera);
    return () => cancelAnimationFrame(animationId);
  }, [updateCamera]);

  // Slave of Rotation
  useEffect(() => {
    setOnCameraUpdate((remoteData) => {
      if (cameraRef.current) {
        const el = cameraRef.current.el;
        const r = remoteData.rotation;
        if (r) {
          el.setAttribute("rotation", `${r.x} ${r.y} ${r.z}`);
        }
      }
    });
  }, [setOnCameraUpdate]);

  const handleLoadScenario = async (filename: string) => {
    try {
      const result = await loadScenarioAPI(filename);

      // Update world state
      setWorld(result.world);

      // Update scenario ID
      setCurrentScenarioId(filename);

      // Restore camera position if available
      if (result.scenario.camera && cameraRef.current) {
        setTimeout(() => {
          const cam = cameraRef.current?.el;
          const { position } = result.scenario.camera;
          cam.setAttribute(
            "position",
            `${position.x} ${position.y} ${position.z}`
          );
          cam.setAttribute(
            "rotation",
            `0 0 0`
          );

          // Broadcast camera position to Mobile
          updateCamera({ position });
        }, 100);
      }

      // Notify Mobile to reload
      if (socket) {
        socket.emit("scenario-loaded", { filename });
      }

      alert(`Scenario "${result.scenario.name}" loaded!`);
      setShowLoadDialog(false);
    } catch (err) {
      console.error(err);
      alert("Error loading scenario.");
    }
  };

  const handleOpenLoadDialog = async () => {
    const scenarios = await listScenarios();
    setSavedScenarios(scenarios);
    setShowLoadDialog(true);
  };
const handleManualWallTrigger = () => {
   const newState = !wallsTransparent;
    setWallsTransparent(newState);
    
    // Sync with Mobile
    if (socket && socket.connected) {
      socket.emit('walls-transparent:update', { enabled: newState });
    }
  };
  return (
    <div className={styles.page}>
      <ExperimentSidebar
        hitboxRef={hitboxRef}
        socket={socket}
        isConnected={isConnected}
        mobileId={mobileId}
        aiConnected={aiConnected}
        currentScenarioId={currentScenarioId}
        visionMode={visionMode}
        subjectId={subjectId}
        onVisionModeChange={(mode) => {
          setVisionMode(mode);
        }}
        wallsTransparent={wallsTransparent}
        onTriggerWallVisibilty={handleManualWallTrigger}
        onOpenLoadDialog={handleOpenLoadDialog}
        saveLoadLoading={saveLoadLoading}
        aiHudCanvasRef={aiHudCanvasRef as React.RefObject<HTMLCanvasElement>}
        onFrameBufferChange={(settings) => setFrameBufferSettings(settings)}
        onWorldChange={(settings) => setWorldSettings(settings)}
        onSubjectIdChange={(id) => setSubjectId(id)}
        onLiteModeChange={(enabled) => setLiteMode(enabled)}
        onThrottleChange={(settings) => setThrottleSettings(settings)}
        onEyeControlChange={(control) => {
          if (socket) {
            socket.emit('eye-control:update', { control });
          }
        }}
      />
      <div className={styles.viewportContainer}>
        <div className={styles.viewport}>
          <WorldScene 
            entities={world.entities} 
            isMobile={false}
            worldWidth={worldSettings.width}
            worldDepth={worldSettings.depth}
            groundZShift={worldSettings.zShift}
            groundXShift={worldSettings.xShift}
            isLiteMode={liteMode}
            areWallsTransparent={wallsTransparent}
          >
            <Entity
              ref={cameraRef}
              primitive="a-camera"
              look-controls="enabled: false"
              wasd-controls="enabled: true; acceleration: 9"
              vr-movement-controls="speed: 1.5; verticalSpeed: 1; acceleration: 15; heightUpButton: 7; heightDownButton: 6"
            >
              <Entity
                ref={hitboxRef}
                collision-detector="targetSelector: .collidable; cooldown: 1000"
                primitive="a-box"
                position="0 -0.8 0"
                scale=".6 1.6 .6"
                material="opacity: 0.5; color: red; wireframe: true"
                visible={true}
                className="depth-ignore"
              />
            </Entity>
          </WorldScene>
        </div>

        {showLoadDialog && (
          <ScenarioLoadDialog
            scenarios={savedScenarios}
            onLoad={handleLoadScenario}
            onCancel={() => setShowLoadDialog(false)}
            onDelete={(id) =>
              deleteScenarioAPI(id).then(() =>
                listScenarios().then(setSavedScenarios)
              )
            }
            loading={saveLoadLoading}
          />
        )}
      </div>
    </div>
  );
}

export default ResearcherLite;
