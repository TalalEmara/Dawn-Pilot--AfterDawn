import { useContext } from 'react';
import PixelTransitionWrapper from '../../level-0/PixelTransition/PixelTransitionWrapper';
import styles from './BuilderSidePanel.module.css';
import CarImg from '../../../assets/modelsImages/Car.jpg';
import ScenarioContext, { useScenario } from '../../../contexts/ScenarioContext';
import DawnButton from '../../level-0/DawnButton/DawnButton';
/ Dynamically import ALL images from the modelsImages folder
// This will automatically include any image you add to that folder!
const imageModules = import.meta.glob<{ default: string }>(
  '../../../assets/modelsImages/*.{jpg,jpeg,png,gif,webp}',
  { eager: true }
);

// Convert the glob result to a more usable format
// Key will be the filename (e.g., "Car", "Truck")
const modelImages: Record<string, string> = {};
for (const path in imageModules) {
  // Extract filename without extension from path
  // Example: '../../../assets/modelsImages/Car.jpg' -> 'Car'
  const filename = path.split('/').pop()?.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '') || '';
  modelImages[filename] = imageModules[path].default;
}
// Fallback image - use the first available image or undefined
const DEFAULT_MODEL_IMAGE = Object.values(modelImages)[0];
const getModelImage = (modelName: string): string => {
  return modelImages[modelName] || DEFAULT_MODEL_IMAGE;
};

function BuilderSidePanel() {
  // Use context instead of the hook
  const { models, loading, error, onModelSelect } = useScenario();

  return (
    <aside className={styles.panel}>
      <div className={styles.sideContent}>
        <p className={styles.logo}>DawnPilot</p>
        <p className={styles.heading}>Models ({models.length})</p>
        
        {loading && <p className={styles.loadingText}>Loading models...</p>}
        {error && <p className={styles.errorText}>Error: {error}</p>}
        
        <div className={styles.modelList}>
          {models.map((model) => (
            <PixelTransitionWrapper 
              key={model.name}
              image={getModelImage(model.name)}
              className={styles.modelCard}
              onClick={() => onModelSelect?.(model.name)}
              label={model.name}
            />
          ))}
        </div>
{/* 
        <div className={styles.modelInfo}>
          <p>Available Models:</p>
          <ul>
            {models.map(model => (
              <li key={model.name}>
                <strong>{model.name}</strong>
                {model.description && <span> - {model.description}</span>}
              </li>
            ))}
          </ul>
        </div> */}

        <div className={styles.buttonFooter}>
          <DawnButton 
            label={loading ? 'Loading...' : 'Refresh World'} 
            onClick={() => window.location.reload()} 
            disabled={loading}
          />
        </div>
      </div>
    </aside>
  );
}

export default BuilderSidePanel;