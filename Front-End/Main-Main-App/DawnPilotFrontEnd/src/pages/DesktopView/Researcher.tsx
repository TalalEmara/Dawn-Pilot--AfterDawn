import "aframe";
import "../../AFrameComponents/VRMovementControls";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from "aframe-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useScenarioWorld } from "../../hooks/useScenarioWorld";
import { useCameraSync } from "../../hooks/useCameraSync";
import { useFrameBuffer } from "../../hooks/useFrameBuffer";
import { useCollisionDetection } from "../../hooks/useCollision";
import { useScenarioSaveLoad } from "../../hooks/useScenarioSaveLoad";
import { useExperimentVault } from "../../hooks/Recording/useExperimentVault";
import ScenarioLoadDialog from "../../components/level-1/ScenarioLoadDialog/ScenarioLoadDialog";
import Minimap from "../../components/level-0/MiniMap/MiniMap";
import { useBinaryStream } from "../../hooks/useBinarySystem";
import { SERVER_IP } from "../../ApiConfig";
import groundTexture from "../../assets/ground/ground.jpg";

// Helper to format milliseconds into MM:SS
const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
};

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

function ResearcherView() {
  const cameraRef = useRef<any>(null);
  const hitboxRef = useRef<any>(null);

  // --- Research / Experiment State ---
  const [subjectId, setSubjectId] = useState("test_subject_01");
  const [visionMode, setVisionMode] = useState("prosthetic");
  const [currentScenarioId, setCurrentScenarioId] = useState("default_world");
  const [mobileId, setMobileId] = useState<string>("");

  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [collisionCount, setCollisionCount] = useState<number>(0);
  const [collisionLog, setCollisionLog] = useState<string[]>([]);

  // AI Socket State
  const [aiWebSocket, setAiWebSocket] = useState<WebSocket | null>(null);
  const frameIdRef = useRef<number>(0);

  const aiHudCanvasRef = useBinaryStream(aiWebSocket);

  // 1. Get socket from CameraSync
  const { isConnected, updateCamera, setOnCameraUpdate, socket } =
    useCameraSync({
      clientType: "desktop",
      throttleMs: 16,
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

  // --- AI WebSocket Connection ---
  useEffect(() => {
    const ws = new WebSocket(`ws://${SERVER_IP}:8000/ws/navigation-phosphene`);

    ws.onopen = () => {
      console.log("🟢 [Researcher] AI WebSocket Connected");
      setAiWebSocket(ws);
    };

    ws.onerror = (error) =>
      console.error("🔴 [Researcher] AI WebSocket Error:", error);
    ws.onclose = () => {
      console.log("🔴 [Researcher] AI WebSocket Disconnected");
      setAiWebSocket(null);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, []);

  // --- Frame Capture & Sending ---
  useFrameBuffer({
    downsamplePercentage: 50,
    enabled: aiWebSocket?.readyState === WebSocket.OPEN,
    logInterval: 100,
    onFrame: async (rgbBlob, depthBlob) => {
      if (aiWebSocket?.readyState !== WebSocket.OPEN) return;

      try {
        const rgbBase64 = await blobToBase64(rgbBlob);
        const depthBase64 = depthBlob ? await blobToBase64(depthBlob) : null;

        if (!depthBase64) return;

        frameIdRef.current++;

        const message = {
          type: "frame",
          frame_id: String(frameIdRef.current).padStart(3, "0"),
          rgb: rgbBase64,
          depth: depthBase64,
          stage: "phosphene",
        };

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

  useEffect(() => {
    loadWorld().catch((err) =>
      console.error("Researcher - Failed to load world:", err)
    );
  }, [loadWorld]);

  useEffect(() => {
    if (!vault.isRecording || !vault.startTime) {
      setElapsedTime(0);
      return;
    }
    const interval = setInterval(
      () => setElapsedTime(Date.now() - vault.startTime!),
      1000
    );
    return () => clearInterval(interval);
  }, [vault.isRecording, vault.startTime]);

  // Master of Position
  useEffect(() => {
    const broadcastCamera = () => {
      const el = cameraRef.current?.el;
      if (el) {
        const position = el.getAttribute("position");
        const rotation = el.getAttribute("rotation");
        if (position && rotation) {
          updateCamera({
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
          });
        }
      }
      requestAnimationFrame(broadcastCamera);
    };
    const animationId = requestAnimationFrame(broadcastCamera);
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
      const timestamp = new Date().toLocaleTimeString();
      const logMsg = `[${timestamp}] Hit: ${detail.obstacleId}`;
      console.warn(`💥 ${logMsg}`);
      setCollisionCount((prev) => prev + 1);
      setCollisionLog((prev) => [logMsg, ...prev].slice(0, 10));
      vault.logCollision(detail.obstacleId);
    },
    [vault]
  );

  useCollisionDetection(hitboxRef, handleCollision);

  // Handlers
  const handleStartExperiment = async () => {
    if (!socket?.id || !mobileId) {
      alert("Missing connection! Ensure Mobile Viewer is connected.");
      return;
    }
    const success = await vault.startExperiment({
      laptopSocketId: socket.id,
      mobileId: mobileId,
      subjectId: subjectId,
      scenarioId: currentScenarioId,
      visionMode: visionMode,
    });
    if (success) {
      setCollisionCount(0);
      setCollisionLog([]);
    }
  };

  const handleStopExperiment = async () => {
    const filename = await vault.stopExperiment();
    if (filename) alert(`Experiment saved: ${filename}`);
  };

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
          const cam = cameraRef.current.el;
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
      {/* SIDEBAR */}
      <div
        style={{
          width: "320px",
          background: "#222",
          borderRight: "1px solid #444",
          display: "flex",
          flexDirection: "column",
          zIndex: 10,
        }}
      >
        <div
          style={{
            padding: "20px",
            borderBottom: "1px solid #444",
            background: "#2d2d2d",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "18px",
              color: vault.isRecording ? "#ff4444" : "#4CAF50",
            }}
          >
            {vault.isRecording ? "🔴 Recording..." : "🧪 Research Control"}
          </h2>
          <div style={{ fontSize: "12px", color: "#aaa", marginTop: "5px" }}>
            Laptop: {isConnected ? "🟢" : "🔴"} | Mobile:{" "}
            {mobileId ? "🟢" : "🔴"} | AI:{" "}
            {aiWebSocket?.readyState === WebSocket.OPEN ? "🟢" : "🔴"}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          <div
            style={{
              marginBottom: "24px",
              background: "#333",
              padding: "15px",
              borderRadius: "8px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                textTransform: "uppercase",
                color: "#888",
                marginBottom: "8px",
              }}
            >
              Setup
            </div>
            <div style={{ marginBottom: "10px" }}>
              <label style={{ fontSize: "11px", color: "#aaa" }}>
                Subject ID
              </label>
              <input
                type="text"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                disabled={vault.isRecording}
                style={{
                  width: "100%",
                  padding: "5px",
                  background: "#222",
                  border: "1px solid #444",
                  color: "white",
                }}
              />
            </div>
            <div style={{ marginBottom: "10px" }}>
              <label style={{ fontSize: "11px", color: "#aaa" }}>
                Vision Mode
              </label>
              <select
                value={visionMode}
                onChange={(e) => setVisionMode(e.target.value)}
                disabled={vault.isRecording}
                style={{
                  width: "100%",
                  padding: "5px",
                  background: "#222",
                  border: "1px solid #444",
                  color: "white",
                }}
              >
                <option value="normal">Normal Vision</option>
                <option value="prosthetic">Prosthetic Simulation</option>
                <option value="low_res">Low Resolution</option>
              </select>
            </div>
            {!vault.isRecording ? (
              <button
                onClick={handleStartExperiment}
                disabled={!mobileId}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: mobileId ? "#4CAF50" : "#555",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: mobileId ? "pointer" : "not-allowed",
                  fontWeight: "bold",
                }}
              >
                {vault.isLoading ? "Starting..." : "Start Recording"}
              </button>
            ) : (
              <button
                onClick={handleStopExperiment}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "#f44336",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                {vault.isLoading ? "Stopping..." : "Stop Recording"}
              </button>
            )}
            {vault.error && (
              <div
                style={{ color: "#ff6b6b", fontSize: "11px", marginTop: "5px" }}
              >
                Error: {vault.error}
              </div>
            )}
          </div>

          <Minimap entities={world.entities} cameraRef={cameraRef} />

          <div style={{ marginTop: "20px", marginBottom: "24px" }}>
            <div
              style={{
                fontSize: "12px",
                textTransform: "uppercase",
                color: "#888",
                marginBottom: "8px",
              }}
            >
              AI Live Feed (Sending)
            </div>
            <div
              style={{
                width: "100%",
                aspectRatio: "16/9",
                background: "#000",
                borderRadius: "4px",
                border: "1px solid #444",
                overflow: "hidden",
              }}
            >
              <canvas
                ref={aiHudCanvasRef}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                fontSize: "12px",
                textTransform: "uppercase",
                color: "#888",
                marginBottom: "8px",
              }}
            >
              Session Duration
            </div>
            <div
              style={{
                fontSize: "32px",
                fontWeight: "bold",
                fontFamily: "monospace",
              }}
            >
              {formatTime(elapsedTime)}
            </div>
          </div>

          <div
            style={{
              marginBottom: "24px",
              background: "#333",
              borderRadius: "8px",
              padding: "15px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                textTransform: "uppercase",
                color: "#888",
                marginBottom: "8px",
              }}
            >
              Metrics
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Collisions:</span>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: "bold",
                  color: collisionCount > 0 ? "#ff6b6b" : "#fff",
                }}
              >
                {collisionCount}
              </span>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: "12px",
                textTransform: "uppercase",
                color: "#888",
                marginBottom: "8px",
              }}
            >
              Recent Events
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                fontSize: "12px",
                color: "#ccc",
              }}
            >
              {collisionLog.length === 0 && (
                <li style={{ fontStyle: "italic", color: "#555" }}>
                  No events logged.
                </li>
              )}
              {collisionLog.map((log, idx) => (
                <li
                  key={idx}
                  style={{
                    marginBottom: "6px",
                    borderBottom: "1px solid #333",
                    paddingBottom: "4px",
                  }}
                >
                  {log}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: "24px" }}>
            <button
              style={{
                backgroundColor: "#00ff88",
                color: "#000",
                fontWeight: "bold",
                border: "none",
                padding: "8px 12px",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px",
                width: "100%",
              }}
              onClick={handleOpenLoadDialog}
              disabled={saveLoadLoading || vault.isRecording}
            >
              📂 Load Scenario
            </button>
          </div>
        </div>
      </div>

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

          <Scene
            embedded
            vr-mode-ui="enabled: false"
            style={{ width: "100%", height: "100%" }}
            renderer="preserveDrawingBuffer: true; antialias: false"
          >
            <Entity primitive="a-sky" material={{ src: groundTexture, repeat: "20 20" }}
              segments-width="50"
              segments-height="50" />
            <Entity
              light={{ type: "ambient", color: "#ffffff", intensity: 0.9 }}
            />
            {/* <Entity light={{ type: 'directional', color: '#ffffff', intensity: 0.9 }} position="0 2 -6" /> */}
            <Entity
              primitive="a-plane"
              position="0 0 0"
              rotation="-90 0 0"
              width="20"
              height="20"
              material={{ src: groundTexture, repeat: "20 20" }}
              segments-width="50"
              segments-height="50"
            />
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
                  position={`${pos.x} ${pos.y} ${pos.z}`}
                  rotation={`${rot.x} ${rot.y} ${rot.z}`}
                  scale={`${scl.x} ${scl.y} ${scl.z}`}
                />
              );
            })}

            <Entity
              ref={cameraRef}
              primitive="a-camera"
              position="0 1.0 0"
              look-controls="enabled: false"
              wasd-controls="enabled: true; acceleration: 30"
              vr-movement-controls="speed: 5; verticalSpeed: 3; acceleration: 15; heightUpButton: 7; heightDownButton: 6"
              collision-detector="targetSelector: .collidable; cooldown: 1000"
            >
              <Entity
                ref={hitboxRef}
                primitive="a-box"
                position="0 -0.8 0"
                scale=".1 1.6 .1"
                material="opacity: 0.5; color: red; wireframe: true"
                visible={true}
                className="depth-ignore"
                collision-detector="targetSelector: .collidable; cooldown: 1000"
              />
            </Entity>
          </Scene>
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
