/**
 * Custom A-Frame component to sync position from desktop in VR mode
 * This bypasses A-Frame's VR camera position locking
 */

import { registerComponent } from 'aframe';

registerComponent('vr-position-sync', {
  schema: {
    enabled: { type: 'boolean', default: true }
  },

  init() {
    this.syncPosition = { x: 0, y: 1.6, z: 4 };
    this.applyPosition = this.applyPosition.bind(this);
  },

  tick() {
    if (this.data.enabled) {
      this.applyPosition();
    }
  },

  applyPosition() {
    // Get the camera rig (if in VR mode) or the camera itself
    const el = this.el;
    const isVRMode = el.sceneEl?.is('vr-mode');
    
    if (isVRMode) {
      // In VR mode, we need to offset the entire scene instead of moving the camera
      // This creates the illusion of movement while keeping the VR camera stable
      const dolly = el.parentElement;
      if (dolly && dolly.object3D) {
        dolly.object3D.position.set(
          this.syncPosition.x,
          this.syncPosition.y,
          this.syncPosition.z
        );
      }
    } else {
      // Normal mode: just set camera position
      el.object3D.position.set(
        this.syncPosition.x,
        this.syncPosition.y,
        this.syncPosition.z
      );
    }
  },

  setPosition(x: number, y: number, z: number) {
    this.syncPosition.x = x;
    this.syncPosition.y = y;
    this.syncPosition.z = z;
  }
});
