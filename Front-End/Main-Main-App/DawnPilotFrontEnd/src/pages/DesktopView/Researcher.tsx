import 'aframe';
import '../../AFrameComponents/VRMovementControls';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useScenarioWorld } from '../../hooks/useScenarioWorld';
import { useCameraSync } from '../../hooks/useCameraSync';
import { useFrameBuffer } from '../../hooks/useFrameBuffer';
import { useCollisionDetection } from '../../hooks/useCollision';
import { useScenarioSaveLoad } from '../../hooks/useScenarioSaveLoad';
import ScenarioLoadDialog from '../../components/level-1/ScenarioLoadDialog/ScenarioLoadDialog';

// Helper to format milliseconds into MM:SS
const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

function ResearcherView() {
  const cameraRef = useRef<any>(null);
  const hitboxRef = useRef<any>(null);

  // --- Research State ---
  const [startTime] = useState<number>(Date.now());
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [collisionCount, setCollisionCount] = useState<number>(0);
  const [collisionLog, setCollisionLog] = useState<string[]>([]);
  // Placeholder for AI Frames (Base64 string)
  const [aiHudFrame, setAiHudFrame] = useState<string | null>(null); 

  const { isConnected, updateCamera, setOnCameraUpdate } = useCameraSync({
    clientType: 'desktop',
    throttleMs: 16 // ~60fps
  });

  const { world, loadWorld } = useScenarioWorld();

  // Scenario save/load
  const {
    loadScenario: loadScenarioAPI,
    listScenarios,
    deleteScenario: deleteScenarioAPI,
    loading: saveLoadLoading
  } = useScenarioSaveLoad();

  // Dialog states
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<any[]>([]);
  
  // Keep the framebuffer logic for sending data TO the AI
  useFrameBuffer({
    logInterval: 1000,
    logPixelData: false,
    downsamplePercentage: 50
  });
  
  // --- Effects ---

  // 1. Load World
  useEffect(() => {
    loadWorld().catch(err => {
      console.error('Researcher - Failed to load world:', err);
    });
  }, [loadWorld]);

  // 2. Timer Logic
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // 3. Simulated AI Socket Listener (Replace this with your actual Socket hook)
  useEffect(() => {
    // Example: If you have a specific hook or socket listener for AI frames:
    // socket.on('ai_hud_frame', (base64Image) => setAiHudFrame(base64Image));
    
    // For demonstration, we just initialize it. 
    // In a real scenario, this would update `aiHudFrame` when data arrives.
    return () => {
      // socket.off('ai_hud_frame');
    };
  }, []);

  // 4. Desktop broadcasts camera position to mobile
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

  // 5. Receive Rotation from Mobile
  useEffect(() => {
    setOnCameraUpdate((remoteData) => {
      // Desktop controls Position, Mobile controls Rotation
      if (cameraRef.current) {
        const el = cameraRef.current.el;
        const r = remoteData.rotation;
        el.setAttribute('rotation', `${r.x} ${r.y} ${r.z}`);
      }
    });
  }, [setOnCameraUpdate]);

  // 6. Collision Handling
  const handleCollision = useCallback((detail: { obstacleId: string; timestamp: number }) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMsg = `[${timestamp}] Hit: ${detail.obstacleId}`;
    
    console.warn(`💥 ${logMsg}`);
    
    // Update Research Sidebar State
    setCollisionCount(prev => prev + 1);
    setCollisionLog(prev => [logMsg, ...prev].slice(0, 10)); // Keep last 10 logs

    // Optional: Send metric to backend
    // fetch('http://192.168.1.116:5000/metrics/collision', ...);
  }, []);

  useCollisionDetection(cameraRef, handleCollision);
  useCollisionDetection(hitboxRef, handleCollision);

  // Handle load scenario
  const handleLoadScenario = async (filename: string) => {
    try {
      const result = await loadScenarioAPI(filename);

      // Update world state by reloading from backend with new scenario
      await loadWorld();

      // Restore camera position if available
      if (result.scenario.camera && cameraRef.current) {
        const cam = cameraRef.current.el;
        const cameraData = result.scenario.camera;

        // Set camera position and rotation
        cam.setAttribute('position', `${cameraData.position.x} ${cameraData.position.y} ${cameraData.position.z}`);
        cam.setAttribute('rotation', `${cameraData.rotation.x} ${cameraData.rotation.y} ${cameraData.rotation.z}`);

        // Broadcast the new camera position to mobile
        updateCamera({
          position: cameraData.position,
          rotation: cameraData.rotation
        });
      }

      alert(`Scenario "${result.scenario.name}" loaded successfully!`);
      setShowLoadDialog(false);
    } catch (err) {
      console.error('Failed to load scenario:', err);
      alert('Error loading scenario. Make sure backend is running.');
    }
  };

  // Handle delete scenario
  const handleDeleteScenario = async (filename: string) => {
    try {
      await deleteScenarioAPI(filename);
      // Refresh the list
      const scenarios = await listScenarios();
      setSavedScenarios(scenarios);
    } catch (err) {
      console.error('Failed to delete scenario:', err);
      alert('Error deleting scenario.');
    }
  };

  // Load scenarios list when opening load dialog
  const handleOpenLoadDialog = async () => {
    try {
      const scenarios = await listScenarios();
      setSavedScenarios(scenarios);
      setShowLoadDialog(true);
    } catch (err) {
      console.error('Failed to list scenarios:', err);
      alert('Error loading scenarios list.');
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      width: '100vw', 
      height: '100vh', 
      background: '#1a1a1a', 
      color: '#eee',
      fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif'
    }}>
      
      {/* --- LEFT SIDEBAR: EXPERIMENT DATA --- */}
      <div style={{
        width: '320px',
        background: '#222',
        borderRight: '1px solid #444',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10
      }}>
        
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid #444', background: '#2d2d2d' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#4CAF50' }}>🧪 Research Control</h2>
          <div style={{ fontSize: '12px', color: '#aaa', marginTop: '5px' }}>
             Status: {isConnected ? <span style={{color: '#4CAF50'}}>Connected</span> : <span style={{color: '#f44336'}}>Waiting...</span>}
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          
          {/* Timer Section */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#888', marginBottom: '8px' }}>Session Duration</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', fontFamily: 'monospace' }}>
              {formatTime(elapsedTime)}
            </div>
          </div>

          {/* Metrics Section */}
          <div style={{ marginBottom: '24px', background: '#333', borderRadius: '8px', padding: '15px' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#888', marginBottom: '8px' }}>Metrics</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Total Collisions:</span>
              <span style={{ fontSize: '20px', fontWeight: 'bold', color: collisionCount > 0 ? '#ff6b6b' : '#fff' }}>
                {collisionCount}
              </span>
            </div>
          </div>

          {/* AI HUD Frame (The "frames from AI socket") */}
          <div style={{ marginBottom: '24px' }}>
             <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#888', marginBottom: '8px' }}>AI Live Inference</div>
             <div style={{ 
               width: '100%', 
               aspectRatio: '16/9', 
               background: '#000', 
               borderRadius: '4px',
               border: '1px solid #444',
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center',
               overflow: 'hidden'
             }}>
               {aiHudFrame ? (
                 <img src={aiHudFrame} alt="AI HUD" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
               ) : (
                 <div style={{ textAlign: 'center', color: '#555', fontSize: '12px' }}>
                   <div>📡 Waiting for AI Stream...</div>
                   <div style={{ fontSize: '10px' }}>(Check Socket Connection)</div>
                 </div>
               )}
             </div>
          </div>

          {/* Collision Log */}
          <div>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#888', marginBottom: '8px' }}>Recent Events</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '12px', color: '#ccc' }}>
              {collisionLog.length === 0 && <li style={{ fontStyle: 'italic', color: '#555' }}>No events logged.</li>}
              {collisionLog.map((log, idx) => (
                <li key={idx} style={{ marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                  {log}
                </li>
              ))}
            </ul>
          </div>

          {/* Scenario Controls */}
          <div style={{ marginTop: '24px' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#888', marginBottom: '8px' }}>Scenario Control</div>
            <button
              style={{
                backgroundColor: '#00ff88',
                color: '#000',
                fontWeight: 'bold',
                border: 'none',
                padding: '8px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                width: '100%'
              }}
              onClick={handleOpenLoadDialog}
              disabled={saveLoadLoading}
            >
              📂 Load Scenario
            </button>
          </div>

        </div>
      </div>

      {/* --- RIGHT SIDE: 3D VIEWPORT --- */}
      <div style={{ flex: 1, position: 'relative', background: 'black' }}>
        
        {/* On-screen Controls Overlay (Minimal) */}
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          padding: '8px',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'monospace',
          pointerEvents: 'none'
        }}>
          <div>🎮 VR Controller + ⌨️ WASD</div>
          <div style={{ fontSize: '9px', opacity: 0.7, marginTop: '4px' }}>
            Btn 7: Height ↑ | Btn 6: Height ↓
          </div>
        </div>

        <Scene
          embedded
          vr-mode-ui="enabled: false"
          fog="type: linear; color: #111; near: 50; far: 200"
          style={{ width: '100%', height: '100%' }}
          // stats
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
            
            const isObstacle = e.name !== "Light";

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
                  className={isObstacle ? "collidable" : ""}  
                />
              );
            }

            return (
              <Entity
                key={e.id}
                className={isObstacle ? "collidable" : ""}
                gltf-model={url}
                position={`${pos.x} ${pos.y} ${pos.z}`}
                rotation={`${rot.x} ${rot.y} ${rot.z}`}
                scale={`${scl.x} ${scl.y} ${scl.z}`}
              />
            );
          })}

          {/* Camera: WASD + VR Controller, no mouse look */}
          <Entity
            ref={cameraRef}
            primitive="a-camera"
            look-controls="enabled: false"
            wasd-controls="enabled: true; acceleration: 30"
            vr-movement-controls="speed: 5; verticalSpeed: 3; acceleration: 15; heightUpButton: 7; heightDownButton: 6"
          collision-detector="targetSelector: .collidable; cooldown: 1000"
          >
            <Entity
              ref={hitboxRef}
              primitive="a-box"
              position="0 -0.8 0" // Shift down to body level
              scale=".1 1.6 .1"     // Human size
              material="opacity: 0.5; color: red; wireframe: true" 
              visible={true} // Keep visible for debugging or set to false
              collision-detector="targetSelector: .collidable; cooldown: 1000"
            />
          </Entity>
        </Scene>

        {/* Load Scenario Dialog */}
        {showLoadDialog && (
          <ScenarioLoadDialog
            scenarios={savedScenarios}
            onLoad={handleLoadScenario}
            onCancel={() => setShowLoadDialog(false)}
            onDelete={handleDeleteScenario}
            loading={saveLoadLoading}
          />
        )}
      </div>
    </div>
  );
}

export default ResearcherView;