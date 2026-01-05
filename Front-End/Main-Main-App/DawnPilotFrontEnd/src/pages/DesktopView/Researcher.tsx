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
import { useExperimentVault } from '../../hooks/Recording/useExperimentVault'; //
import ScenarioLoadDialog from '../../components/level-1/ScenarioLoadDialog/ScenarioLoadDialog';
import Minimap from '../../components/level-0/MiniMap/MiniMap';

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

  // --- Research / Experiment State ---
  const [subjectId, setSubjectId] = useState("test_subject_01");
  const [visionMode, setVisionMode] = useState("prosthetic");
  const [currentScenarioId, setCurrentScenarioId] = useState("default_world");
  const [mobileId, setMobileId] = useState<string>(""); 

  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [collisionCount, setCollisionCount] = useState<number>(0);
  const [collisionLog, setCollisionLog] = useState<string[]>([]);
  
  // Placeholder for AI Frames
  const [aiHudFrame, setAiHudFrame] = useState<string | null>(null); 

  // 1. Get socket from CameraSync
  const { isConnected, updateCamera, setOnCameraUpdate, socket } = useCameraSync({
    clientType: 'desktop',
    throttleMs: 16 // ~60fps
  });

  // 2. Initialize Experiment Vault
  const 
  
  vault = useExperimentVault(socket);

  const { world, loadWorld } = useScenarioWorld();

  // Scenario save/load
  const {
    loadScenario: loadScenarioAPI,
    listScenarios,
    deleteScenario: deleteScenarioAPI,
    loading: saveLoadLoading
  } = useScenarioSaveLoad();

  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<any[]>([]);
  
  // Frame buffer logic
  useFrameBuffer({
    logInterval: 1000,
    logPixelData: false,
    downsamplePercentage: 50
  });
  
  // --- Effects ---

  // 1. Capture Mobile Client ID directly from socket events
  useEffect(() => {
    if (!socket) return;
    
    const handleCameraUpdate = (data: any) => {
      // Capture the ID of the device sending camera updates (the mobile viewer)
      if (data.clientId && data.clientId !== socket.id) {
        setMobileId(data.clientId);
      }
    };

    socket.on('camera:updated', handleCameraUpdate);
    return () => {
      socket.off('camera:updated', handleCameraUpdate);
    };
  }, [socket]);

  // 2. Load World
  useEffect(() => {
    loadWorld().catch(err => {
      console.error('Researcher - Failed to load world:', err);
    });
  }, [loadWorld]);

  // 3. Timer Logic (Only runs when recording)
  useEffect(() => {
    if (!vault.isRecording || !vault.startTime) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - vault.startTime!);
    }, 1000);
    return () => clearInterval(interval);
  }, [vault.isRecording, vault.startTime]);

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
      if (cameraRef.current) {
        const el = cameraRef.current.el;
        const r = remoteData.rotation;
        el.setAttribute('rotation', `${r.x} ${r.y} ${r.z}`);
      }
    });
  }, [setOnCameraUpdate]);

  // 6. Collision Handling + Vault Logging
  const handleCollision = useCallback((detail: { obstacleId: string; timestamp: number }) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMsg = `[${timestamp}] Hit: ${detail.obstacleId}`;
    
    console.warn(`💥 ${logMsg}`);
    
    setCollisionCount(prev => prev + 1);
    setCollisionLog(prev => [logMsg, ...prev].slice(0, 10));

    // LOG TO VAULT
    vault.logCollision(detail.obstacleId);

  }, [vault]);

  // useCollisionDetection(cameraRef, handleCollision);
  useCollisionDetection(hitboxRef, handleCollision);

  // --- Experiment Control Handlers ---

  const handleStartExperiment = async () => {
    if (!socket?.id || !mobileId) {
      alert("Missing connection! Ensure Mobile Viewer is connected.");
      return;
    }

    const success = await vault.startExperiment({
      laptopSocketId: socket.id,
      mobileId: mobileId,
      subjectId: subjectId,
      scenarioId: currentScenarioId,
      visionMode: visionMode
    });

    if (success) {
      setCollisionCount(0); // Reset metrics on start
      setCollisionLog([]);
    }
  };

  const handleStopExperiment = async () => {
    const filename = await vault.stopExperiment();
    if (filename) {
      alert(`Experiment saved: ${filename}`);
    }
  };

  // --- Scenario Handlers ---

  const handleLoadScenario = async (filename: string) => {
    try {
      const result = await loadScenarioAPI(filename);
      await loadWorld();
      setCurrentScenarioId(filename); // Track current scenario

      if (result.scenario.camera && cameraRef.current) {
        const cam = cameraRef.current.el;
        const cameraData = result.scenario.camera;
        cam.setAttribute('position', `${cameraData.position.x} ${cameraData.position.y} ${cameraData.position.z}`);
        cam.setAttribute('rotation', `${cameraData.rotation.x} ${cameraData.rotation.y} ${cameraData.rotation.z}`);
        updateCamera({
          position: cameraData.position,
          rotation: cameraData.rotation
        });
      }

      alert(`Scenario "${result.scenario.name}" loaded!`);
      setShowLoadDialog(false);
    } catch (err) {
      console.error('Failed to load scenario:', err);
      alert('Error loading scenario.');
    }
  };

  // Handle delete scenario
  const handleDeleteScenario = async (filename: string) => {
    try {
      await deleteScenarioAPI(filename);
      const scenarios = await listScenarios();
      setSavedScenarios(scenarios);
    } catch (err) {
      console.error('Failed to delete scenario:', err);
      alert('Error deleting scenario.');
    }
  };

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
          <h2 style={{ margin: 0, fontSize: '18px', color: vault.isRecording ? '#ff4444' : '#4CAF50' }}>
            {vault.isRecording ? '🔴 Recording...' : '🧪 Research Control'}
          </h2>
          <div style={{ fontSize: '12px', color: '#aaa', marginTop: '5px' }}>
             Laptop: {isConnected ? '🟢' : '🔴'} | Mobile: {mobileId ? '🟢' : '🔴 Waiting...'}
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* Experiment Setup Form */}
          <div style={{ marginBottom: '24px', background: '#333', padding: '15px', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#888', marginBottom: '8px' }}>Setup</div>
            
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '11px', color: '#aaa' }}>Subject ID</label>
              <input 
                type="text" 
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                disabled={vault.isRecording}
                style={{ width: '100%', padding: '5px', background: '#222', border: '1px solid #444', color: 'white' }}
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '11px', color: '#aaa' }}>Vision Mode</label>
              <select 
                value={visionMode}
                onChange={(e) => setVisionMode(e.target.value)}
                disabled={vault.isRecording}
                style={{ width: '100%', padding: '5px', background: '#222', border: '1px solid #444', color: 'white' }}
              >
                <option value="normal">Normal Vision</option>
                <option value="prosthetic">Prosthetic Simulation</option>
                <option value="low_res">Low Resolution</option>
              </select>
            </div>

            {!vault.isRecording ? (
              <button
                onClick={handleStartExperiment}
                disabled={!mobileId}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: mobileId ? '#4CAF50' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: mobileId ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold'
                }}
              >
                {vault.isLoading ? 'Starting...' : 'Start Recording'}
              </button>
            ) : (
              <button
                onClick={handleStopExperiment}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {vault.isLoading ? 'Stopping...' : 'Stop Recording'}
              </button>
            )}
            
            {vault.error && (
              <div style={{ color: '#ff6b6b', fontSize: '11px', marginTop: '5px' }}>
                Error: {vault.error}
              </div>
            )}
          </div>
          <Minimap entities={world.entities} cameraRef={cameraRef}/>
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

          {/* AI HUD Frame */}
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
            <div style={{ fontSize: '11px', color: '#00d9ff', marginBottom: '5px'}}>Current: {currentScenarioId}</div>
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
              disabled={saveLoadLoading || vault.isRecording}
            >
              📂 Load Scenario
            </button>
          </div>

        </div>
      </div>

      {/* --- RIGHT SIDE: 3D VIEWPORT --- */}
      <div style={{ flex: 1, position: 'relative', background: 'black' }}>
        
        {/* On-screen Controls Overlay */}
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
        </div>

        <Scene
          embedded
          vr-mode-ui="enabled: false"
          fog="type: linear; color: #111; near: 50; far: 200"
          style={{ width: '100%', height: '100%' }}
        >
          {/* ... [Existing Scene Content remains unchanged] ... */}
          <Entity primitive="a-sky" color="#87CEEB" />
          <Entity light={{ type: 'ambient', color: '#ffffff', intensity: 0.6 }} />
          <Entity light={{ type: 'directional', color: '#ffffff', intensity: 0.9 }} position="0 2 -6" />
          
          <Entity
            primitive="a-plane"
            position="0 -1 -4"
            rotation="-90 0 0"
            width="1000"
            height="1000"
            color="#2a5a2a"
            material="src: url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDEwIDAgTCAwIDAgMCAxMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMWE0YTFhIiBzdHJva2Utd2lkdGg9IjAuNSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=); repeat: 100 100"
          />

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
              position="0 -0.8 0"
              scale=".1 1.6 .1"
              material="opacity: 0.5; color: red; wireframe: true" 
              visible={true} 
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