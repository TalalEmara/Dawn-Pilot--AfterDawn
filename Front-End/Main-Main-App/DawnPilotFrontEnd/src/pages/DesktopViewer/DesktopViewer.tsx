import 'aframe';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import { useScenarioWorld } from '../../hooks/useScenarioWorld';
import { useEffect, useRef, useState } from 'react';
import { useCameraSync } from '../../hooks/useCameraSync';

function DesktopViewer() {
  const cameraRef = useRef<any>(null);
  const [controllerStatus, setControllerStatus] = useState<string>('WASD or VR Controller');
  
  // WebSocket camera synchronization - desktop broadcasts to mobile
  const { isConnected, updateCamera } = useCameraSync({
    clientType: 'desktop',
    enableDeviceMotion: false,
    throttleMs: 16  // 60fps
  });
  
  const { world, loadWorld } = useScenarioWorld();

  useEffect(() => {
    loadWorld()
      .then(data => {
        console.log('Desktop - World loaded, entities:', data.entities.length, data.entities);
      })
      .catch(err => {
        console.error('Desktop - Failed to load world:', err);
      });
  }, [loadWorld]);
  
  // Desktop broadcasts camera to mobile
  useEffect(() => {
    let frameCount = 0;
    
    const broadcastCamera = () => {
      if (cameraRef.current?.el) {
        const el = cameraRef.current.el;
        const position = el.getAttribute('position');
        const rotation = el.getAttribute('rotation');
        
        if (position && rotation) {
          // Always send position - mobile will interpolate smoothly
          updateCamera({
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z }
          });
          
          // Log every 2 seconds (120 frames at 60fps)
          frameCount++;
          if (frameCount % 120 === 0) {
            console.log('📡 Desktop broadcasting:', {
              pos: `(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`,
              connected: isConnected
            });
          }
        }
      }
      
      requestAnimationFrame(broadcastCamera);
    };
    
    const animationId = requestAnimationFrame(broadcastCamera);
    
    return () => cancelAnimationFrame(animationId);
  }, [updateCamera, isConnected]);
  
  // VR Controller support (Gamepad API) - uses actual gamepad axes with smoothing
  useEffect(() => {
    if (!cameraRef.current?.el) return;

    const el = cameraRef.current.el;
    const moveSpeed = 0.15; // Speed per frame when rocker is held
    const deadzone = 0.3;   // Ignore small axis movements
    const smoothing = 0.85; // Velocity decay for smooth stop (like WASD)
    let animationFrameId: number;
    let gamepadIndex: number | null = null;
    
    // Persistent velocity for smoothing
    let velocityX = 0;
    let velocityZ = 0;
    
    // Detect gamepad connection
    const onGamepadConnected = (e: GamepadEvent) => {
      console.log(`🎮 Gamepad connected: ${e.gamepad.id} (index ${e.gamepad.index})`);
      gamepadIndex = e.gamepad.index;
      setControllerStatus('✅ VR Controller Connected');
    };
    
    const onGamepadDisconnected = (e: GamepadEvent) => {
      console.log(`🎮 Gamepad disconnected: ${e.gamepad.id}`);
      if (e.gamepad.index === gamepadIndex) {
        gamepadIndex = null;
        setControllerStatus('❌ VR Controller Disconnected');
      }
    };
    
    window.addEventListener('gamepadconnected', onGamepadConnected);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
    
    // Check for already connected gamepad
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        console.log(`🎮 Found existing gamepad: ${gamepads[i]?.id} (index ${i})`);
        gamepadIndex = i;
        setControllerStatus('✅ VR Controller Ready');
        break;
      }
    }
    
    const updateMovement = () => {
      let targetVelocityX = 0;
      let targetVelocityZ = 0;
      let direction = '';
      
      if (gamepadIndex !== null) {
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[gamepadIndex];
        
        if (gamepad && gamepad.axes.length >= 2) {
          const axis0 = gamepad.axes[0]; // Horizontal: -1 (left) to +1 (right)
          const axis1 = gamepad.axes[1]; // Vertical: -1 (up) to +1 (down)
          
          const currentRot = el.getAttribute('rotation');
          const yaw = (currentRot.y * Math.PI) / 180;
          
          // Forward/Backward (Axis1)
          if (axis1 < -deadzone) {
            // Up = Forward
            const speed = Math.abs(axis1) * moveSpeed;
            targetVelocityX += Math.sin(yaw) * speed;
            targetVelocityZ += Math.cos(yaw) * speed;
            direction = '↑ Forward';
          } else if (axis1 > deadzone) {
            // Down = Backward
            const speed = Math.abs(axis1) * moveSpeed;
            targetVelocityX -= Math.sin(yaw) * speed;
            targetVelocityZ -= Math.cos(yaw) * speed;
            direction = '↓ Backward';
          }
          
          // Left/Right strafe (Axis0)
          if (axis0 < -deadzone) {
            // Left
            const speed = Math.abs(axis0) * moveSpeed;
            targetVelocityX -= Math.cos(yaw) * speed;
            targetVelocityZ += Math.sin(yaw) * speed;
            direction = direction ? direction + ' + ← Left' : '← Left';
          } else if (axis0 > deadzone) {
            // Right
            const speed = Math.abs(axis0) * moveSpeed;
            targetVelocityX += Math.cos(yaw) * speed;
            targetVelocityZ -= Math.sin(yaw) * speed;
            direction = direction ? direction + ' + → Right' : '→ Right';
          }
        }
      }
      
      // Smooth acceleration towards target velocity (like WASD physics)
      velocityX = velocityX * smoothing + targetVelocityX * (1 - smoothing);
      velocityZ = velocityZ * smoothing + targetVelocityZ * (1 - smoothing);
      
      // Stop completely if velocity is very small
      if (Math.abs(velocityX) < 0.001) velocityX = 0;
      if (Math.abs(velocityZ) < 0.001) velocityZ = 0;
      
      // Apply movement
      if (Math.abs(velocityX) > 0.001 || Math.abs(velocityZ) > 0.001) {
        const currentPos = el.getAttribute('position');
        currentPos.x += velocityX;
        currentPos.z += velocityZ;
        el.setAttribute('position', currentPos);
        
        if (direction) {
          setControllerStatus(`🎮 ${direction}`);
        } else {
          // Still coasting to stop
          setControllerStatus('🎮 Coasting...');
        }
      } else {
        setControllerStatus('🎮 Gamepad Ready');
      }
      
      animationFrameId = requestAnimationFrame(updateMovement);
    };
    
    animationFrameId = requestAnimationFrame(updateMovement);
    
    return () => {
      window.removeEventListener('gamepadconnected', onGamepadConnected);
      window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div style={{ background: "Black", width: "100vw", height: "100vh" }}>
      {/* WebSocket Connection Status */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        background: isConnected ? '#4CAF50' : '#f44336',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '4px',
        fontSize: '14px',
        fontFamily: 'Arial, sans-serif'
      }}>
        {isConnected ? '🖥️ Desktop Control (Broadcasting)' : '🔴 Waiting for connection...'}
      </div>
      
      {/* Controller Status */}
      <div style={{
        position: 'absolute',
        top: 50,
        left: 10,
        zIndex: 1000,
        background: controllerStatus.includes('✅') ? '#4CAF50' : '#2196F3',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        {controllerStatus}
      </div>
      
      {/* Instructions */}
      <div style={{
        position: 'absolute',
        top: 90,
        left: 10,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '12px',
        borderRadius: '4px',
        fontSize: '11px',
        fontFamily: 'monospace',
        maxWidth: '250px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Controls:</div>
        <div>• WASD - Move</div>
        <div>• VR Gamepad - Move directly</div>
        <div style={{ marginTop: '6px', fontSize: '10px', opacity: 0.7 }}>
          Rocker: ↑Forward, ↓Back, ←Left, →Right
        </div>
        <div style={{ marginTop: '6px', fontWeight: 'bold' }}>Mobile:</div>
        <div>• Follows desktop camera</div>
        <div>• Gyroscope - Look around in VR</div>
      </div>
      
      {/* Mobile Camera Info - removed since desktop is in control */}
      
      <Scene
        embedded
        vr-mode-ui="enabled: false"
        fog="type: linear; color: #111; near: 50; far: 200"
        style={{ width: "100%", height: "100%" }}
      >
        {/* Sky background */}
        <Entity primitive="a-sky" color="#87CEEB" />
        
        <Entity light={{ type: "ambient", color: "#ffffff", intensity: 0.6 }} />
        <Entity
          light={{ type: "directional", color: "#ffffff", intensity: 0.9 }}
          position="0 2 -6"
        />

        {/* Ground plane with grid pattern */}
        <Entity
          primitive="a-plane"
          position="0 -1 -4"
          rotation="-90 0 0"
          width="1000"
          height="1000"
          color="#2a5a2a"
          material="src: url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDEwIDAgTCAwIDAgMCAxMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMWE0YTFhIiBzdHJva2Utd2lkdGg9IjAuNSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=); repeat: 100 100"
        />

        {/* Render entities from backend */}
        {world.entities.map((e) => {
          const pos = e.Position || { x: 0, y: 0, z: 0 };
          const rot = e.Rotation || { x: 0, y: 0, z: 0 };
          const scl = e.Scale || { x: 1, y: 1, z: 1 };
          const color = e.Color?.value || "#fff";
          const url = e.Model?.url;

          console.log("Desktop - Rendering entity:", e.name, "at", pos, "url:", url);

          if (url === "Aframe") {
            const tag = `a-${e.name.toLowerCase()}`;
            console.log("Desktop - Rendering primitive:", tag);
            return (
              <Entity
                key={e.id}
                primitive={tag}
                position={`${pos.x} ${pos.y} ${pos.z}`}
                rotation={`${rot.x} ${rot.y} ${rot.z}`}
                scale={`${scl.x} ${scl.y} ${scl.z}`}
                material={`color: ${color}`}
              />
            );
          }

          console.log("Desktop - Rendering GLTF model:", url);
          return (
            <Entity
              key={e.id}
              gltf-model={url}
              position={`${pos.x} ${pos.y} ${pos.z}`}
              rotation={`${rot.x} ${rot.y} ${rot.z}`}
              scale={`${scl.x} ${scl.y} ${scl.z}`}
            />
          );
        })}

        {/* Camera synced with mobile but with desktop controls */}
        <Entity
          ref={cameraRef}
          primitive="a-camera"
          look-controls="enabled: true; pointerLockEnabled: false"
          wasd-controls="enabled: true; acceleration: 65"
        />
      </Scene>
    </div>
  );
}

export default DesktopViewer;
