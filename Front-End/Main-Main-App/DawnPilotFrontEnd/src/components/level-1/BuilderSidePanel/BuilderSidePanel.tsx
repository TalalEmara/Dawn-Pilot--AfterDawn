import PixelTransitionWrapper from '../../level-0/PixelTransition/PixelTransitionWrapper';
import styles from './BuilderSidePanel.module.css';
import CarImg from '../../../assets/modelsImages/Car.jpg';
import { useWorld } from '../../../contexts/WorldContext';

function BuilderSidePanel() {
  const { addCube } = useWorld();

  const handleAddCar = () => {
    // You can customize the cube properties for the car model
    addCube({
      position: { x: 0, y: 0.5, z: -4 },
      rotation: { x: 0, y: 0, z: 0 },
      color: '#FF6B6B' // Red color for car
    });
  };
 
  return (
    <aside className={styles.panel}>
      {/* another component to be build */}
      <div className={styles.sideIconBar}>sss</div>

      <div className={styles.sideContent}>
        <p className={styles.heading}>Models</p>
        <div className={styles.modelList}>
          <PixelTransitionWrapper 
            image={CarImg} 
            className={styles.modelCard}
            onClick={handleAddCar}
          />
        </div>
      </div>
    </aside>
  );
}

export default BuilderSidePanel;