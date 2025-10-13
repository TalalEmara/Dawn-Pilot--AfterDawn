import styles from './DawnButton.module.css'

interface DawnButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

function DawnButton({ label, onClick, disabled = false }: DawnButtonProps) {
  return (
    <button 
      className={styles.dawnButton} 
      onClick={onClick} 
      disabled={disabled}
    >
      {label}
    </button>
  );
}

export default DawnButton;
