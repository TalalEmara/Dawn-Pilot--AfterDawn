import React, { useEffect, useRef, useState } from "react";
import styles from "./ResearcherLite.module.css";
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
import FrameEncoderWorker from "../../workers/frameEncoder.worker?worker";
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
function ResearcherLite() {
  const cameraRef = useRef<any>(null);
  const hitboxRef = useRef<any>(null);
  const cameraInitialized = useRef<boolean>(false);
  const [currentScenarioId, setCurrentScenarioId] = useState("default_world");
  const [mobileId, setMobileId] = useState<string>("");
  const frameIdRef = useRef<number>(0);
  const workerRef = useRef<Worker | null>(null);
  const [visionMode, setVisionMode] = useState(() => {
    const saved = localStorage.getItem("researcher_visionMode");
    return saved || "prosthetic";
  });

  const [subjectId, setSubjectId] = useState(() => {
    const saved = localStorage.getItem("subject_id");
    return saved || "test_subject_01";
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

  // sending to AI
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

  useFrameBuffer({
    downsamplePercentage: frameBufferSettings.downsamplePercentage,
    enabled: aiWebSocket?.readyState === WebSocket.OPEN,
    logInterval: 1000 / frameBufferSettings.frequency,
    // UPDATE CALLBACK
    onFrame: async (pixelBuffer, width, height, depthBlob) => {
      if (aiWebSocket?.readyState !== WebSocket.OPEN) return;

      try {
        const needsDepth = visionMode === "prosthetic";
        frameIdRef.current++;

        workerRef.current?.postMessage(
          {
            pixelBuffer: pixelBuffer.buffer, // Send the internal buffer
            depthBlob: needsDepth ? depthBlob : null,
            frameId: frameIdRef.current,
            stage: getStageFromVisionMode(visionMode),
            width: width,
            height: height,
          },
          [pixelBuffer.buffer], // <--- CRITICAL: Transfer Ownership (Zero Copy)
        );
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
          const { position, rotation } = result.scenario.camera;
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
          // useAiStream will automatically reconnect due to dependency change
        }}
        onKMaxChange={(k) => {
          console.log("k-max configured:", k);
        }}
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
          >
            <Entity
              ref={cameraRef}
              primitive="a-camera"
              look-controls="enabled: false"
              wasd-controls="enabled: true; acceleration: 15"
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
