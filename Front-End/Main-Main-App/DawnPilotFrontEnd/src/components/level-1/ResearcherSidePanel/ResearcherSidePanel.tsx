import React, { useEffect, useState } from "react";
import styles from "./ResearcherSidePanel.module.css";
import Minimap from "../../level-0/MiniMap/MiniMap";
import { useKMax } from "../../../hooks/useKmax";

// Helper locally scoped
const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
};

interface ResearcherSidePanelProps {
  vault: any; // Using existing type convention from your codebase
  isConnected: boolean;
  mobileId: string;
  aiConnected: boolean;
  
  // Vision Mode (Shared state)
  visionMode: string;
  setVisionMode: (mode: string) => void;
  
  // Experiment Logic
  currentScenarioId: string;
  socket: any;
  setCollisionCount: React.Dispatch<React.SetStateAction<number>>;
  setCollisionLog: React.Dispatch<React.SetStateAction<string[]>>;
  
  // Visuals / Logs
  world: any;
  cameraRef: any;
  aiHudCanvasRef: any;
  collisionCount: number;
  collisionLog: string[];
  
  // Load Dialog
  onOpenLoadDialog: () => void;
  saveLoadLoading: boolean;
}

const ResearcherSidePanel: React.FC<ResearcherSidePanelProps> = ({
  vault,
  isConnected,
  mobileId,
  aiConnected,
  visionMode,
  setVisionMode,
  currentScenarioId,
  socket,
  setCollisionCount,
  setCollisionLog,
  world,
  cameraRef,
  aiHudCanvasRef,
  collisionCount,
  collisionLog,
  onOpenLoadDialog,
  saveLoadLoading
}) => {
  
  // --- Local UI State ---
  const [subjectId, setSubjectId] = useState("test_subject_01");
  const [kMaxValue, setKMaxValue] = useState<number>(2);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  
  // Hook for K-Max
  const { configureKMax } = useKMax();

  // --- Handlers ---

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

  const handleConfigureKMax = (k: number) => {
    configureKMax(k, {
      onSuccess: () => {
        setKMaxValue(k);
        console.log(`✅ k_max configured to ${k}`);
      }
    });
  };

  // --- Effects ---

  // Timer logic moved here
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

  return (
    <div className={styles.sidebar}>
      {/* HEADER */}
      <div className={styles.header}>
        <h2 className={`${styles.headerTitle} ${vault.isRecording ? styles.recordingColor : styles.idleColor}`}>
          {vault.isRecording ? "🔴 Recording..." : "🧪 Research Control"}
        </h2>
        <div className={styles.statusLine}>
          Laptop: {isConnected ? "🟢" : "🔴"} | Mobile:{" "}
          {mobileId ? "🟢" : "🔴"} | AI:{" "}
          {aiConnected ? "🟢" : "🔴"}
        </div>
      </div>

      {/* SCROLL CONTENT */}
      <div className={styles.scrollArea}>
        
        {/* SETUP BOX */}
        <div className={styles.sectionBox}>
          <div className={styles.sectionLabel}>Setup</div>
          
          {/* Subject ID */}
          <div className={styles.inputGroup}>
            <label className={styles.label}>Subject ID</label>
            <input
              type="text"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={vault.isRecording}
              className={styles.input}
            />
          </div>

          {/* Vision Mode */}
          <div className={styles.inputGroup}>
            <label className={styles.label}>Vision Mode</label>
            <select
              value={visionMode}
              onChange={(e) => setVisionMode(e.target.value)}
              disabled={vault.isRecording}
              className={styles.select}
            >
              <option value="normal">Normal Vision</option>
              <option value="prosthetic">Prosthetic Simulation</option>
              <option value="low_res">Low Resolution</option>
            </select>
          </div>

          {/* k_max Configuration */}
          <div className={styles.inputGroup}>
            <label className={styles.label}>k_max Configuration</label>
            <div className={styles.kMaxContainer}>
              {[1, 2, 3].map((k) => (
                <button
                  key={k}
                  onClick={() => handleConfigureKMax(k)}
                  disabled={vault.isRecording}
                  className={`${styles.kMaxButton} ${kMaxValue === k ? styles.kMaxButtonActive : ''}`}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className={styles.kMaxInfo}>
              Current: k_max = {kMaxValue}
            </div>
          </div>

          {/* Start/Stop Button */}
          {!vault.isRecording ? (
            <button
              onClick={handleStartExperiment}
              disabled={!mobileId}
              className={`${styles.actionButton} ${mobileId ? styles.startBtn : styles.startBtnDisabled}`}
            >
              {vault.isLoading ? "Starting..." : "Start Recording"}
            </button>
          ) : (
            <button
              onClick={handleStopExperiment}
              className={`${styles.actionButton} ${styles.stopBtn}`}
            >
              {vault.isLoading ? "Stopping..." : "Stop Recording"}
            </button>
          )}
          
          {vault.error && (
            <div className={styles.errorMessage}>
              Error: {vault.error}
            </div>
          )}
        </div>

        {/* MINIMAP */}
        <Minimap entities={world.entities} cameraRef={cameraRef} />

        {/* AI LIVE FEED */}
        <div className={styles.canvasContainer}>
          <div className={styles.sectionLabel}>AI Live Feed (Sending)</div>
          <div className={styles.canvasBox}>
            <canvas
              ref={aiHudCanvasRef}
              className={styles.canvas}
            />
          </div>
        </div>

        {/* DURATION */}
        <div style={{ marginBottom: "24px" }}>
          <div className={styles.sectionLabel}>Session Duration</div>
          <div className={styles.timeDisplay}>
            {formatTime(elapsedTime)}
          </div>
        </div>

        {/* METRICS */}
        <div className={styles.sectionBox}>
          <div className={styles.sectionLabel}>Metrics</div>
          <div className={styles.metricsRow}>
            <span>Collisions:</span>
            <span className={`${styles.metricsValue} ${collisionCount > 0 ? styles.metricsValueDanger : ''}`}>
              {collisionCount}
            </span>
          </div>
        </div>

        {/* LOGS */}
        <div>
          <div className={styles.sectionLabel}>Recent Events</div>
          <ul className={styles.logList}>
            {collisionLog.length === 0 && (
              <li className={styles.emptyLog}>No events logged.</li>
            )}
            {collisionLog.map((log, idx) => (
              <li key={idx} className={styles.logItem}>
                {log}
              </li>
            ))}
          </ul>
        </div>

        {/* LOAD SCENARIO */}
        <div className={styles.loadButtonWrapper}>
          <button
            className={styles.loadButton}
            onClick={onOpenLoadDialog}
            disabled={saveLoadLoading || vault.isRecording}
          >
            📂 Load Scenario
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResearcherSidePanel;