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
          console.error('[CameraCapture] Canvas not found');
          resolve(null);
          return;
        }
        
        if (!scene.renderStarted) {
          console.error('[CameraCapture] Scene rendering not started');
          resolve(null);
          return;
        }

        // Always capture from normal rendering (even in VR mode)
        // Force render current scene to canvas
        scene.renderer.render(scene.object3D, scene.camera);
        
        requestAnimationFrame(() => {
          try {
            const startTime = performance.now();
            const dataUrl = scene.canvas.toDataURL('image/jpeg', quality);
            
            const sizeKB = Math.round(dataUrl.length / 1024);
            statsRef.current.lastCaptureTime = performance.now() - startTime;
            statsRef.current.captureCount++;
            
            console.log(`[CameraCapture] Frame ${statsRef.current.captureCount}, size: ${sizeKB}KB, time: ${statsRef.current.lastCaptureTime.toFixed(2)}ms`);
            resolve(dataUrl);
          } catch (error) {
            console.error('[CameraCapture] Failed to capture frame:', error);
            resolve(null);
          }
        });
      } catch (error) {
        console.error('[CameraCapture] Failed to capture camera frame:', error);
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
