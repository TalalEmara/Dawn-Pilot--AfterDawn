import "aframe";
import "../../AFrameComponents/VRMovementControls";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity } from "aframe-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useScenarioWorld } from "../../hooks/useScenarioWorld";
import { useCameraSync } from "../../hooks/useCameraSync";
import { useFrameBuffer } from "../../hooks/useFrameBuffer";
import { useCollisionDetection } from "../../hooks/useCollision";
import { useScenarioSaveLoad } from "../../hooks/useScenarioSaveLoad";
import { useExperimentVault } from "../../hooks/Recording/useExperimentVault";
import ScenarioLoadDialog from "../../components/level-1/ScenarioLoadDialog/ScenarioLoadDialog";
import { SERVER_IP } from "../../ApiConfig";
import groundTexture from "../../assets/ground/ground.jpg";
import datasetTest from "../../assets/testing/dataset.png";
import WorldScene from "../../components/level-2/WorldRenderer/WorldRenderer";
import { useAiStream } from "../../hooks/useAiStream";
import ResearcherSidePanel from "../../components/level-1/ResearcherSidePanel/ResearcherSidePanel";


import FrameEncoderWorker from "../../workers/frameEncoder.worker?worker";
// Helper to convert Blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Helper to map vision mode to backend stage
const getStageFromVisionMode = (mode: string): string => {
  switch (mode) {
    case "normal":
      return "passthrough";
    case "prosthetic":
      return "phosphene";
    case "low_res":
      return "edge_mode";
    default:
      return "phosphene";
  }
};

function ResearcherView() {
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCollidingRef = useRef(false);
  const cameraRef = useRef<any>(null);
  const hitboxRef = useRef<any>(null);
  const cameraInitialized = useRef<boolean>(false);

  // --- Research / Experiment State ---
 const [visionMode, setVisionMode] = useState(() => {
    const saved = localStorage.getItem("researcher_visionMode");
    return saved || "prosthetic";
  });
  const [currentScenarioId, setCurrentScenarioId] = useState("default_world");
  const [mobileId, setMobileId] = useState<string>("");

  const [collisionCount, setCollisionCount] = useState<number>(0);
  const [collisionLog, setCollisionLog] = useState<string[]>([]);

  // AI Socket State
 const frameIdRef = useRef<number>(0);
// Replaces all manual socket state, connection effects, and binary stream hooks
const { 
  socket: aiWebSocket, 
  canvasRef: aiHudCanvasRef,
  isConnected: aiConnected 
} = useAiStream({ 
  reconnectDependency: visionMode 
});
const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // 1. Initialize the worker
    workerRef.current = new FrameEncoderWorker();

    // 2. Handle messages coming BACK from the worker
    workerRef.current.onmessage = (e) => {
      // If the worker successfully created the string, send it to the socket
      if (e.data.success && aiWebSocket?.readyState === WebSocket.OPEN) {
        aiWebSocket.send(e.data.payload);
      }
    };

    // 3. Cleanup when component unmounts
    return () => {
      workerRef.current?.terminate();
    };
  }, [aiWebSocket]);
  // 1. Get socket from CameraSync
  const { isConnected, updateCamera, setOnCameraUpdate, socket } =
    useCameraSync({
      clientType: "desktop",
      throttleMs: 20,
    });

  // 2. Initialize Experiment Vault
  const vault = useExperimentVault(socket);

  const { world, loadWorld, setWorld } = useScenarioWorld();

  const {
    loadScenario: loadScenarioAPI,
    listScenarios,
    deleteScenario: deleteScenarioAPI,
    loading: saveLoadLoading,
  } = useScenarioSaveLoad();

  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<any[]>([]);



  // --- Frame Capture & Sending ---
  useFrameBuffer({
    downsamplePercentage: 50,
    enabled:  aiWebSocket?.readyState === WebSocket.OPEN,
    logInterval: 2000,
    onFrame: async (rgbBlob, depthBlob) => {
      if (aiWebSocket?.readyState !== WebSocket.OPEN) return;

      try {
        const rgbBase64 = await blobToBase64(rgbBlob);
        
        // Only encode depth for prosthetic mode (phosphene pipeline needs it)
        const needsDepth = visionMode === "prosthetic";
        const depthBase64 = (needsDepth && depthBlob) ? await blobToBase64(depthBlob) : null;

        frameIdRef.current++;

        const message: any = {
          type: "frame",
          frame_id: String(frameIdRef.current).padStart(3, "0"),
          rgb: rgbBase64,
          stage: getStageFromVisionMode(visionMode),
        };
        
        // Only include depth if available and needed
        if (depthBase64) {
          message.depth = depthBase64;
        }

        aiWebSocket.send(JSON.stringify(message));
      } catch (error) {
        console.error("❌ Error sending frame:", error);
      }
    },
  });

  // Events & Logic
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

  // Sync vision mode to Mobile Viewer
  useEffect(() => {
    if (socket && socket.connected) {
      socket.emit('vision-mode:update', { mode: visionMode });
      console.log(`📡 Synced vision mode: ${visionMode}`);
    }
  }, [visionMode, socket]);


    


  useEffect(() => {
    loadWorld().catch((err) =>
      console.error("Researcher - Failed to load world:", err)
    );
  }, [loadWorld]);

  // Set initial camera position ONCE (prevent re-render from resetting position)
  useEffect(() => {
    if (cameraRef.current?.el && !cameraInitialized.current) {
      cameraRef.current.el.setAttribute("position", "0 1.6 0");
      cameraInitialized.current = true;
      console.log("[Camera] Initial position set to 0 1.6 0");
    }
  },[]);



 // Master of Position
  useEffect(() => {
    let animationId: number;

    const broadcastCamera = () => {
      const el = cameraRef.current?.el;
      
      // Optimization: Access Three.js Object3D directly to avoid slow DOM getAttribute calls
      if (el && el.object3D) {
        const { x, y, z } = el.object3D.position;
        const { x: rx, y: ry, z: rz } = el.object3D.rotation; // These are in radians

        // Convert radians to degrees
        const toDeg = (rad: number) => (rad * 180) / Math.PI;

        updateCamera({
          position: { x, y, z },
          rotation: { x: toDeg(rx), y: toDeg(ry), z: toDeg(rz) },
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
        el.setAttribute("rotation", `${r.x} ${r.y} ${r.z}`);
      }
    });
  }, [setOnCameraUpdate]);

  const handleCollision = useCallback(
    (detail: { obstacleId: string; timestamp: number }) => {
      // 1. If this is a new collision sequence, send DANGER
      if (!isCollidingRef.current && socket) {
        isCollidingRef.current = true;
        socket.emit('alert:status', { status: 'DANGER' });
        console.log("💥 Sending DANGER");
      }

      // 2. Reset the "Return to Safe" timer every time we get a hit
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
      }

      // 3. If no new hits happen for 500ms, assume we are SAFE
      safetyTimerRef.current = setTimeout(() => {
        if (socket) {
          console.log("✅ Sending SAFE");
          socket.emit('alert:status', { status: 'SAFE' });
        }
        isCollidingRef.current = false;
        safetyTimerRef.current = null;
      }, 500); // 500ms cooldown

      const timestamp = new Date().toLocaleTimeString();
      const logMsg = `[${timestamp}] Hit: ${detail.obstacleId}`;
      console.warn(`💥 ${logMsg}`);
      setCollisionCount((prev) => prev + 1);
      setCollisionLog((prev) => [logMsg, ...prev].slice(0, 10));
      vault.logCollision(detail.obstacleId);

      vault.logCollision(detail.obstacleId);
    },
    [socket, vault]
  );

  useCollisionDetection(hitboxRef, handleCollision);


  const handleLoadScenario = async (filename: string) => {
    try {
      const result = await loadScenarioAPI(filename);

      // Update world state directly (like Builder)
      setWorld(result.world);

      // Update scenario ID for experiment tracking
      setCurrentScenarioId(filename);

      // Restore camera position if available (with setTimeout like Builder)
      if (result.scenario.camera && cameraRef.current) {
        setTimeout(() => {
          const cam = cameraRef.current?.el;
          const { position, rotation } = result.scenario.camera;
          cam.setAttribute(
            "position",
            `${position.x} ${position.y} ${position.z}`
          );
          cam.setAttribute(
            "rotation",
            `${rotation.x} ${rotation.y} ${rotation.z}`
          );

          // Broadcast camera position to Mobile
          updateCamera({ position, rotation });
        }, 100);
      }

      // Notify Mobile to reload (optional - Mobile can manually refresh)
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
useEffect(() => {
    localStorage.setItem("researcher_visionMode", visionMode);
  }, [visionMode]);

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        background: "#1a1a1a",
        color: "#eee",
        fontFamily: "Segoe UI, Roboto, sans-serif",
      }}
    >
<ResearcherSidePanel 
  vault={vault}
  isConnected={isConnected}
  mobileId={mobileId}
  aiConnected={aiConnected} // Note: You might need to rename isConnected from useAiStream to aiConnected to avoid clash
  visionMode={visionMode}
  setVisionMode={setVisionMode}
  currentScenarioId={currentScenarioId}
  socket={socket}
  setCollisionCount={setCollisionCount}
  setCollisionLog={setCollisionLog}
  world={world}
  cameraRef={cameraRef}
  aiHudCanvasRef={aiHudCanvasRef}
  collisionCount={collisionCount}
  collisionLog={collisionLog}
  onOpenLoadDialog={handleOpenLoadDialog}
  saveLoadLoading={saveLoadLoading}
/>

      {/* --- 3D VIEWPORT WITH ASPECT RATIO FIX --- */}
      <div
        style={{
          flex: 1,
          position: "relative",
          background: "black",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Force 16:9 Aspect Ratio for Capture */}
        <div
          style={{
            width: "100%",
            maxWidth: "177.78vh",
            aspectRatio: "16/9",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              zIndex: 1000,
              background: "rgba(0,0,0,0.6)",
              color: "white",
              padding: "8px",
              borderRadius: "4px",
              fontSize: "11px",
              fontFamily: "monospace",
              pointerEvents: "none",
            }}
          >
            <div>🎮 VR Controller + ⌨️ WASD</div>
          </div>

         <WorldScene entities={world.entities} isMobile={false}>
            {/* 1. Environment */}
            <Entity
              primitive="a-sky"
              material={{ color: "#fff" }}
              segments-width="50"
              segments-height="50"
            />
            <Entity
              light={{ type: "ambient", color: "#ffffff", intensity: 0.9 }}
            />
            <Entity
              primitive="a-plane"
              position="0 0 0"
              rotation="-90 0 0"
              width="50"
              height="100"
              material={{ src: groundTexture, repeat: "20 20" }}
              segments-width="50"
              segments-height="100"
            />
            
            <Entity
              primitive="a-light"
              type="ambient"
              color="#ffffff"
              intensity="0"
              distance="15"
              position="0 4 2"
            />

            {/* 2. Researcher Camera Rig (Unique to this view) */}
            <Entity
              ref={cameraRef}
              primitive="a-camera"
              look-controls="enabled: false"
              wasd-controls="enabled: true; acceleration: 15"
              vr-movement-controls="speed: 5; verticalSpeed: 3; acceleration: 15; heightUpButton: 7; heightDownButton: 6"
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

export default ResearcherView;
