import PixelTransitionWrapper from '../../level-0/PixelTransition/PixelTransitionWrapper';
import styles from './BuilderSidePanel.module.css';
import CarImg from '../../../assets/modelsImages/Car.jpg';
import { useScenario } from '../../../contexts/ScenarioContext';
import DawnButton from '../../level-0/DawnButton/DawnButton';

function BuilderSidePanel() {
  const { addEntity, models, loading } = useScenario();

  const handleAddCar = async () => {
    await addEntity('Car', {
      Position: { x: 0, y: 0.5, z: -4 },
      Scale: { x: 0.06, y: 0.06, z: 0.06 }
    });
  };

  const handleAddBuilding = async () => {
    await addEntity('Cube', {
      Position: { x: 10, y: 0, z: -10 }
    });
  };

  const handleAddTree = async () => {
    await addEntity('Sphere', {
      Position: { x: -5, y: 0, z: -5 }
    });
  };

  return (
    <aside className={styles.panel}>
      <div className={styles.sideContent}>
        <p className={styles.logo}>DawnPilot</p>
        <p className={styles.heading}>Models ({models.length})</p>
        
        <div className={styles.modelList}>
          <PixelTransitionWrapper 
            image={CarImg} 
            className={styles.modelCard}
            onClick={handleAddCar}
          />
          <PixelTransitionWrapper 
            image={CarImg} 
            className={styles.modelCard}
            onClick={handleAddBuilding}
          />
          <PixelTransitionWrapper 
            image={CarImg} 
            className={styles.modelCard}
            onClick={handleAddTree}
          />
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