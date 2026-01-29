import React from 'react';
import styles from './AiFeedPanel.module.css';

interface AiFeedPanelProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

const AiFeedPanel: React.FC<AiFeedPanelProps> = ({ canvasRef }) => {
  return (
    <div className={styles.container}>
      <div className={styles.label}>AI Live Feed</div>
      <div className={styles.canvasBox}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
    </div>
  );
};

export default AiFeedPanel;
