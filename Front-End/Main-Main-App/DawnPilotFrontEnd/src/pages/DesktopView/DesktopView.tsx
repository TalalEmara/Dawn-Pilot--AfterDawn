import 'aframe';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import { useEffect, useRef } from 'react';
import { useScenarioWorld } from '../../hooks/useScenarioWorld';
import { useCameraSync } from '../../hooks/useCameraSync';

function DesktopViewer() {
  const cameraRef = useRef<any>(null);

  const { isConnected, updateCamera } = useCameraSync({
    clientType: 'desktop',
    throttleMs: 16 // ~60fps
  });

  const { world, loadWorld } = useScenarioWorld();

  useEffect(() => {
    loadWorld().catch(err => {
      console.error('Desktop - Failed to load world:', err);
    });
  }, [loadWorld]);

  // Desktop broadcasts camera to mobile
  useEffect(() => {
    const broadcastCamera = () => {
      const el = cameraRef.current?.el;
      if (el) {
        const position = el.getAttribute('position');
        const rotation = el.getAttribute('rotation');

        if (position && rotation) {
          updateCamera({
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z }
          });
        }
      }
      requestAnimationFrame(broadcastCamera);
    };

    const animationId = requestAnimationFrame(broadcastCamera);
    return () => cancelAnimationFrame(animationId);
  }, [updateCamera]);

  return (
    <div style={{ background: 'black', width: '100vw', height: '100vh' }}>
      {/* WebSocket Connection Status */}
      <div
        style={{
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
        }}
      >
        {isConnected ? '🖥️ Desktop Control (Broadcasting)' : '🔴 Waiting for connection...'}
      </div>

      {/* Instructions (WASD only) */}
      <div
        style={{
          position: 'absolute',
          top: 50,
          left: 10,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'monospace',
          maxWidth: '250px'
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Controls:</div>
        <div>• WASD - Move</div>
        <div style={{ marginTop: '6px', fontWeight: 'bold' }}>Mobile:</div>
        <div>• Follows desktop camera</div>
        <div>• Gyroscope - Look around in VR</div>
      </div>

      <Scene
        embedded
        vr-mode-ui="enabled: false"
        fog="type: linear; color: #111; near: 50; far: 200"
        style={{ width: '100%', height: '100%' }}
      >
        {/* Sky */}
        <Entity primitive="a-sky" color="#87CEEB" />

        {/* Lights */}
        <Entity light={{ type: 'ambient', color: '#ffffff', intensity: 0.6 }} />
        <Entity
          light={{ type: 'directional', color: '#ffffff', intensity: 0.9 }}
          position="0 2 -6"
        />

        {/* Ground */}
        <Entity
          primitive="a-plane"
          position="0 -1 -4"
          rotation="-90 0 0"
          width="1000"
          height="1000"
          color="#2a5a2a"
          material="src: url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDEwIDAgTCAwIDAgMCAxMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMWE0YTFhIiBzdHJva2Utd2lkdGg9IjAuNSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=); repeat: 100 100"
        />

        {/* Entities from backend */}
        {world.entities.map((e) => {
          const pos = e.Position || { x: 0, y: 0, z: 0 };
          const rot = e.Rotation || { x: 0, y: 0, z: 0 };
          const scl = e.Scale || { x: 1, y: 1, z: 1 };
          const color = e.Color?.value || '#fff';
          const url = e.Model?.url;

          if (url === 'Aframe') {
            const tag = `a-${e.name.toLowerCase()}`;
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

        {/* Camera: WASD only, no mouse look */}
        <Entity
          ref={cameraRef}
          primitive="a-camera"
          look-controls="enabled: false"
          wasd-controls="enabled: true; acceleration: 65"
        />
      </Scene>
    </div>
  );
}

export default DesktopViewer;
