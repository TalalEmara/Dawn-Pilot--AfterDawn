import React, { useState, useEffect } from 'react';
import styles from './WorldSettingsPanel.module.css';

interface WorldSettingsPanelProps {
  onFrameBufferChange?: (settings: { frequency: number; downsamplePercentage: number }) => void;
  onWorldChange?: (settings: { width: number; depth: number; zShift: number; xShift: number }) => void;
  onLiteModeChange?: (enabled: boolean) => void;
  onThrottleChange?: (settings: { desktopMs: number; mobileMs: number }) => void;
  disabled?: boolean;
}

const WorldSettingsPanel: React.FC<WorldSettingsPanelProps> = ({
  onFrameBufferChange,
  onWorldChange,
  onLiteModeChange,
  onThrottleChange,
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

  // Throttle Settings (in milliseconds)
  const [desktopThrottle, setDesktopThrottle] = useState(() => {
    const saved = localStorage.getItem('throttle_desktop');
    return saved ? parseInt(saved) : 33; // Default 33ms = ~30fps
  });

  const [mobileThrottle, setMobileThrottle] = useState(() => {
    const saved = localStorage.getItem('throttle_mobile');
    return saved ? parseInt(saved) : 33; // Default 33ms = ~30fps
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

  // Persist Throttle settings
  useEffect(() => {
    localStorage.setItem('throttle_desktop', desktopThrottle.toString());
    localStorage.setItem('throttle_mobile', mobileThrottle.toString());
    onThrottleChange?.({ desktopMs: desktopThrottle, mobileMs: mobileThrottle });
  }, [desktopThrottle, mobileThrottle]);

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
            min="1"
            max="100"
            value={frequency}
            onChange={(e) => setFrequency(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
            disabled={disabled}
            className={styles.input}
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Downsampling (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            value={downsampling}
            onChange={(e) => setDownsampling(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
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
            <span>Lite Mode</span>
          </label>
        </div>
        {/* Throttle Settings */}
        <div className={styles.sectionTitle} style={{ marginTop: '12px' }}>Camera Throttle (ms)</div>
        <div className={styles.frameSettings}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Desktop Position</label>
            <input
              type="number"
              min="1"
              value={desktopThrottle}
              onChange={(e) => setDesktopThrottle( Math.max(1, parseInt(e.target.value) || 33))}
              disabled={disabled}
              className={styles.input}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Mobile Rotation</label>
            <input
              type="number"
              min="1"
              value={mobileThrottle}
              onChange={(e) => setMobileThrottle( Math.max(1, parseInt(e.target.value) || 33))}
              disabled={disabled}
              className={styles.input}
            />
          </div>
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
