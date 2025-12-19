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
  lastSafePosition: any; // THREE.Vector3
  mover: any;            // The Camera object
  checkCollision: (pos: any) => boolean; // Helper function
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

      // 1. Identify the mover (Parent Camera)
      this.mover = this.el.parentEl ? this.el.parentEl.object3D : this.el.object3D;

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

    /**
     * Helper to check if a specific position would cause a collision
     */
    checkCollision: function (this: CollisionDetector, pos: any) {
      // Create a fixed-size Hitbox centered on the Player Position
      // Size: 0.6 width x 1.6 height x 0.6 depth
      // Offset: y - 0.8 (assuming camera is at eye level 1.6m)
      const buffer = 0.1; // Extra skin thickness
      const w = 0.3 + buffer; // Half-width
      const d = 0.3 + buffer; // Half-depth
      
      const x = pos.x;
      const y = pos.y - 0.8; // Center of body
      const z = pos.z;

      // Manual Box Construction (Ignoring Rotation)
      this.playerBox.min.set(x - w, y - 0.8, z - d);
      this.playerBox.max.set(x + w, y + 0.8, z + d);

      for (const obstacle of this.obstacles) {
        if (!obstacle) continue;
        this.obstacleBox.setFromObject(obstacle);
        if (this.playerBox.intersectsBox(this.obstacleBox)) {
          return true; // Hit something
        }
      }
      return false;
    },

    tick: function (this: CollisionDetector) {
      // 1. Calculate how much the controls moved us this frame
      const currentPos = this.mover.position.clone();
      const delta = currentPos.clone().sub(this.lastSafePosition);

      // If we haven't moved effectively, skip
      if (delta.lengthSq() < 0.000001) return;

      let hitOccurred = false;

      // 2. Try moving along X axis ONLY
      // We test: (OldSafe X + Delta X, OldSafe Y, OldSafe Z)
      const testX = this.lastSafePosition.clone();
      testX.x += delta.x;
      
      let safeX = delta.x;
      if (this.checkCollision(testX)) {
        safeX = 0; // X blocked! Stop X movement.
        hitOccurred = true;
      }

      // 3. Try moving along Z axis ONLY
      // We test: (OldSafe X, OldSafe Y, OldSafe Z + Delta Z)
      const testZ = this.lastSafePosition.clone();
      testZ.z += delta.z;
      
      let safeZ = delta.z;
      if (this.checkCollision(testZ)) {
        safeZ = 0; // Z blocked! Stop Z movement.
        hitOccurred = true;
      }

      // 4. Construct Final Allowed Position
      // We keep Y changes (jumping/stairs) typically, or check them too if needed
      const finalPos = this.lastSafePosition.clone();
      finalPos.x += safeX;
      finalPos.z += safeZ;
      finalPos.y = currentPos.y; 

      // 5. Final Safety Check (Corner Case)
      // Sometimes X is fine, Z is fine, but X+Z hits a diagonal corner
      if (hitOccurred || (safeX !== 0 && safeZ !== 0)) {
         if (this.checkCollision(finalPos)) {
             // Diagonal hit! Stop everything to be safe.
             finalPos.copy(this.lastSafePosition);
             hitOccurred = true;
         }
      }

      // 6. Apply Physics
      this.mover.position.copy(finalPos);
      this.lastSafePosition.copy(finalPos);

      // 7. Metric Logging
      const now = Date.now();
      if (hitOccurred && (now - this.lastCollisionTime > this.data.cooldown)) {
        this.lastCollisionTime = now;
        
        // Find ID of what we hit (just for logging, pick the first one nearby)
        // We run a quick check to find the name
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