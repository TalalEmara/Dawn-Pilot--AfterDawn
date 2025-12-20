import React, { useState } from 'react';
import type { SavedScenarioMetadata } from '../../../hooks/useScenarioSaveLoad';
import styles from './ScenarioLoadDialog.module.css';

interface ScenarioLoadDialogProps {
  scenarios: SavedScenarioMetadata[];
  onLoad: (filename: string) => void;
  onCancel: () => void;
  onDelete?: (filename: string) => void;
  loading?: boolean;
}

const ScenarioLoadDialog: React.FC<ScenarioLoadDialogProps> = ({ 
  scenarios, 
  onLoad, 
  onCancel,
  onDelete,
  loading = false 
}) => {
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleLoad = () => {
    if (selectedFilename) {
      const confirmed = window.confirm(
        'Loading this scenario will replace your current world. Continue?'
      );
      if (confirmed) {
        onLoad(selectedFilename);
      }
    }
  };

  const handleDelete = (filename: string) => {
    if (confirmDelete === filename) {
      onDelete?.(filename);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(filename);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>Load Scenario</h2>
        
        {scenarios.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No saved scenarios found.</p>
            <p className={styles.emptyHint}>Create your first scenario by building a world and clicking Save.</p>
          </div>
        ) : (
          <div className={styles.scenarioList}>
            {scenarios.map((scenario) => (
              <div 
                key={scenario.filename}
                className={`${styles.scenarioCard} ${selectedFilename === scenario.filename ? styles.selected : ''}`}
                onClick={() => setSelectedFilename(scenario.filename)}
              >
                <div className={styles.scenarioHeader}>
                  <h3 className={styles.scenarioName}>{scenario.name}</h3>
                  <span className={styles.entityCount}>{scenario.entityCount} entities</span>
                </div>
                
                {scenario.description && (
                  <p className={styles.scenarioDescription}>{scenario.description}</p>
                )}
                
                <div className={styles.scenarioFooter}>
                  <span className={styles.scenarioDate}>{formatDate(scenario.createdAt)}</span>
                  
                  {onDelete && (
                    <button
                      className={styles.deleteButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(scenario.filename);
                      }}
                      disabled={loading}
                    >
                      {confirmDelete === scenario.filename ? 'Confirm Delete?' : '🗑️'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

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
            type="button"
            onClick={handleLoad}
            className={styles.loadButton}
            disabled={loading || !selectedFilename}
          >
            {loading ? 'Loading...' : 'Load Selected'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScenarioLoadDialog;
