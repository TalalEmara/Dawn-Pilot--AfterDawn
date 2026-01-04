import "aframe";

interface VRMovementControls {
  data: {
    speed: number;
    verticalSpeed: number;
    acceleration: number;
    deadzone: number;
    heightUpButton: number;
    heightDownButton: number;
  };
  el: any;
  camera: any;
  velocity: any;
  lastButtonStates: Map<number, boolean>;
  
  applyMovement: (deltaTime: number) => void;
}

if (typeof AFRAME !== "undefined" && !AFRAME.components["vr-movement-controls"]) {
  AFRAME.registerComponent("vr-movement-controls", {
    schema: {
      speed: { type: "number", default: 5 },
      verticalSpeed: { type: "number", default: 3 },
      acceleration: { type: "number", default: 20 },
      deadzone: { type: "number", default: 0.1 },
      heightUpButton: { type: "number", default: 7 },
      heightDownButton: { type: "number", default: 6 },
    },

    init: function (this: VRMovementControls) {
      // Get camera (this component should be on the camera entity)
      this.camera = this.el.object3D;
      
      // Velocity for smooth acceleration
      this.velocity = { x: 0, y: 0, z: 0 };
      
      // Track button states to detect press events
      this.lastButtonStates = new Map();
      
      console.log("🎮 VR Movement Controls initialized");
      console.log(`   Speed: ${this.data.speed}, Vertical: ${this.data.verticalSpeed}`);
      console.log(`   Height buttons: Up=${this.data.heightUpButton}, Down=${this.data.heightDownButton}`);
    },

    applyMovement: function (this: VRMovementControls, deltaTime: number) {
      const gamepads = navigator.getGamepads();
      
      // Find first connected gamepad
      let gamepad = null;
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
          gamepad = gamepads[i];
          break;
        }
      }
      
      if (!gamepad) {
        // No gamepad, decay velocity to zero
        this.velocity.x *= 0.9;
        this.velocity.z *= 0.9;
        this.velocity.y *= 0.9;
        return;
      }
      
      // Read axes (binary -1.0, 0, 1.0)
      const strafeAxis = gamepad.axes[0] || 0;  // Left/Right
      const forwardAxis = gamepad.axes[1] || 0; // Up/Down (forward/back)
      
      // Apply deadzone
      const strafe = Math.abs(strafeAxis) > this.data.deadzone ? strafeAxis : 0;
      const forward = Math.abs(forwardAxis) > this.data.deadzone ? forwardAxis : 0;
      
      // Get camera rotation for forward direction (negated to match A-Frame's coordinate system)
      const cameraRotation = -this.camera.rotation.y;
      
      // Calculate target velocity in camera space
      // Forward/back along camera's forward direction
      // Strafe perpendicular to camera's forward direction
      const targetVelX = (strafe * Math.cos(cameraRotation) - forward * Math.sin(cameraRotation)) * this.data.speed;
      const targetVelZ = (strafe * Math.sin(cameraRotation) + forward * Math.cos(cameraRotation)) * this.data.speed;
      
      // Smooth acceleration (important for binary input to feel good)
      const accel = this.data.acceleration * deltaTime;
      this.velocity.x += (targetVelX - this.velocity.x) * Math.min(accel, 1);
      this.velocity.z += (targetVelZ - this.velocity.z) * Math.min(accel, 1);
      
      // Height control (buttons 6 and 7)
      const heightUpBtn = gamepad.buttons[this.data.heightUpButton];
      const heightDownBtn = gamepad.buttons[this.data.heightDownButton];
      
      let verticalInput = 0;
      if (heightUpBtn && heightUpBtn.pressed) {
        verticalInput = 1;
      }
      if (heightDownBtn && heightDownBtn.pressed) {
        verticalInput = -1;
      }
      
      // Smooth vertical movement
      const targetVelY = verticalInput * this.data.verticalSpeed;
      this.velocity.y += (targetVelY - this.velocity.y) * Math.min(accel, 1);
      
      // Apply velocity to position
      this.camera.position.x += this.velocity.x * deltaTime;
      this.camera.position.y += this.velocity.y * deltaTime;
      this.camera.position.z += this.velocity.z * deltaTime;
      
      // Log button presses (for debugging)
      const heightUpPressed = heightUpBtn?.pressed || false;
      const heightDownPressed = heightDownBtn?.pressed || false;
      
      if (heightUpPressed && !this.lastButtonStates.get(this.data.heightUpButton)) {
        console.log("🔼 Height UP (Button 7)");
      }
      if (heightDownPressed && !this.lastButtonStates.get(this.data.heightDownButton)) {
        console.log("🔽 Height DOWN (Button 6)");
      }
      
      this.lastButtonStates.set(this.data.heightUpButton, heightUpPressed);
      this.lastButtonStates.set(this.data.heightDownButton, heightDownPressed);
    },

    tick: function (this: VRMovementControls, time: number, timeDelta: number) {
      const deltaTime = timeDelta / 1000; // Convert to seconds
      this.applyMovement(deltaTime);
    },

    remove: function (this: VRMovementControls) {
      console.log("🎮 VR Movement Controls removed");
    },
  });
}

export {};
