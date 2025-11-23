import { useCallback, useRef } from 'react';
import * as THREE from 'three';

interface DepthCaptureStats {
  lastCaptureTime: number;
  captureCount: number;
}

export function useDepthCapture() {
  const statsRef = useRef<DepthCaptureStats>({
    lastCaptureTime: 0,
    captureCount: 0
  });

  const captureDepthMap = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      try {
        const scene = document.querySelector('a-scene') as any;
        if (!scene?.object3D || !scene.renderer || !scene.camera) {
          console.error('[DepthCapture] Scene, renderer, or camera not found');
          resolve(null);
          return;
        }
        
        if (!scene.renderStarted) {
          console.error('[DepthCapture] Scene rendering not started');
          resolve(null);
          return;
        }

        // Always use simple RAF - no special VR handling needed
        const rafCount = 1;
        
        const waitForRender = (remaining: number) => {
          if (remaining === 0) {
            captureDepthNow();
            return;
          }
          requestAnimationFrame(() => waitForRender(remaining - 1));
        };
        
        const captureDepthNow = () => {
          try {
            const startTime = performance.now();

            const renderer = scene.renderer;
            const camera = scene.camera;
            const sceneObject = scene.object3D;

            // Get actual rendering dimensions
            const width = renderer.domElement.width;
            const height = renderer.domElement.height;
            
            console.log(`[DepthCapture] Canvas: ${width}x${height}`);

            // Create render target for depth
            const renderTarget = new THREE.WebGLRenderTarget(width, height, {
              minFilter: THREE.NearestFilter,
              magFilter: THREE.NearestFilter,
              format: THREE.RGBAFormat
            });

            // Create depth material - use BasicDepthPacking for simpler linear depth
            const depthMaterial = new THREE.MeshDepthMaterial({
              depthPacking: THREE.BasicDepthPacking  // Linear depth (easier to work with)
            });
            
            // Configure camera near/far for better depth range
            // BasicDepthPacking: 0 (black) = near, 255 (white) = far
            // We INVERT this later so: 255 (white) = near/close, 0 (black) = far/distant
            // This matches intuition: BRIGHTER = CLOSER
            const originalNear = camera.near;
            const originalFar = camera.far;
            camera.near = 0.1;   // Very close (will be inverted to 255/bright)
            camera.far = 50;     // Far (will be inverted to 0/dark)
            camera.updateProjectionMatrix();

            // Store original materials
            const originalMaterials = new Map();
            sceneObject.traverse((node: any) => {
              if (node.isMesh) {
                originalMaterials.set(node, node.material);
                node.material = depthMaterial;
              }
            });

            // Save original render state
            const originalRenderTarget = renderer.getRenderTarget();
            
            // Render depth to target
            renderer.setRenderTarget(renderTarget);
            renderer.clear();
            renderer.render(sceneObject, camera);
            renderer.setRenderTarget(originalRenderTarget);

            // Read pixels
            const pixelBuffer = new Uint8Array(width * height * 4);
            renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixelBuffer);

            // Restore original materials immediately
            sceneObject.traverse((node: any) => {
              if (node.isMesh && originalMaterials.has(node)) {
                node.material = originalMaterials.get(node);
              }
            });
            
            // Restore camera settings
            camera.near = originalNear;
            camera.far = originalFar;
            camera.updateProjectionMatrix();

            // Cleanup
            renderTarget.dispose();
            depthMaterial.dispose();

            // Convert RGBA to grayscale and analyze depth distribution
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            const imageData = ctx.createImageData(width, height);
            
            // Track depth statistics for debugging
            let minDepth = 255, maxDepth = 0, sumDepth = 0, count = 0;

            // Flip vertically: WebGL origin is bottom-left, canvas is top-left
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                // Read from bottom-up (WebGL coordinate system)
                const srcIdx = ((height - 1 - y) * width + x) * 4;
                // Write to top-down (canvas coordinate system)
                const dstIdx = (y * width + x) * 4;
                
                const depth = pixelBuffer[srcIdx]; // R channel (0=near, 255=far)
                
                imageData.data[dstIdx] = depth;     // R
                imageData.data[dstIdx + 1] = depth; // G
                imageData.data[dstIdx + 2] = depth; // B
                imageData.data[dstIdx + 3] = 255;   // A
                
                // Statistics
                if (depth > 0) {
                  minDepth = Math.min(minDepth, depth);
                  maxDepth = Math.max(maxDepth, depth);
                  sumDepth += depth;
                  count++;
                }
              }
            }
            
            const avgDepth = count > 0 ? sumDepth / count : 0;
            console.log(`[DepthCapture] Depth range: ${minDepth}-${maxDepth}, avg: ${avgDepth.toFixed(1)} (0=near, 255=far)`);

            ctx.putImageData(imageData, 0, 0);

            const dataUrl = canvas.toDataURL('image/png');
            
            statsRef.current.lastCaptureTime = performance.now() - startTime;
            statsRef.current.captureCount++;

            console.log(`[DepthCapture] Depth ${statsRef.current.captureCount}, size: ${Math.round(dataUrl.length / 1024)}KB, time: ${statsRef.current.lastCaptureTime.toFixed(2)}ms`);
            resolve(dataUrl);
          } catch (error) {
            console.error('[DepthCapture] Failed to capture depth:', error);
            resolve(null);
          }
        };
        
        // Start the RAF chain
        waitForRender(rafCount);
        
      } catch (error) {
        console.error('Failed to capture depth map:', error);
        resolve(null);
      }
    });
  }, []);

  const captureDepthMapRaw = useCallback(async (): Promise<string | null> => {
    const dataUrl = await captureDepthMap();
    if (!dataUrl) return null;
    
    // Remove "data:image/png;base64," prefix
    return dataUrl.split(',')[1];
  }, [captureDepthMap]);

  const getStats = useCallback(() => {
    return { ...statsRef.current };
  }, []);

  return {
    captureDepthMap,
    captureDepthMapRaw,
    getStats
  };
}
