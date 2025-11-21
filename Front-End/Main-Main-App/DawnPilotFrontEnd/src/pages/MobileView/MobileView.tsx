import 'aframe';
import 'aframe-particle-system-component';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import { useScenarioWorld } from '../../hooks/useScenarioWorld';
import { useEffect, useRef, useState } from 'react';
import { useComponentManager } from '../../hooks/useComponentManager';
import { useFrameBuffer } from '../../hooks/useFrameBuffer';
import { useCameraSync } from '../../hooks/useCameraSync';
import { SOCKET_URL } from '../../config/api';

function MobileView() {
  const cameraRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const hasReceivedPosition = useRef(false);
  const targetPosition = useRef({ x: 0, y: 1.6, z: 4 });
  const currentPosition = useRef({ x: 0, y: 1.6, z: 4 });
  const animationFrameRef = useRef<number | null>(null);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 1.6, z: 4 });
  const [showCertWarning, setShowCertWarning] = useState(false);
  
  // WebSocket camera synchronization - mobile follows desktop
  const { isConnected, remoteCamera } = useCameraSync({
    clientType: 'mobile',
    enableDeviceMotion: true,
    throttleMs: 16  // 60fps
  });
  
  // Movement state for rocker control (reserved for future use)
  // const movementVelocityRef = useRef({ x: 0, z: 0 });
  
  // Check if certificate needs to be accepted
  useEffect(() => {
    if (!isConnected) {
      const timer = setTimeout(() => {
        setShowCertWarning(true);
      }, 3000); // Show warning after 3 seconds of failed connection
      return () => clearTimeout(timer);
    } else {
      setShowCertWarning(false);
    }
  }, [isConnected]);
  
  // Enable buffer debugging (only in development)
  useFrameBuffer({
    logInterval: 1000,      // Log every second
    logPixelData: true,
    downsamplePercentage: 50
  });

  const {
    world,
    loadWorld,
  } = useScenarioWorld();

  const {
    clearAllTimers
  } = useComponentManager();

  useEffect(() => {
    loadWorld()
      .then(data => {
        console.log('Mobile - World loaded, entities:', data.entities.length, data.entities);
      })
      .catch(err => {
        console.error('Failed to load world:', err);
        alert('Error loading world. Make sure backend is running.');
      });

    // Cleanup on unmount
    return () => {
      clearAllTimers();
    };
  }, [loadWorld, clearAllTimers]);
  
  // Mobile follows desktop camera position - smooth interpolation
  useEffect(() => {
    if (!remoteCamera) {
      return;
    }

    // Mark that we've received position
    hasReceivedPosition.current = true;
    
    // Update target position
    targetPosition.current = { ...remoteCamera.position };
    
    // Update local state for UI
    setCameraPosition(remoteCamera.position);
  }, [remoteCamera]);

  // Smooth animation loop for camera position interpolation
  useEffect(() => {
    const animate = () => {
      if (!cameraRef.current?.el) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const cameraEl = cameraRef.current.el;
      const object3D = cameraEl.object3D;
      
      if (object3D && hasReceivedPosition.current) {
        // Smooth interpolation (lerp) - 30% towards target each frame for responsive feel
        const lerpFactor = 0.3;
        currentPosition.current.x += (targetPosition.current.x - currentPosition.current.x) * lerpFactor;
        currentPosition.current.y += (targetPosition.current.y - currentPosition.current.y) * lerpFactor;
        currentPosition.current.z += (targetPosition.current.z - currentPosition.current.z) * lerpFactor;
        
        // Apply to Three.js object3D directly (doesn't interfere with look-controls)
        object3D.position.set(
          currentPosition.current.x,
          currentPosition.current.y,
          currentPosition.current.z
        );
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Initialize camera position on mount
  useEffect(() => {
    if (cameraRef.current?.el && !hasReceivedPosition.current) {
      // Set initial position only if we haven't received desktop position yet
      cameraRef.current.el.setAttribute('position', { x: 0, y: 1.6, z: 4 });
    }
  }, []);

  return (
    
    <div style={{ background: "Black", width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* Force VR button to be visible without scrolling */}
      <style>{`
        .a-enter-vr-button {
          bottom: 20% !important;
          position: fixed !important;
          z-index: 99999 !important;
        }
        body {
          overflow: hidden !important;
        }
      `}</style>

      {/* Certificate Warning Modal */}
      {showCertWarning && !isConnected && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#1e1e1e',
            color: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '400px',
            border: '2px solid #f44336'
          }}>
            <h2 style={{ margin: '0 0 16px 0', color: '#f44336' }}>🔒 SSL Certificate Required</h2>
            <p style={{ margin: '0 0 16px 0', lineHeight: '1.5' }}>
              The backend uses a self-signed HTTPS certificate. You need to accept it first.
            </p>
            <ol style={{ margin: '0 0 16px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li>Click the button below to open the backend</li>
              <li>Accept the security warning (click "Advanced" → "Proceed")</li>
              <li>Return here and refresh the page</li>
            </ol>
            <a 
              href={SOCKET_URL + '/health'} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{
                display: 'block',
                background: '#4CAF50',
                color: 'white',
                padding: '12px',
                textAlign: 'center',
                textDecoration: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
                marginBottom: '8px'
              }}
            >
              Open Backend & Accept Certificate
            </a>
            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%',
                background: '#2196F3',
                color: 'white',
                padding: '12px',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              ↻ Refresh Page
            </button>
          </div>
        </div>
      )}
      
      {/* WebSocket Connection Status */}
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        background: isConnected ? '#4CAF50' : '#f44336',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.8 }}>
          {SOCKET_URL}
        </div>
      </div>
      
      {/* Mobile Mode Status */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        background: '#2196F3',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        📱 Mobile Viewer (Following Desktop)
      </div>
      
      {/* Camera Position Display */}
      <div style={{
        position: 'absolute',
        top: 50,
        right: 10,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '8px',
        borderRadius: '4px',
        fontSize: '10px',
        fontFamily: 'monospace'
      }}>
        <div>X: {cameraPosition.x.toFixed(2)}</div>
        <div>Y: {cameraPosition.y.toFixed(2)}</div>
        <div>Z: {cameraPosition.z.toFixed(2)}</div>
      </div>
      
      <Scene
        embedded
        vr-mode-ui="enabled: true"
        device-orientation-permission-ui="enabled: true"
        fog="type: linear; color: #111; near: 50; far: 200"
        style={{ width: "100%", height: "100%" }}
      >
        {/* Sky background */}
        <Entity primitive="a-sky" color="#87CEEB" />
        
        <Entity light={{ type: "ambient", color: "#ffffff", intensity: 0.8 }} />
        <Entity
          light={{ type: "directional", color: "#ffffff", intensity: 1.0 }}
          position="5 10 2"
        />
        <Entity
          light={{ type: "directional", color: "#ffffff", intensity: 0.9 }}
          position="0 2 -6"
        />

        {/* Ground plane with grid pattern for movement visualization */}
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

            console.log("Rendering entity:", e);
            console.log("Rendering url:", url);

            if (url === "Aframe") {
              const tag = `a-${e.name.toLowerCase()}`; // e.g. Sphere -> a-sphere
              console.log("Rendering primitive tag:", tag);
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

            // GLTF Model entity
            console.log("Rendering GLTF model:", url);
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

        {/* Camera syncs with desktop position */}
        <Entity
          ref={cameraRef}
          primitive="a-camera"
          look-controls="enabled: true; touchEnabled: true; magicWindowTrackingEnabled: true; pointerLockEnabled: false"
        >
          {/* VR cursor for interaction */}
          <Entity
            primitive="a-cursor"
            animation__click="property: scale; startEvents: click; from: 0.1 0.1 0.1; to: 1 1 1; dur: 150"
            material="color: white; shader: flat"
          />
        </Entity>
      </Scene>
    </div>
  );
}

export default MobileView;