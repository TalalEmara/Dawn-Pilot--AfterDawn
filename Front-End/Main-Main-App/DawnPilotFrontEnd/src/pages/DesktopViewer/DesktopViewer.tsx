import 'aframe';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import { useScenarioWorld } from '../../hooks/useScenarioWorld';
import { useEffect, useState, useRef } from 'react';
import { useCameraSync } from '../../hooks/useCameraSync';

function DesktopViewer() {
  const cameraRef = useRef<any>(null);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 1.6, z: 4 });
  const [cameraRotation, setCameraRotation] = useState({ x: 0, y: 0, z: 0 });
  const [syncMode, setSyncMode] = useState(true); // Toggle between sync and manual control
  const lastKeyPressRef = useRef(0);
  
  // WebSocket camera synchronization (desktop broadcasts its camera)
  const { isConnected, remoteCamera, updateCamera } = useCameraSync({
    clientType: 'desktop',
    enableDeviceMotion: false
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
  
  // Sync logic: In sync mode, follow mobile. In manual mode, broadcast desktop position
  useEffect(() => {
    if (syncMode && remoteCamera && cameraRef.current?.el) {
      // SYNC MODE: Desktop follows mobile
      const el = cameraRef.current.el;
      el.object3D.position.set(
        remoteCamera.position.x,
        remoteCamera.position.y,
        remoteCamera.position.z
      );
      el.object3D.rotation.set(
        (remoteCamera.rotation.x * Math.PI) / 180,
        (remoteCamera.rotation.y * Math.PI) / 180,
        (remoteCamera.rotation.z * Math.PI) / 180
      );
      console.log('🖥️ Desktop following mobile:', remoteCamera.position);
    }
  }, [remoteCamera, syncMode]);
  
  // In manual mode, broadcast desktop camera to mobile
  useEffect(() => {
    if (syncMode) return; // Don't broadcast in sync mode
    
    const interval = setInterval(() => {
      if (cameraRef.current?.el) {
        const el = cameraRef.current.el;
        if (el && el.getAttribute) {
          const position = el.getAttribute('position');
          const rotation = el.getAttribute('rotation');
          
          if (position && rotation) {
            updateCamera({
              position: { x: position.x, y: position.y, z: position.z },
              rotation: { x: rotation.x, y: rotation.y, z: rotation.z }
            });
          }
        }
      }
    }, 50); // Broadcast at 20fps

    return () => clearInterval(interval);
  }, [updateCamera, syncMode]);
  
  // Keyboard controls detection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        lastKeyPressRef.current = Date.now();
        setSyncMode(false); // Disable sync when manually controlling
      }
    };
    
    // Check periodically if we should re-enable sync
    const syncCheckInterval = setInterval(() => {
      const timeSinceLastKey = Date.now() - lastKeyPressRef.current;
      if (!syncMode && timeSinceLastKey > 2000) {
        console.log('⏱️ Re-enabling auto-sync after 2s of no input');
        setSyncMode(true);
      }
    }, 500); // Check every 500ms
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearInterval(syncCheckInterval);
    };
  }, [syncMode]);

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
        {isConnected ? '🟢 Synced with Mobile' : '🔴 Waiting for Mobile...'}
        {syncMode && <div style={{ fontSize: '10px', marginTop: '4px' }}>Auto-Sync ON</div>}
        {!syncMode && <div style={{ fontSize: '10px', marginTop: '4px' }}>Manual Control</div>}
      </div>
      
      {/* Camera Position Display */}
      <div style={{
        position: 'absolute',
        top: 50,
        left: 10,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '12px',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Mobile Camera:</div>
        <div>Position: ({cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)}, {cameraPosition.z.toFixed(2)})</div>
        <div>Rotation: ({cameraRotation.x.toFixed(0)}°, {cameraRotation.y.toFixed(0)}°, {cameraRotation.z.toFixed(0)}°)</div>
      </div>
      
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
