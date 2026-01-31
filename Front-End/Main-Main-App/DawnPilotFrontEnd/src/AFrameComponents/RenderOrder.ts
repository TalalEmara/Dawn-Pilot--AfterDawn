AFRAME.registerComponent('render-order', {
  schema: { type: 'number', default: 0 },
  init: function () {
    // Traverse the mesh to ensure all parts (children) get the order
    this.el.object3D.traverse((node) => {
      if ((node as any).isMesh) {
        node.renderOrder = this.data;
      }
    });
    // Set on the root object as well
    this.el.object3D.renderOrder = this.data;
  }
});