import styles from './DawnButton.module.css'

interface DawnButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  classType?: 'primary' | 'secondary';
}

function DawnButton({ label, onClick, disabled = false , classType = 'primary'}: DawnButtonProps) {
  return (
    <button 
      className={classType == 'primary' ? styles.dawnButton : styles.dawnButtonSecondary} 
      onClick={onClick} 
      disabled={disabled}
    >
      {label}
    </button>
  );
}

export default DawnButton;
