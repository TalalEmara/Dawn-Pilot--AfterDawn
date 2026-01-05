import "aframe";

// Access THREE from global
const THREE = (window as any).AFRAME.THREE;

interface CollisionDetector {
  data: {
    targetSelector: string;
    cooldown: number;
  };
  playerBox: any;
  obstacleBox: any;
  lastCollisionTime: number;
  obstacles: any[];
  interval: number;
  updateObstacles: () => void;
  el: any;
  
  // Physics State
  lastSafePosition: any; 
  mover: any;            
  checkCollision: (pos: any) => boolean;
}

if (typeof AFRAME !== "undefined" && !AFRAME.components["collision-detector"]) {
  AFRAME.registerComponent("collision-detector", {
    schema: {
      targetSelector: { type: "string", default: ".collidable" },
      cooldown: { type: "number", default: 1000 },
    },

    init: function (this: CollisionDetector) {
      this.playerBox = new THREE.Box3();
      this.obstacleBox = new THREE.Box3();
      this.lastCollisionTime = 0;
      this.obstacles = [];

      // --- FIX START: Smarter Mover Detection ---
      // If this element has movement controls, it IS the mover.
      // Otherwise, fallback to the parent (old behavior).
      if (this.el.getAttribute("wasd-controls") || this.el.getAttribute("vr-movement-controls")) {
        this.mover = this.el.object3D;
      } else {
        this.mover = this.el.parentEl ? this.el.parentEl.object3D : this.el.object3D;
      }
      // --- FIX END ---

      // 2. Initialize Safe Position
      this.lastSafePosition = new THREE.Vector3();
      this.lastSafePosition.copy(this.mover.position);

      this.updateObstacles = this.updateObstacles.bind(this);
      this.interval = window.setInterval(this.updateObstacles, 2000);
      this.updateObstacles();
    },

    remove: function (this: CollisionDetector) {
      if (this.interval) clearInterval(this.interval);
    },

    updateObstacles: function (this: CollisionDetector) {
      if (!this.data) return;
      const els = document.querySelectorAll(this.data.targetSelector);
      this.obstacles = Array.from(els).map((el) => (el as any).object3D);
    },

    checkCollision: function (this: CollisionDetector, pos: any) {
      const buffer = 0.1; 
      const w = 0.3 + buffer; 
      const d = 0.3 + buffer; 
      
      const x = pos.x;
      const y = pos.y - 0.8; 
      const z = pos.z;

      this.playerBox.min.set(x - w, y - 0.8, z - d);
      this.playerBox.max.set(x + w, y + 0.8, z + d);

      for (const obstacle of this.obstacles) {
        if (!obstacle) continue;
        this.obstacleBox.setFromObject(obstacle);
        if (this.playerBox.intersectsBox(this.obstacleBox)) {
          return true; 
        }
      }
      return false;
    },

    tick: function (this: CollisionDetector) {
      const currentPos = this.mover.position.clone();
      const delta = currentPos.clone().sub(this.lastSafePosition);

      if (delta.lengthSq() < 0.000001) return;

      let hitOccurred = false;

      const testX = this.lastSafePosition.clone();
      testX.x += delta.x;
      
      let safeX = delta.x;
      if (this.checkCollision(testX)) {
        safeX = 0; 
        hitOccurred = true;
      }

      const testZ = this.lastSafePosition.clone();
      testZ.z += delta.z;
      
      let safeZ = delta.z;
      if (this.checkCollision(testZ)) {
        safeZ = 0; 
        hitOccurred = true;
      }

      const finalPos = this.lastSafePosition.clone();
      finalPos.x += safeX;
      finalPos.z += safeZ;
      finalPos.y = currentPos.y; 

      if (hitOccurred || (safeX !== 0 && safeZ !== 0)) {
         if (this.checkCollision(finalPos)) {
             finalPos.copy(this.lastSafePosition);
             hitOccurred = true;
         }
      }

      this.mover.position.copy(finalPos);
      this.lastSafePosition.copy(finalPos);

      const now = Date.now();
      if (hitOccurred && (now - this.lastCollisionTime > this.data.cooldown)) {
        this.lastCollisionTime = now;
        
        let obstacleId = "unknown";
        for(const obs of this.obstacles) {
           this.obstacleBox.setFromObject(obs);
           if(this.playerBox.intersectsBox(this.obstacleBox)) {
               obstacleId = (obs as any).el.id; 
               break;
           }
        }

        console.warn(`💥 Collision! Sliding along ${obstacleId}`);
        this.el.emit("collision", {
          obstacleId: obstacleId,
          timestamp: now,
        });
      }
    },
  });
}