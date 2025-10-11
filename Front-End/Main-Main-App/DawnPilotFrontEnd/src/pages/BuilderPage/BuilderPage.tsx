import 'aframe';
import 'aframe-particle-system-component';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import styles from './BuilderPage.module.css';
import BuilderSidePanel from '../../components/level-1/BuilderSidePanel/BuilderSidePanel';
import WorldContext from '../../contexts/WorldContext';

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

  // Debounced update function to avoid too many API calls
  const updateTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const debouncedUpdate = useCallback((index: number, box: Element) => {
    const cubeId = worldState.cubes[index]?.id;
    if (!cubeId) return;

    // Clear existing timeout for this cube
    if (updateTimeoutRef.current[cubeId]) {
      clearTimeout(updateTimeoutRef.current[cubeId]);
    }

    // Set new timeout
    updateTimeoutRef.current[cubeId] = setTimeout(async () => {
      const pos = box.getAttribute('position') as { x: number; y: number; z: number };
      const rot = box.getAttribute('rotation') as { x: number; y: number; z: number };
      const color = box.getAttribute('color') as string;

      try {
        await fetch(`${API_BASE_URL}/world/cube/${cubeId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation: { x: rot.x, y: rot.y, z: rot.z },
            color: color
          })
        });
        console.log(`Cube ${cubeId} updated successfully`);
      } catch (error) {
        console.error('Error updating cube:', error);
      }
    }, 500); // Wait 500ms after last change before syncing
  }, [worldState.cubes]);

  // Listen to A-Frame component changes
  useEffect(() => {
    console.log('Setting up A-Frame listeners, cube count:', worldState.cubes.length);
    
    // Wait for scene to be ready
    const scene = document.querySelector('a-scene');
    if (!scene) {
      console.log('Scene not found');
      return;
    }

    const setupListeners = () => {
      const boxes = document.querySelectorAll('a-box');
      console.log('Found boxes:', boxes.length);
      
      boxes.forEach((box, index) => {
        function handleComponentChange(evt: any) {
          console.log('Component changed:', evt.detail.name, 'on box', index);
          if (['position', 'rotation', 'color'].includes(evt.detail.name)) {
            console.log('Triggering debounced update');
            debouncedUpdate(index, box);
          }
        }
        
        // Store the handler so we can remove it later
        (box as any)._handleComponentChange = handleComponentChange;
        box.addEventListener('componentchanged', handleComponentChange);
      });
    };

    // A-Frame scene might not be ready immediately
    if (scene.hasLoaded) {
      console.log('Scene already loaded, setting up listeners');
      setupListeners();
    } else {
      console.log('Waiting for scene to load');
      scene.addEventListener('loaded', () => {
        console.log('Scene loaded event fired');
        setupListeners();
      });
    }

    return () => {
      console.log('Cleaning up listeners');
      // Cleanup
      const boxes = document.querySelectorAll('a-box');
      boxes.forEach(box => {
        if ((box as any)._handleComponentChange) {
          box.removeEventListener('componentchanged', (box as any)._handleComponentChange);
        }
      });
      // Cleanup timeouts on unmount
      Object.values(updateTimeoutRef.current).forEach(timeout => clearTimeout(timeout));
    };
  }, [worldState.cubes, debouncedUpdate]);

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

  const addCube = async (cubeData?: {
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    color?: string;
  }) => {
    try {
      setLoading(true);
      const defaultCube = {
        position: { x: worldState.cubes.length * 2, y: 0.5, z: -4 },
        rotation: { x: 0, y: 0, z: 0 },
        color: '#4CC3D9'
      };

      const response = await fetch(`${API_BASE_URL}/world/cube`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          position: cubeData?.position || defaultCube.position,
          rotation: cubeData?.rotation || defaultCube.rotation,
          color: cubeData?.color || defaultCube.color
        })
      });
      const data = await response.json();
      setWorldState(data);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Error adding cube:', error);
      alert('Error adding cube. Make sure backend is running.');
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
    <WorldContext.Provider value={{ 
      worldState, 
      loading, 
      loadWorld, 
      addCube, 
      removeCube, 
      saveWorld 
    }}>
      <div className={styles.BuilderPageContainer}>
        <BuilderSidePanel />

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
            {worldState.cubes.map((cube, index) => (
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
              position="0 7 10"
              look-controls="enabled: true"
            >
              <Entity
                primitive="a-cursor"
                animation__click="property: scale; startEvents: click; easing: easeInCubic; dur: 150; from: 0.1 0.1 0.1; to: 1 1 1"
              />
            </Entity>
          </Scene>
        </div>
      </div>
    </WorldContext.Provider>
  );
};

export default BuilderPage;