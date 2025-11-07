import PixelTransitionWrapper from '../../level-0/PixelTransition/PixelTransitionWrapper';
import styles from './BuilderSidePanel.module.css';
import CarImg from '../../../assets/modelsImages/Car.jpg';
import { useScenario } from '../../../contexts/ScenarioContext';
import DawnButton from '../../level-0/DawnButton/DawnButton';

function BuilderSidePanel() {
  const { addEntity, models, loading } = useScenario();

  return (
    <aside className={styles.panel}>
      <div className={styles.sideContent}>
        <p className={styles.logo}>DawnPilot</p>
        <p className={styles.heading}>Models ({models.length})</p>
        
        <div className={styles.modelList}>
          {models.map((model) => (
            <PixelTransitionWrapper 
              key={model.name}
              image={CarImg} 
              className={styles.modelCard}
              onClick={() => addEntity(model.name, {
                Position: { x: 0, y: 0.5, z: -4 },
                Scale: { x: 0.06, y: 0.06, z: 0.06 }
              })}
            >
              <div className={styles.modelCardContent}>
                <span className={styles.modelName}>{model.name}</span>
                {model.description && (
                  <span className={styles.modelDescription}>{model.description}</span>
                )}
              </div>
            </PixelTransitionWrapper>
          ))}
        </div>

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
        </div>

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