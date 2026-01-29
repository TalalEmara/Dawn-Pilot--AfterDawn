import React, { useState, useEffect } from 'react';
import styles from './SubjectSettingsPanel.module.css';

interface SubjectSettingsPanelProps {
  onSubjectIdChange?: (id: string) => void;
  onEyeControlChange?: (control: string) => void;
  disabled?: boolean;
}

const SubjectSettingsPanel: React.FC<SubjectSettingsPanelProps> = ({
  onSubjectIdChange,
  onEyeControlChange,
  disabled = false
}) => {
  const [subjectId, setSubjectId] = useState(() => {
    const saved = localStorage.getItem('subject_id');
    return saved || 'test_subject_01';
  });

  const [eyeControl, setEyeControl] = useState(() => {
    const saved = localStorage.getItem('eye_control');
    return saved || 'R';
  });

  useEffect(() => {
    localStorage.setItem('subject_id', subjectId);
    onSubjectIdChange?.(subjectId);
  }, [subjectId]); // Only depend on subjectId, not the callback

  useEffect(() => {
    localStorage.setItem('eye_control', eyeControl);
    onEyeControlChange?.(eyeControl);
  }, [eyeControl]); // Only depend on eyeControl, not the callback

  return (
    <div className={styles.panel}>
      <div className={styles.inputGroup}>
        <label className={styles.label}>Subject ID</label>
        <input
          type="text"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          disabled={disabled}
          className={styles.input}
          placeholder="Enter subject identifier"
        />
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.label}>Eye Control</label>
        <select
          value={eyeControl}
          onChange={(e) => setEyeControl(e.target.value)}
          disabled={disabled}
          className={styles.select}
        >
          <option value="R">Right</option>
          <option value="L">Left</option>
          
        </select>
        <div className={styles.info}>
          Selected: {eyeControl}
        </div>
      </div>
    </div>
  );
};

export default SubjectSettingsPanel;
