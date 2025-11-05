// Express Backend Integration Example for Phosphene Vision API
// Add these endpoints to your api.ts file

import fetch from 'node-fetch';

// Configuration for Python API
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if Python API is available
 */
async function checkPythonAPI(): Promise<boolean> {
  try {
    const response = await fetch(`${PYTHON_API_URL}/api/health`);
    return response.ok;
  } catch (error) {
    console.error('Python API not available:', error);
    return false;
  }
}

/**
 * Convert file upload to base64
 */
function fileToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * Process uploaded image - detect objects and translate to phosphene
 */
app.post('/api/phosphene/process', async (req, res) => {
  try {
    const { imageBase64, confThreshold = 0.5, tMin = 0.3, kMin = 1, kMax = 5 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Check if Python API is available
    const apiAvailable = await checkPythonAPI();
    if (!apiAvailable) {
      return res.status(503).json({ 
        error: 'Phosphene service unavailable',
        message: 'Python API is not running. Start it with: python phosphene_api.py'
      });
    }

    // Call Python FastAPI service
    const response = await fetch(`${PYTHON_API_URL}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: imageBase64,
        conf_threshold: confThreshold,
        t_min: tMin,
        k_min: kMin,
        k_max: kMax
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Processing failed');
    }

    const result = await response.json();

    res.json({
      success: true,
      phospheneImage: result.phosphene_image_base64,
      detections: result.detections,
      selectedObjects: result.selected_objects,
      metadata: result.metadata
    });

  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ 
      error: 'Failed to process image',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Detect objects only (no translation)
 */
app.post('/api/phosphene/detect', async (req, res) => {
  try {
    const { imageBase64, confThreshold = 0.5 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const response = await fetch(`${PYTHON_API_URL}/api/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: imageBase64,
        conf_threshold: confThreshold
      })
    });

    if (!response.ok) {
      throw new Error('Detection failed');
    }

    const result = await response.json();
    res.json(result);

  } catch (error) {
    console.error('Error detecting objects:', error);
    res.status(500).json({ error: 'Failed to detect objects' });
  }
});

/**
 * Translate existing detections to phosphene
 */
app.post('/api/phosphene/translate', async (req, res) => {
  try {
    const { objects, imageWidth, imageHeight, tMin = 0.3, kMin = 1, kMax = 5 } = req.body;

    if (!objects || !imageWidth || !imageHeight) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const response = await fetch(`${PYTHON_API_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objects,
        image_width: imageWidth,
        image_height: imageHeight,
        t_min: tMin,
        k_min: kMin,
        k_max: kMax
      })
    });

    if (!response.ok) {
      throw new Error('Translation failed');
    }

    const result = await response.json();
    res.json(result);

  } catch (error) {
    console.error('Error translating objects:', error);
    res.status(500).json({ error: 'Failed to translate objects' });
  }
});

/**
 * Update phosphene configuration
 */
app.post('/api/phosphene/configure', async (req, res) => {
  try {
    const { tMin, kMin, kMax } = req.body;

    const response = await fetch(`${PYTHON_API_URL}/api/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        t_min: tMin,
        k_min: kMin,
        k_max: kMax
      })
    });

    if (!response.ok) {
      throw new Error('Configuration update failed');
    }

    const result = await response.json();
    res.json(result);

  } catch (error) {
    console.error('Error updating configuration:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

/**
 * Check phosphene service health
 */
app.get('/api/phosphene/health', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_API_URL}/api/health`);
    
    if (!response.ok) {
      throw new Error('Health check failed');
    }

    const result = await response.json();
    res.json(result);

  } catch (error) {
    res.status(503).json({ 
      status: 'unavailable',
      error: 'Python API not responding'
    });
  }
});

// ============================================================================
// Optional: Integration with World Manager
// ============================================================================

/**
 * Process image and add detected objects to 3D world
 */
app.post('/api/phosphene/process-to-world', async (req, res) => {
  try {
    const { imageBase64, confThreshold = 0.5, tMin = 0.3, kMin = 1, kMax = 5 } = req.body;

    // Step 1: Process image
    const processResponse = await fetch(`${PYTHON_API_URL}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: imageBase64,
        conf_threshold: confThreshold,
        t_min: tMin,
        k_min: kMin,
        k_max: kMax
      })
    });

    if (!processResponse.ok) {
      throw new Error('Processing failed');
    }

    const processResult = await processResponse.json();

    // Step 2: Convert selected objects to 3D world cubes
    // This is where you integrate with your world_Manager
    const worldObjects = [];

    for (const obj of processResult.selected_objects) {
      // Map 2D detection to 3D position
      // This is a simplified example - adjust based on your world coordinate system
      const position = {
        x: (obj.bbox[0] / 640) * 20 - 10,  // Map to world X (-10 to 10)
        y: obj.distance_m || 0,              // Use distance as Y
        z: (obj.bbox[1] / 480) * 20 - 10   // Map to world Z (-10 to 10)
      };

      const rotation = { x: 0, y: 0, z: 0 };

      // Assign colors based on object class
      const colorMap: { [key: string]: string } = {
        'person': '#FF0000',    // Red
        'car': '#00FF00',       // Green
        'bicycle': '#0000FF',   // Blue
        'traffic_light': '#FFFF00',  // Yellow
        'default': '#FFFFFF'    // White
      };

      const color = colorMap[obj.class] || colorMap['default'];

      // Add cube to world using existing world_Manager
      const { addCube } = await import('./Scenario-Builder/world_Manager');
      const updatedWorld = addCube(position, rotation, color);
      
      worldObjects.push({
        class: obj.class,
        position,
        color,
        score: obj.score
      });
    }

    res.json({
      success: true,
      phospheneImage: processResult.phosphene_image_base64,
      detections: processResult.detections,
      worldObjects,
      metadata: processResult.metadata
    });

  } catch (error) {
    console.error('Error processing to world:', error);
    res.status(500).json({ error: 'Failed to process image to world' });
  }
});

// ============================================================================
// Usage Example in Your Frontend
// ============================================================================

/*
// React component example:

const uploadImage = async (file) => {
  const reader = new FileReader();
  
  reader.onloadend = async () => {
    const base64 = reader.result.split(',')[1]; // Remove data URL prefix
    
    const response = await fetch('http://localhost:5000/api/phosphene/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64,
        confThreshold: 0.5,
        tMin: 0.3,
        kMin: 1,
        kMax: 5
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Display phosphene image
      const imgSrc = `data:image/png;base64,${data.phospheneImage}`;
      setPhospheneImage(imgSrc);
      
      // Show detections
      console.log('Detected objects:', data.detections);
      console.log('Selected objects:', data.selectedObjects);
    }
  };
  
  reader.readAsDataURL(file);
};
*/

// ============================================================================
// Install Required Dependency
// ============================================================================

// Run in terminal:
// pnpm add node-fetch

// If using TypeScript, also install types:
// pnpm add -D @types/node-fetch
