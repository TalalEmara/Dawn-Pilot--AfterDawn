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
  const cameraRef = useRef<any>(null);
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 1.6, z: 4 });
  const [cameraRotation, setCameraRotation] = useState({ x: 0, y: 0, z: 0 });
  const [showCertWarning, setShowCertWarning] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [totalDistance, setTotalDistance] = useState(0);
  const [movementTrail, setMovementTrail] = useState<Array<{x: number, y: number, z: number}>>([]);
  const startPositionRef = useRef({ x: 0, y: 1.6, z: 4 }); // Standard VR eye height
  const deviceHeadingRef = useRef(0); // Device compass heading in degrees
  
  // WebSocket camera synchronization
  const { isConnected, remoteCamera, updateCamera } = useCameraSync({
    clientType: 'mobile',
    enableDeviceMotion: true,
    throttleMs: 50  // Update every 50ms max
  });
  
  // Track when we last received desktop camera update
  const lastDesktopUpdateRef = useRef(0);
  const [followDesktop, setFollowDesktop] = useState(false);
  
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
  
  // Follow desktop camera when it's active
  useEffect(() => {
    if (remoteCamera) {
      lastDesktopUpdateRef.current = Date.now();
      
      // If desktop sent update recently, follow it
      if (cameraRef.current?.el && !gpsEnabled) {
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
        console.log('📹 Mobile following desktop:', remoteCamera.position);
      }
    }
  }, [remoteCamera, gpsEnabled]);
  
  // Check if desktop is still active
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const timeSinceDesktop = Date.now() - lastDesktopUpdateRef.current;
      const shouldFollow = timeSinceDesktop < 2000; // Follow if desktop sent update within 2s
      setFollowDesktop(shouldFollow);
    }, 500);
    
    return () => clearInterval(checkInterval);
  }, []);
  
  // Track camera movement and sync via WebSocket
  useEffect(() => {
    const interval = setInterval(() => {
      if (cameraRef.current) {
        // Get the actual A-Frame element
        const el = cameraRef.current.el;
        if (el && el.getAttribute) {
          const position = el.getAttribute('position');
          const rotation = el.getAttribute('rotation');
          
          if (position && rotation) {
            const newCameraState = {
              position: { x: position.x, y: position.y, z: position.z },
              rotation: { x: rotation.x, y: rotation.y, z: rotation.z }
            };
            
            // Update local state for UI display
            setCameraPosition(newCameraState.position);
            setCameraRotation(newCameraState.rotation);
            
            // Send to server for sync with desktop
            updateCamera(newCameraState);
          }
        }
      }
    }, 100); // Check every 100ms
    
    return () => clearInterval(interval);
  }, [updateCamera]);
  
  // Apply remote camera updates from desktop
  useEffect(() => {
    if (remoteCamera && cameraRef.current) {
      console.log('📹 Applying remote camera update:', remoteCamera.position);
      // Don't override if we're the one moving
      // This creates a collaborative view mode
    }
  }, [remoteCamera]);
  
  // Track device orientation for movement direction
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) {
        // Alpha is compass heading (0-360 degrees, 0=North)
        deviceHeadingRef.current = event.alpha;
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);
  
  // GPS-based position tracking for real-world movement
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn('⚠️ Geolocation not supported');
      return;
    }

    let referencePosition: { latitude: number; longitude: number } | null = null;
    const earthRadius = 6371000; // meters
    const metersPerDegree = (earthRadius * Math.PI) / 180;
    const scaleMultiplier = 7; // Scale GPS movement for visibility (7x)
    
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        
        if (!gpsEnabled) {
          setGpsEnabled(true);
        }
        
        if (!referencePosition) {
          // Set reference point on first GPS reading
          referencePosition = { latitude, longitude };
          console.log('📍 GPS initialized:', { latitude, longitude });
          
          // Store start position
          if (cameraRef.current?.el) {
            const startPos = cameraRef.current.el.getAttribute('position');
            startPositionRef.current = { x: startPos.x, y: 1.6, z: startPos.z }; // Standard eye height
          }
          return;
        }
        
        // Calculate movement from reference point (not delta from last position)
        const deltaLat = latitude - referencePosition.latitude;
        const deltaLon = longitude - referencePosition.longitude;
        
        // Convert to scene coordinates with high accuracy
        // East/West movement (longitude) = X axis
        // North/South movement (latitude) = Z axis (inverted because forward is -Z in A-Frame)
        const worldX = deltaLon * metersPerDegree * Math.cos(latitude * Math.PI / 180) * scaleMultiplier;
        const worldZ = -deltaLat * metersPerDegree * scaleMultiplier;
        
        // Calculate distance from start
        const distance = Math.sqrt(worldX * worldX + worldZ * worldZ) / scaleMultiplier; // Real distance
        
        // Update camera position directly when not following desktop
        if (cameraRef.current?.el && !followDesktop) {
          const el = cameraRef.current.el;
          const newPos = {
            x: startPositionRef.current.x + worldX,
            y: startPositionRef.current.y,
            z: startPositionRef.current.z + worldZ
          };
          el.setAttribute('position', newPos);
          
          // Update state for UI
          setCameraPosition(newPos);
          
          // Add to trail periodically (every 0.3 meters)
          if (distance > (totalDistance + 0.3)) {
            setMovementTrail(trail => [...trail.slice(-20), newPos]);
          }
        }
        
        // Update total distance
        setTotalDistance(distance);
        
        console.log('🚶 GPS position:', { 
          worldX: worldX.toFixed(2), 
          worldZ: worldZ.toFixed(2), 
          distance: distance.toFixed(2),
          accuracy: accuracy?.toFixed(1) + 'm'
        });
      },
      (error) => {
        console.error('❌ GPS error:', error.message);
        setGpsEnabled(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [gpsEnabled, totalDistance, followDesktop]);

  return (
    
    <div style={{ background: "Black", width: "100vw", height: "100vh" }}>
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
      
      {/* GPS Status */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        background: gpsEnabled ? '#4CAF50' : '#FF9800',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        {followDesktop ? '🖥️ Following Desktop (Manual Mode)' : 
         gpsEnabled ? '📍 GPS Active (Sync Mode)' : '📍 GPS Starting...'}
        {gpsEnabled && !followDesktop && (
          <div style={{ fontSize: '10px', marginTop: '4px' }}>
            Distance: {totalDistance.toFixed(1)}m
          </div>
        )}
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
        
        {/* Start position marker */}
        <Entity
          primitive="a-cylinder"
          position={`${startPositionRef.current.x} 0 ${startPositionRef.current.z}`}
          radius="0.3"
          height="0.1"
          color="#00FF00"
        />
        
        {/* Movement trail */}
        {movementTrail.map((pos, idx) => (
          <Entity
            key={idx}
            primitive="a-sphere"
            position={`${pos.x} 0 ${pos.z}`}
            radius="0.1"
            color="#FF9800"
            opacity="0.6"
          />
        ))}

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

        {/* Camera with VR support and movement controls */}
        <Entity
          ref={cameraRef}
          primitive="a-camera"
          look-controls="enabled: true; touchEnabled: true; magicWindowTrackingEnabled: true"
          wasd-controls="enabled: true; acceleration: 100"
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