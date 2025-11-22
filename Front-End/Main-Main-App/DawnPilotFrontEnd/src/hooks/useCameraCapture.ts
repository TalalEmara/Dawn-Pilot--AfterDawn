import { useCallback, useRef } from 'react';

interface CameraCaptureStats {
  lastCaptureTime: number;
  captureCount: number;
}

export function useCameraCapture() {
  const statsRef = useRef<CameraCaptureStats>({
    lastCaptureTime: 0,
    captureCount: 0
  });

  const getCanvasDimensions = useCallback(() => {
    const scene = document.querySelector('a-scene') as any;
    if (!scene?.canvas) {
      return { width: 0, height: 0 };
    }
    return {
      width: scene.canvas.width,
      height: scene.canvas.height
    };
  }, []);

  const captureFrame = useCallback((quality: number = 0.8): Promise<string | null> => {
    return new Promise((resolve) => {
      try {
        const scene = document.querySelector('a-scene') as any;
        if (!scene?.canvas) {
          console.error('Canvas not found');
          resolve(null);
          return;
        }

        // Wait for next A-Frame render tick to ensure canvas is updated
        scene.renderer.render(scene.object3D, scene.camera);
        
        // Use requestAnimationFrame to capture after render completes
        requestAnimationFrame(() => {
          try {
            const startTime = performance.now();
            const dataUrl = scene.canvas.toDataURL('image/jpeg', quality);
            
            statsRef.current.lastCaptureTime = performance.now() - startTime;
            statsRef.current.captureCount++;
            
            console.log(`[CameraCapture] Captured frame ${statsRef.current.captureCount}, size: ${Math.round(dataUrl.length / 1024)}KB`);
            resolve(dataUrl);
          } catch (error) {
            console.error('Failed to capture after render:', error);
            resolve(null);
          }
        });
      } catch (error) {
        console.error('Failed to capture camera frame:', error);
        resolve(null);
      }
    });
  }, []);

  const captureFrameRaw = useCallback(async (quality: number = 0.8): Promise<string | null> => {
    const dataUrl = await captureFrame(quality);
    if (!dataUrl) return null;
    
    // Remove "data:image/jpeg;base64," prefix
    return dataUrl.split(',')[1];
  }, [captureFrame]);

  const getStats = useCallback(() => {
    return { ...statsRef.current };
  }, []);

  return {
    captureFrame,
    captureFrameRaw,
    getCanvasDimensions,
    getStats
  };
}
