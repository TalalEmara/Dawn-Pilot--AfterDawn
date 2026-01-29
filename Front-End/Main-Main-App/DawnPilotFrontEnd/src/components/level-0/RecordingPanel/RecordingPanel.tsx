import styles from "./RecordingPanel.module.css";
import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Circle, Square } from "lucide-react";
import { useExperimentVault } from "../../../hooks/Recording/useExperimentVault";
{/* 
    usage
    
    <RecordingPanel
  ref={recordingPanelRef}
  socket={socket}
  mobileId={mobileId}
  subjectId={subjectId}
  currentScenarioId={currentScenarioId}
  visionMode={visionMode}
  onRecordingStart={() => {
    setCollisionCount(0);
    setCollisionLog([]);
  }}
/> */}
// Helper function
const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
};

interface RecordingPanelProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket: any;
  mobileId: string;
  subjectId: string;
  currentScenarioId: string;
  visionMode: string;
  onRecordingStart?: () => void;
  onRecordingStop?: (filename: string) => void;
}

export interface RecordingPanelRef {
  logCollision: (obstacleId: string) => void;
}

const RecordingPanel = forwardRef<RecordingPanelRef, RecordingPanelProps>(({
  socket,
  mobileId,
  subjectId,
  currentScenarioId,
  visionMode,
  onRecordingStart,
  onRecordingStop,
}, ref) => {
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  
  // Vault is now encapsulated in RecordingPanel
  const vault = useExperimentVault(socket);

  // Expose logCollision method via ref
  useImperativeHandle(ref, () => ({
    logCollision: (obstacleId: string) => {
      vault.logCollision(obstacleId);
    }
  }));

  const handleStartRecording = useCallback(async () => {
    if (!socket?.id || !mobileId) {
      alert("⚠️ Cannot start recording: Missing connection! Ensure Mobile Viewer is connected.");
      return;
    }
    
    const success = await vault.startExperiment({
      laptopSocketId: socket.id,
      mobileId: mobileId,
      subjectId: subjectId,
      scenarioId: currentScenarioId,
      visionMode: visionMode,
    });
    
    if (success && onRecordingStart) {
      onRecordingStart();
    }
  }, [socket, mobileId, subjectId, currentScenarioId, visionMode, vault, onRecordingStart]);

  const handleStopRecording = useCallback(async () => {
    const filename = await vault.stopExperiment();
    if (filename) {
      console.log(`✅ Experiment saved: ${filename}`);
      if (onRecordingStop) {
        onRecordingStop(filename);
      }
    }
  }, [vault, onRecordingStop]);

  // Stop recording on unmount or page refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      vault.stopExperiment().catch(() => {});
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      vault.stopExperiment().catch(() => {});
    };
  }, []);

  // Timer logic
  useEffect(() => {
    if (!vault.isRecording || !vault.startTime) {
      setElapsedTime(0);
      return;
    }
    const interval = setInterval(
      () => setElapsedTime(Date.now() - (vault.startTime ?? 0)),
      1000
    );
    return () => clearInterval(interval);
  }, [vault.isRecording, vault.startTime]);

  // Log errors to console
  useEffect(() => {
    if (vault.error) {
      console.warn("⚠️ Recording Panel Error:", vault.error);
    }
  }, [vault.error]);

  const isRecording = vault.isRecording;
  const canStart = !!mobileId;

  return (
    <div className={`${styles.panel} ${isRecording ? styles.recording : ""}`}>
      <p className={`${styles.timer} ${isRecording ? styles.recording : ""}`}>
        {formatTime(elapsedTime)}
      </p>
      <div className={styles.buttons}>
        <button
          className={`${styles.recordButton} ${isRecording ? styles.active : ""}`}
          onClick={handleStartRecording}
          disabled={isRecording || !canStart}
          title={!canStart ? "Mobile viewer must be connected" : "Start recording"}
        >
          {isRecording ? <Circle size={18} /> : <Circle size={18} />}
        </button>
        <button
          className={styles.stopButton}
          onClick={handleStopRecording}
          disabled={!isRecording}
          title="Stop recording"
        >
          <Square size={18} />
        </button>
      </div>
    </div>
  );
});

RecordingPanel.displayName = "RecordingPanel";

export default RecordingPanel;
