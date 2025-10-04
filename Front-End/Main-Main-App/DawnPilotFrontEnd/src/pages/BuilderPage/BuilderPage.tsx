import 'aframe';
import 'aframe-particle-system-component';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import React, { useEffect, useState } from 'react';
// Front-End\Main-App\src\pages\BuilderPage\BuilderPage.module.css
// Front-End\Main-App\src\pages\BuilderPage\BuilderPage.tsx
import styles from './BuilderPage.module.css';
import BuilderSidePanel from '../../components/level-1/BuilderSidePanel/BuilderSidePanel';

interface Cube {
  id: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  color: string;
}

interface WorldState {
  cubes: Cube[];
}

const API_BASE_URL = 'http://localhost:5000/api'; 

const BuilderPage: React.FC = () => {
  const [worldState, setWorldState] = useState<WorldState>({ cubes: [] });
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  useEffect(() => {
    loadWorld();
  }, []);

  const loadWorld = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/world`);
      const data = await response.json();
      setWorldState(data);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Error loading world:', error);
      alert('Error loading world. Make sure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const addCube = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/world/cube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      setWorldState(data);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Error adding cube:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeCube = async () => {
    if (worldState.cubes.length === 0) return alert('No cubes to remove');
    const lastCube = worldState.cubes[worldState.cubes.length - 1];
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/world/cube/${lastCube.id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      setWorldState(data);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Error removing cube:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveWorld = async () => {
    try {
      setLoading(true);
      await fetch(`${API_BASE_URL}/world/save`, { method: 'POST' });
      alert('World saved successfully!');
    } catch (error) {
      console.error('Error saving world:', error);
      alert('Error saving world.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.BuilderPageContainer} style={{ 
     
    }}>

      <BuilderSidePanel />
      {/* Top bar - controls */}
      {/* <div style={{ 
        padding: '10px',
        backgroundColor: '#1a1a1a',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 1000
      }}>
        <div>
          <h3 style={{ margin: '0', fontSize: '45px' }}>🎮 Testing Developer Mode</h3>
          <small style={{ fontSize: '12px' }}>
            Cubes: {worldState.cubes.length} | Last update: {lastUpdate}
          </small>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={addCube} disabled={loading}
            style={{ padding: '6px 12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
            ➕ Add Cube
          </button>
          <button onClick={removeCube} disabled={loading}
            style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
            🗑️ Remove
          </button>
          <button onClick={saveWorld} disabled={loading}
            style={{ padding: '6px 12px', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
            💾 Save
          </button>
          <button onClick={loadWorld} disabled={loading}
            style={{ padding: '6px 12px', backgroundColor: '#4CC3D9', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
            {loading ? '⏳' : '🔄 Reload'}
          </button>
        </div>
      </div> */}

      {/* Full screen AFrame scene */}
      <div style={{ flex: 1 }}>
        <Scene 
          embedded 
          vr-mode-ui="enabled: true"
          style={{ width: '100%', height: '100%' }}
        >
          <Entity light={{ type: 'ambient', color: '#ffffff', intensity: 0.6 }} />
          <Entity light={{ type: 'directional', color: '#ffffff', intensity: 0.9 }} position="0 2 -6" />
          
          {/* Ground plane */}
          <Entity
            primitive="a-plane"
            position="0 0 -4"
            rotation="-90 0 0"
            width="20"
            height="20"
            color="#222222"
          />

          {/* Render cubes from backend */}
          {worldState.cubes.map((cube, index )=> (
            <Entity
              key={cube.id}
              primitive="a-box"
              position={`${index * 2} ${cube.position.y} ${cube.position.z}`}
              rotation={`${cube.rotation.x} ${cube.rotation.y} ${cube.rotation.z}`}
              color={cube.color}
            />
          ))}

          {/* Camera */}
          <Entity
            primitive="a-camera"
            position="0 10 5"
            look-controls="enabled: true"
          >
            <Entity
              primitive="a-cursor"
              animation__click="property: scale; startEvents: click; easing: easeInCubic; dur: 150; from: 0.1 0.1 0.1; to: 1 1 1"
            />
          </Entity>
        </Scene>
      </div>

      {/* Instructions overlay */}
      {worldState.cubes.length === 0 && !loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '20px',
          borderRadius: '10px',
          textAlign: 'center',
          maxWidth: '300px'
        }}>
          <h2>No World Loaded</h2>
          <p>Build a world on desktop first, then reload here.</p>
        </div>
      )}
    </div>
  );
};

export default BuilderPage;
