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

  const captureDepthMap = useCallback((): string | null => {
    try {
      const scene = document.querySelector('a-scene') as any;
      if (!scene?.object3D || !scene.renderer || !scene.camera) {
        console.error('Scene, renderer, or camera not found');
        return null;
      }

      const startTime = performance.now();

      const renderer = scene.renderer;
      const camera = scene.camera;
      const sceneObject = scene.object3D;

      // Create render target for depth
      const width = renderer.domElement.width;
      const height = renderer.domElement.height;
      const renderTarget = new THREE.WebGLRenderTarget(width, height);

      // Create depth material
      const depthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking
      });

      // Store original materials
      const originalMaterials = new Map();
      sceneObject.traverse((node: any) => {
        if (node.isMesh) {
          originalMaterials.set(node, node.material);
          node.material = depthMaterial;
        }
      });

      // Render depth to target
      renderer.setRenderTarget(renderTarget);
      renderer.render(sceneObject, camera);
      renderer.setRenderTarget(null);

      // Read pixels
      const pixelBuffer = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixelBuffer);

      // Convert RGBA to grayscale
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(width, height);

      for (let i = 0; i < pixelBuffer.length; i += 4) {
        const gray = pixelBuffer[i]; // Use R channel as depth
        imageData.data[i] = gray;     // R
        imageData.data[i + 1] = gray; // G
        imageData.data[i + 2] = gray; // B
        imageData.data[i + 3] = 255;  // A
      }

      ctx.putImageData(imageData, 0, 0);

      // Restore original materials
      sceneObject.traverse((node: any) => {
        if (node.isMesh && originalMaterials.has(node)) {
          node.material = originalMaterials.get(node);
        }
      });

      // Cleanup
      renderTarget.dispose();
      depthMaterial.dispose();

      const dataUrl = canvas.toDataURL('image/png');
      
      statsRef.current.lastCaptureTime = performance.now() - startTime;
      statsRef.current.captureCount++;

      return dataUrl;
    } catch (error) {
      console.error('Failed to capture depth map:', error);
      return null;
    }
  }, []);

  const captureDepthMapRaw = useCallback((): string | null => {
    const dataUrl = captureDepthMap();
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
