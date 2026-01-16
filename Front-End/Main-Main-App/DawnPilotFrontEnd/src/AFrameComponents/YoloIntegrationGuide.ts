/**
 * Quick Integration Guide for YOLO Dataset Generator
 * 
 * Choose your integration approach based on your needs:
 */

// ============================================
// APPROACH 1: Minimal Integration (Researcher View)
// ============================================

// File: src/pages/DesktopView/Researcher.tsx

// 1. Add import at the top:
import '../AFrameComponents/YoloDatasetGenerator';

// 2. Modify your Scene component:
<Scene
  embedded
  vr-mode-ui="enabled: false"
  renderer="preserveDrawingBuffer: true; antialias: false"
  yolo-dataset-generator="
    enabled: true;
    targetClass: detectable;
    captureInterval: 60;
  "
>
  {/* Your existing entities */}
</Scene>

// 3. Update entity rendering to add detectable class and name:
{world.entities.map((e) => {
  const isDetectable = e.name !== "Light" && e.name !== "Zone";
  
  return (
    <Entity
      key={e.id}
      // ... existing props
      className={isDetectable ? "detectable collidable" : "collidable"}
      data-entity-name={e.name} // ← Add this
    />
  );
})}

// ✅ Done! Files will auto-download when you move around the scene


// ============================================
// APPROACH 2: UI Controls (Recommended for Production)
// ============================================

// Add toggle button to control capture:

import { useState } from 'react';

function ResearcherView() {
  const [captureEnabled, setCaptureEnabled] = useState(false);

  return (
    <>
      {/* Control Button */}
      <button
        onClick={() => setCaptureEnabled(!captureEnabled)}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          padding: "12px 24px",
          background: captureEnabled ? "#f44336" : "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontSize: "16px",
        }}
      >
        {captureEnabled ? "⏹️ Stop Capture" : "📸 Start Capture"}
      </button>

      <Scene
        yolo-dataset-generator={`enabled: ${captureEnabled}`}
      >
        {/* ... */}
      </Scene>
    </>
  );
}


// ============================================
// APPROACH 3: Manual Trigger (Advanced)
// ============================================

// Capture specific moments programmatically:

const captureFrame = () => {
  const sceneEl = document.querySelector('a-scene') as any;
  const component = sceneEl.components['yolo-dataset-generator'];
  
  if (component) {
    component.captureFrame();
    console.log('📸 Frame captured!');
  }
};

// Trigger on specific events:
<button onClick={captureFrame}>
  Capture Current Frame
</button>


// ============================================
// TROUBLESHOOTING CHECKLIST
// ============================================

/**
 * ❌ Problem: "No entities found with class 'detectable'"
 * ✅ Solution: Add className="detectable" to entities
 * 
 * ❌ Problem: "Entity not in class mapping"
 * ✅ Solution: Add data-entity-name="EntityName" attribute
 * 
 * ❌ Problem: Screenshots are black
 * ✅ Solution: Add renderer="preserveDrawingBuffer: true"
 * 
 * ❌ Problem: Too many files downloading
 * ✅ Solution: Increase captureInterval (e.g., 300 for every 5 seconds)
 * 
 * ❌ Problem: Occlusion not working
 * ✅ Solution: Ensure walls have className="collidable"
 */


// ============================================
// CUSTOM CLASS MAPPING
// ============================================

// If your entities don't match the default class names:

<Scene
  yolo-dataset-generator={`
    classMapping: {
      "player": 0,
      "enemy": 1,
      "obstacle": 2,
      "pickup": 3
    };
  `}
>
  <Entity
    data-entity-name="player"
    className="detectable"
  />
  <Entity
    data-entity-name="enemy"
    className="detectable"
  />
</Scene>


// ============================================
// PERFORMANCE OPTIMIZATION
// ============================================

/**
 * Capture Interval Guide:
 * 
 * 1 frame    = ~60 files/sec  🔥 Very Heavy
 * 30 frames  = ~2 files/sec   🔶 Heavy
 * 60 frames  = ~1 file/sec    ✅ Recommended
 * 300 frames = ~1 file/5sec   💨 Light
 */

// For intensive scenes:
<Scene
  yolo-dataset-generator="
    captureInterval: 300;
    minVisiblePixels: 50;
    occlusionCheckLayers: wall;
  "
/>


// ============================================
// DATASET ORGANIZATION
// ============================================

/**
 * After capture, organize your files:
 * 
 * dataset/
 * ├── images/
 * │   ├── train/
 * │   │   ├── frame_0000.jpg
 * │   │   ├── frame_0001.jpg
 * │   │   └── ...
 * │   └── val/
 * │       ├── frame_0100.jpg
 * │       └── ...
 * └── labels/
 *     ├── train/
 *     │   ├── frame_0000.txt
 *     │   ├── frame_0001.txt
 *     │   └── ...
 *     └── val/
 *         ├── frame_0100.txt
 *         └── ...
 */


// ============================================
// EXPORT FOR CONVENIENCE
// ============================================

export const YoloIntegrationSnippets = {
  minimal: `
import '../AFrameComponents/YoloDatasetGenerator';

<Scene
  yolo-dataset-generator="enabled: true; targetClass: detectable"
>
`,

  withControls: `
const [enabled, setEnabled] = useState(false);

<Scene
  yolo-dataset-generator={\`enabled: \${enabled}\`}
>
`,

  entitySetup: `
<Entity
  className="detectable collidable"
  data-entity-name="Box"
/>
`,

  customMapping: `
yolo-dataset-generator="
  classMapping: {\\"CustomName\\": 0, \\"AnotherName\\": 1};
"
`,
};

export default YoloIntegrationSnippets;
