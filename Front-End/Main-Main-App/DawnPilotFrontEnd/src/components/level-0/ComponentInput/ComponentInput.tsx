
import Styles from './ComponentInput.module.css'
interface VectorInputProps {
 label?: string;
 min ?: number;
 max ?: number;
 value ?: { x: number; y: number; z: number;}
 onChange ?: (value: { x: number; y: number; z: number; }) => void;
}
interface StringInputProps {
 label?: string;
 value ?: string;
 onChange ?: (value: string) => void;
}

interface ComponentInputProps {
  type: "Vector3" | "String";
  label?: string;
  value?: string | { x: number; y: number; z: number; };
  onChange?: (value: string | { x: number; y: number; z: number; }) => void;
  min?: number;
  max?: number;
}
function ComponentInput({ type, label, value, onChange, min = -10, max = 10 }: ComponentInputProps) {
  switch (type) {
    case "Vector3":
      return (
        <VectorInput label={label} min={min} max={max} value={value} onChange={onChange} />
      );
    case "String":
      return <StringInput label={label} value={value} onChange={onChange} />;
    default:
      return null;
  }
}

export default ComponentInput

function VectorInput({ label, min, max, value = { x: 0, y: 0, z: 0 }, onChange }: VectorInputProps) {
  const handleChange = (axis: 'x' | 'y' | 'z', v: number) => {
    if (onChange) {
      onChange({ ...value, [axis]: v });
    }
  };
  return (
    <div className={Styles.inputContainer}>
      <p>{label || 'Vector3 Input'}</p>
      <label>X:</label>
      <input
        type="number"
        placeholder="X"
        min={min}
        max={max}
        style={{ width: '30%' }}
        value={value.x}
        onChange={e => handleChange('x', Number(e.target.value))}
      />
      <label>Y:</label>
      <input
        type="number"
        placeholder="Y"
        min={min}
        max={max}
        style={{ width: '30%' }}
        value={value.y}
        onChange={e => handleChange('y', Number(e.target.value))}
      />
      <label>Z:</label>
      <input
        type="number"
        placeholder="Z"
        min={min}
        max={max}
        style={{ width: '30%' }}
        value={value.z}
        onChange={e => handleChange('z', Number(e.target.value))}
      />
    </div>
  );
}
function StringInput({ label, value = '', onChange }: StringInputProps) {
  return (
    <div className={Styles.inputContainer}>
      <p>{label || 'Text Input'}</p>
      <input
        type="text"
        placeholder={label}
        value={value}
        onChange={e => onChange && onChange(e.target.value)}
      />
    </div>
  );
}
