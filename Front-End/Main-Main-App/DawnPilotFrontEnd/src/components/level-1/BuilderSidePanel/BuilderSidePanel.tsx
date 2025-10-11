
import PixelTransitionWrapper from '../../level-0/PixelTransition/PixelTransitionWrapper';
import styles from './BuilderSidePanel.module.css';

import CarImg from '../../../assets/modelsImages/Car.jpg';


function BuilderSidePanel() {
 
  return (
    <aside className={styles.panel}>
        {/* another component to be build */}
       <div className={styles.sideIconBar}>sss</div>

       <div className={styles.sideContent}>
        <p className={styles.heading}>Models</p>
        <div className={styles.modelList}>
          <PixelTransitionWrapper image={CarImg} className={styles.modelCard}/>
        
          
        </div>
       </div>
    </aside>
  )
}

export default BuilderSidePanel