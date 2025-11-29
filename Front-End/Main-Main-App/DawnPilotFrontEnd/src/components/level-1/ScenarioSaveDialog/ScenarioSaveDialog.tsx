import React, { useState } from 'react';
import styles from './ScenarioSaveDialog.module.css';

interface ScenarioSaveDialogProps {
  onSave: (name: string, description?: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

const ScenarioSaveDialog: React.FC<ScenarioSaveDialogProps> = ({ 
  onSave, 
  onCancel, 
  loading = false 
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim(), description.trim() || undefined);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>Save Scenario</h2>
        
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="scenario-name" className={styles.label}>
              Scenario Name *
            </label>
            <input
              id="scenario-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.input}
              placeholder="e.g., City Layout 1"
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="scenario-description" className={styles.label}>
              Description (optional)
            </label>
            <textarea
              id="scenario-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={styles.textarea}
              placeholder="Add notes about this scenario..."
              rows={3}
              disabled={loading}
            />
          </div>

          <div className={styles.buttonGroup}>
            <button
              type="button"
              onClick={onCancel}
              className={styles.cancelButton}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.saveButton}
              disabled={loading || !name.trim()}
            >
              {loading ? 'Saving...' : 'Save Scenario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScenarioSaveDialog;
