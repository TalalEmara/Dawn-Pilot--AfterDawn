import 'aframe';
import 'aframe-particle-system-component';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import React from 'react';

const BuilderPage: React.FC = () => {
  const [currentPose, setCurrentPose] = React.useState<number>(-6);

  function addCube() {
    const scene = document.querySelector('a-scene');
    if (scene) {
      const box = document.createElement('a-box');
      box.setAttribute('position', `0 2 ${currentPose}`);
      box.setAttribute('rotation', '0 45 0');
      box.setAttribute('color', '#4CC3D9');
      scene.appendChild(box);
    }
    setCurrentPose(prev => prev - 3);

  }
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Left half - UI / controls */}
      <div style={{ flex: 1, backgroundColor: '#f555' }}>
       <button onClick={addCube}>Add cube</button>
      </div>

      {/* Right half - AFrame scene */}
      <div style={{ flex: 1 }}>
        <Scene embedded style={{ width: '100%', height: '100%' }}>
          <Entity light={{ type: 'ambient', color: '#ffffff', intensity: 0.5 }} />
          <Entity light={{ type: 'directional', color: '#ffffff', intensity: 0.8 }} position="0 1 -6" />
          <Entity primitive="a-box" position="0 1 -3" rotation="0 45 0" color="#4CC3D9" />
          <Entity primitive="a-box" position="0 1 -6" rotation="0 45 0" color="#cd0808ff" />
        </Scene>
      </div>
    </div>
  );
};

export default BuilderPage;
