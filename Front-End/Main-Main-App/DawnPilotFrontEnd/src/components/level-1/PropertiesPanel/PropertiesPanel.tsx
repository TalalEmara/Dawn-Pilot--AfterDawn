import React, { Component } from 'react'
import styles from './PropertiesPanel.module.css'
import ComponentInput from '../../level-0/ComponentInput/ComponentInput'
function PropertiesPanel() {
  return (
    <div className={styles.panelContainer}>
        <p>PropertiesPanel</p>
        <ComponentInput type='Vector3'/>
        <ComponentInput type='Vector3'/>
        <ComponentInput type='String' label='Color'/>
    </div>
  )
}

export default PropertiesPanel