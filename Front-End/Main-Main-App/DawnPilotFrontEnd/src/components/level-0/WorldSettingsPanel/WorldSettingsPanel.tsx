import React, { useState, useEffect } from 'react';
import styles from './WorldSettingsPanel.module.css';

interface WorldSettingsPanelProps {
  onFrameBufferChange?: (settings: { frequency: number; downsamplePercentage: number }) => void;
  onWorldChange?: (settings: { width: number; depth: number; zShift: number; xShift: number }) => void;
  onLiteModeChange?: (enabled: boolean) => void;
  disabled?: boolean;
}

const WorldSettingsPanel: React.FC<WorldSettingsPanelProps> = ({
  onFrameBufferChange,
  onWorldChange,
  onLiteModeChange,
  disabled = false
}) => {
  // Frame Buffer Settings
  const [frequency, setFrequency] = useState(() => {
    const saved = localStorage.getItem('frameBuffer_frequency');
    return saved ? parseInt(saved) : 10;
  });
  
  const [downsampling, setDownsampling] = useState(() => {
    const saved = localStorage.getItem('frameBuffer_downsampling');
    return saved ? parseInt(saved) : 50;
  });

  // World Renderer Settings
  const [worldWidth, setWorldWidth] = useState(() => {
    const saved = localStorage.getItem('world_width');
    return saved ? parseInt(saved) : 40;
  });

  const [worldDepth, setWorldDepth] = useState(() => {
    const saved = localStorage.getItem('world_depth');
    return saved ? parseInt(saved) : 30;
  });

  const [groundZShift, setGroundZShift] = useState(() => {
    const saved = localStorage.getItem('world_zShift');
    return saved ? parseInt(saved) : 2;
  });

  const [groundXShift, setGroundXShift] = useState(() => {
    const saved = localStorage.getItem('world_xShift');
    return saved ? parseInt(saved) : 0;
  });

  // Lite Mode Setting
  const [liteMode, setLiteMode] = useState(() => {
    const saved = localStorage.getItem('world_liteMode');
    return saved === 'true';
  });

  // Persist Frame Buffer settings
  useEffect(() => {
    localStorage.setItem('frameBuffer_frequency', frequency.toString());
    localStorage.setItem('frameBuffer_downsampling', downsampling.toString());
    onFrameBufferChange?.({ frequency: frequency, downsamplePercentage: downsampling });
  }, [frequency, downsampling]); // Only depend on values, not callback

  // Persist World settings
  useEffect(() => {
    localStorage.setItem('world_width', worldWidth.toString());
    localStorage.setItem('world_depth', worldDepth.toString());
    localStorage.setItem('world_zShift', groundZShift.toString());
    localStorage.setItem('world_xShift', groundXShift.toString());
    onWorldChange?.({ 
      width: worldWidth, 
      depth: worldDepth, 
      zShift: groundZShift, 
      xShift: groundXShift 
    });
  }, [worldWidth, worldDepth, groundZShift, groundXShift]); // Only depend on values, not callback - keeping existing comment

  // Persist Lite Mode setting
  useEffect(() => {
    localStorage.setItem('world_liteMode', liteMode.toString());
    onLiteModeChange?.(liteMode);
  }, [liteMode]);

  return (
    <div className={styles.panel}>
      {/* Frame Buffer Settings */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Frame Buffer</div>
        <div className={styles.frameSettings}>
        <div className={styles.inputGroup}>
          <label className={styles.label}>Log Interval (FPS)</label>
          <input
            type="number"
            min="5"
            max="100"
            value={frequency}
            onChange={(e) => setFrequency(Math.min(100, Math.max(5, parseInt(e.target.value) || 5)))}
            disabled={disabled}
            className={styles.input}
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Downsampling (%)</label>
          <input
            type="number"
            min="5"
            max="100"
            value={downsampling}
            onChange={(e) => setDownsampling(Math.min(100, Math.max(5, parseInt(e.target.value) || 5)))}
            disabled={disabled}
            className={styles.input}
          />
        </div>
        </div>
      </div>

      {/* World Renderer Settings */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>World Dimensions</div>
        
        {/* Lite Mode Toggle */}
        <div className={styles.toggleGroup}>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={liteMode}
              onChange={(e) => setLiteMode(e.target.checked)}
              disabled={disabled}
              className={styles.checkbox}
            />
            <span>Lite Mode (Flat Shading)</span>
          </label>
        </div>

        <div className={styles.GroundDimensions}>
        <div className={styles.inputGroup}>
          <label className={styles.label}>Ground Width</label>
          <input
            type="number"
            value={worldWidth}
            onChange={(e) => setWorldWidth(parseInt(e.target.value) || 40)}
            disabled={disabled}
            className={styles.input}
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Ground Depth</label>
          <input
            type="number"
            value={worldDepth}
            onChange={(e) => setWorldDepth(parseInt(e.target.value) || 30)}
            disabled={disabled}
            className={styles.input}
          />
        </div>
        </div>
        <div className={styles.GroundShifts}>
        <div className={styles.inputGroup}>
          <label className={styles.label}>Ground Z Shift</label>
          <input
            type="number"
            value={groundZShift}
            onChange={(e) => setGroundZShift(parseInt(e.target.value) || 2)}
            disabled={disabled}
            className={styles.input}
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Ground X Shift</label>
          <input
            type="number"
            value={groundXShift}
            onChange={(e) => setGroundXShift(parseInt(e.target.value) || 0)}
            disabled={disabled}
            className={styles.input}
          />
        </div>
        </div>
      </div>
    </div>
  );
};

export default WorldSettingsPanel;
