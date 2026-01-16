import "aframe";

// ============== DEBUG CONTROL ==============
const DEBUG_COLLISION = false; // <-- SET TO true TO ENABLE DEBUG LOGS
// ===========================================

const log = (...args: any[]) => DEBUG_COLLISION && console.log('[Collision]', ...args);
const warn = (...args: any[]) => DEBUG_COLLISION && console.warn('[Collision]', ...args);
const error = (...args: any[]) => DEBUG_COLLISION && console.error('[Collision]', ...args);

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
  tickCount: number;
  
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
      log('========== INIT START ==========');
      log('Element:', this.el.tagName, this.el.id || '(no id)');
      
      this.playerBox = new THREE.Box3();
      this.obstacleBox = new THREE.Box3();
      this.lastCollisionTime = 0;
      this.obstacles = [];
      this.tickCount = 0;

      // --- Mover Detection ---
      const hasWasd = this.el.getAttribute("wasd-controls");
      const hasVrMovement = this.el.getAttribute("vr-movement-controls");
      log('Has wasd-controls:', !!hasWasd);
      log('Has vr-movement-controls:', !!hasVrMovement);
      
      if (hasWasd || hasVrMovement) {
        this.mover = this.el.object3D;
        log('Mover = self (this.el.object3D)');
      } else {
        this.mover = this.el.parentEl ? this.el.parentEl.object3D : this.el.object3D;
        log('Mover = parent or self:', this.el.parentEl ? 'parent' : 'self');
      }

      // 2. Initialize Safe Position
      this.lastSafePosition = new THREE.Vector3();
      const initialPos = this.mover.position.clone();
      this.lastSafePosition.copy(initialPos);
      
      log('Initial mover position:', initialPos.x.toFixed(2), initialPos.y.toFixed(2), initialPos.z.toFixed(2));
      log('lastSafePosition set to:', this.lastSafePosition.x.toFixed(2), this.lastSafePosition.y.toFixed(2), this.lastSafePosition.z.toFixed(2));
      log('Is position at origin?', initialPos.length() < 0.1 ? 'YES ⚠️' : 'NO ✅');

      this.updateObstacles = this.updateObstacles.bind(this);
      this.interval = window.setInterval(this.updateObstacles, 2000);
      this.updateObstacles();
      
      log('========== INIT END ==========');
    },

    remove: function (this: CollisionDetector) {
      if (this.interval) clearInterval(this.interval);
    },

    updateObstacles: function (this: CollisionDetector) {
      if (!this.data) return;
      const els = document.querySelectorAll(this.data.targetSelector);
      this.obstacles = Array.from(els).map((el) => (el as any).object3D);
      log('Updated obstacles, count:', this.obstacles.length);
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
      this.tickCount++;
      const currentPos = this.mover.position.clone();
      
      // FIRST: Check if we're CURRENTLY inside an obstacle (WASD controls pushed us in)
      // If so, immediately push back to last safe position
      if (this.checkCollision(currentPos)) {
        // Check if lastSafePosition is ALSO inside an obstacle (we're stuck!)
        if (this.checkCollision(this.lastSafePosition)) {
          warn('🆘 STUCK! Both current and lastSafe are inside obstacle! Finding escape...');
          
          // Try to find escape direction by testing positions around us
          const escapeDistance = 0.5; // Push back half a meter
          const escapeDirections = [
            { x: 0, z: -escapeDistance },  // Back
            { x: 0, z: escapeDistance },   // Forward  
            { x: -escapeDistance, z: 0 },  // Left
            { x: escapeDistance, z: 0 },   // Right
            { x: -escapeDistance, z: -escapeDistance }, // Back-left
            { x: escapeDistance, z: -escapeDistance },  // Back-right
            { x: -escapeDistance, z: escapeDistance },  // Front-left
            { x: escapeDistance, z: escapeDistance },   // Front-right
          ];
          
          const testPos = currentPos.clone();
          for (const dir of escapeDirections) {
            testPos.x = currentPos.x + dir.x;
            testPos.z = currentPos.z + dir.z;
            
            if (!this.checkCollision(testPos)) {
              log('✅ Found escape at offset:', dir.x, dir.z);
              this.mover.position.x = testPos.x;
              this.mover.position.z = testPos.z;
              this.lastSafePosition.copy(testPos);
              return;
            }
          }
          
          // If no escape found, push back to origin as last resort
          error('❌ No escape found! Resetting to spawn point');
          this.mover.position.x = 0;
          this.mover.position.z = 0;
          this.lastSafePosition.set(0, currentPos.y, 0);
          return;
        }
        
        warn('🚫 Currently INSIDE obstacle! Forcing back to lastSafePosition');
        log('currentPos:', currentPos.x.toFixed(2), currentPos.y.toFixed(2), currentPos.z.toFixed(2));
        log('Pushing to:', this.lastSafePosition.x.toFixed(2), this.lastSafePosition.y.toFixed(2), this.lastSafePosition.z.toFixed(2));
        
        // Force position back, keeping Y from current
        this.mover.position.x = this.lastSafePosition.x;
        this.mover.position.z = this.lastSafePosition.z;
        
        // EMIT collision event when inside obstacle (with cooldown)
        const now = Date.now();
        if (now - this.lastCollisionTime > this.data.cooldown) {
          this.lastCollisionTime = now;
          warn('💥 COLLISION EVENT (inside obstacle)');
          this.el.emit("collision", {
            obstacleId: "inside-obstacle",
            timestamp: now,
          });
        }
        return;
      }
      
      const delta = currentPos.clone().sub(this.lastSafePosition);

      // Log every 300 ticks (~5 seconds) to reduce console spam
      if (this.tickCount % 300 === 0) {
        log('--- Tick #' + this.tickCount + ' ---');
        log('currentPos:', currentPos.x.toFixed(2), currentPos.y.toFixed(2), currentPos.z.toFixed(2));
        log('lastSafePosition:', this.lastSafePosition.x.toFixed(2), this.lastSafePosition.y.toFixed(2), this.lastSafePosition.z.toFixed(2));
        log('delta:', delta.x.toFixed(4), delta.y.toFixed(4), delta.z.toFixed(4));
        log('delta.lengthSq:', delta.lengthSq().toFixed(6));
      }

      // Increased threshold to prevent false positives from micro-movements
      // 0.0001 = ~0.1mm movement threshold
      if (delta.lengthSq() < 0.0001) return;

      let hitOccurred = false;

      const testX = this.lastSafePosition.clone();
      testX.x += delta.x;
      
      let safeX = delta.x;
      if (this.checkCollision(testX)) {
        safeX = 0; 
        hitOccurred = true;
        warn('❌ X-axis collision detected!');
      }

      const testZ = this.lastSafePosition.clone();
      testZ.z += delta.z;
      
      let safeZ = delta.z;
      if (this.checkCollision(testZ)) {
        safeZ = 0; 
        hitOccurred = true;
        warn('❌ Z-axis collision detected!');
      }

      const finalPos = this.lastSafePosition.clone();
      finalPos.x += safeX;
      finalPos.z += safeZ;
      finalPos.y = currentPos.y; 

      if (hitOccurred || (safeX !== 0 && safeZ !== 0)) {
         if (this.checkCollision(finalPos)) {
             warn('❌ Diagonal collision - reverting to lastSafePosition');
             finalPos.copy(this.lastSafePosition);
             finalPos.y = currentPos.y; // Keep Y
             hitOccurred = true;
         }
      }

      // DEBUG: Check if position is being reset to origin
      if (finalPos.length() < 0.1 && currentPos.length() > 0.5) {
        error('⚠️⚠️⚠️ POSITION BEING RESET TO ORIGIN! ⚠️⚠️⚠️');
        error('currentPos was:', currentPos.x.toFixed(2), currentPos.y.toFixed(2), currentPos.z.toFixed(2));
        error('finalPos is:', finalPos.x.toFixed(2), finalPos.y.toFixed(2), finalPos.z.toFixed(2));
        error('lastSafePosition was:', this.lastSafePosition.x.toFixed(2), this.lastSafePosition.y.toFixed(2), this.lastSafePosition.z.toFixed(2));
        // Prevent the reset - keep current position
        return;
      }

      // Only update lastSafePosition if we're NOT in a collision state
      // This prevents the "fighting" effect where collision keeps updating safe pos
      if (!hitOccurred) {
        this.lastSafePosition.copy(finalPos);
      }
      
      // Always update the mover position to stop movement into obstacles
      this.mover.position.copy(finalPos);

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

        warn(`💥 COLLISION EVENT EMITTING! obstacleId: ${obstacleId}`);
        log('Emitting on element:', this.el.tagName, this.el.id || '(no id)');
        
        this.el.emit("collision", {
          obstacleId: obstacleId,
          timestamp: now,
        });
        
        log('Event emitted successfully');
      }
    },
  });
}