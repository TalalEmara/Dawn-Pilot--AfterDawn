import styles from "./ModeControlPanel.module.css";
import { useState, useEffect } from "react";
import { useKMax } from "../../../hooks/useKmax";

interface ModeControlPanelProps {
  disabled?: boolean;
  onVisionModeChange?: (mode: string) => void;
  onKMaxChange?: (k: number) => void;
}

function ModeControlPanel({
  disabled = false,
  onVisionModeChange,
  onKMaxChange,
}: ModeControlPanelProps) {
  const [visionMode, setVisionMode] = useState(() => {
    const saved = localStorage.getItem("researcher_visionMode");
    return saved || "prosthetic";
  });
  
  const [kMaxValue, setKMaxValue] = useState<number>(1);
  
  const { configureKMax } = useKMax();

  const handleVisionModeChange = (mode: string) => {
    setVisionMode(mode);
    localStorage.setItem("researcher_visionMode", mode);
    if (onVisionModeChange) {
      onVisionModeChange(mode);
    }
  };

  const handleConfigureKMax = (k: number) => {
    configureKMax(k, {
      onSuccess: () => {
        setKMaxValue(k);
        if (onKMaxChange) {
          onKMaxChange(k);
        }
      },
    });
  };

  // Persist vision mode
  useEffect(() => {
    localStorage.setItem("researcher_visionMode", visionMode);
  }, [visionMode]);

  return (
    <div className={styles.panel}>
      {/* Vision Mode */}
      <div className={styles.inputGroup}>
        <label className={styles.label}>Vision Mode</label>
        <select
          value={visionMode}
          onChange={(e) => handleVisionModeChange(e.target.value)}
          disabled={disabled}
          className={styles.select}
        >
          <option value="normal">Normal Vision</option>
          <option value="prosthetic">Prosthetic Simulation</option>
          <option value="low_res">Low Resolution</option>
        </select>
      </div>

      {/* k_max Configuration */}
      <div className={styles.inputGroup}>
        <label className={styles.label}>Kmax Configuration</label>
        <div className={styles.kMaxContainer}>
          {[1, 2, 3].map((k) => (
            <button
              key={k}
              onClick={() => handleConfigureKMax(k)}
              disabled={disabled}
              className={`${styles.kMaxButton} ${
                kMaxValue === k ? styles.kMaxButtonActive : ""
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className={styles.kMaxInfo}>Current: Kmax = {kMaxValue}</div>
      </div>
    </div>
  );
}

export default ModeControlPanel;