import React from 'react'
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
}
function ComponentInput( {type, label}: ComponentInputProps) {
  switch(type) {
    case "Vector3":
      return (<VectorInput label={label} min={-10} max={10} />)
    case "String":
      return (
        <StringInput label={label}  />
      )
    default:
      return null
  }
}

export default ComponentInput

function VectorInput({ label, min, max }: VectorInputProps) {
  return (
    <div className= {Styles.inputContainer}>
        <p>{label || 'Vector3 Input'}</p>
        <label>X:</label>
        <input type="number" placeholder="X" min={min} max={max} style={{width: '30%'}} />
        <label>Y:</label>
        <input type="number" placeholder="Y" min={min} max={max} style={{width: '30%'}} />
        <label>Z:</label>
        <input type="number" placeholder="Z" min={min} max={max} style={{width: '30%'}} />  
    </div>
  )
}
function StringInput({ label}: StringInputProps) {
  return (
    <div className= {Styles.inputContainer}>
        <p>{label || 'Text Input'}</p>
        <input type="text" placeholder={label}  />  
    </div>
  )
}
