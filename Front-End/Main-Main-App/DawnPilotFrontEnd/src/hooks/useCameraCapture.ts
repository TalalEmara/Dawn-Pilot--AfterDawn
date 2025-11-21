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

  const captureFrame = useCallback((quality: number = 0.8): string | null => {
    try {
      const scene = document.querySelector('a-scene') as any;
      if (!scene?.canvas) {
        console.error('Canvas not found');
        return null;
      }

      const startTime = performance.now();
      const dataUrl = scene.canvas.toDataURL('image/jpeg', quality);
      
      statsRef.current.lastCaptureTime = performance.now() - startTime;
      statsRef.current.captureCount++;
      
      return dataUrl;
    } catch (error) {
      console.error('Failed to capture camera frame:', error);
      return null;
    }
  }, []);

  const captureFrameRaw = useCallback((quality: number = 0.8): string | null => {
    const dataUrl = captureFrame(quality);
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
