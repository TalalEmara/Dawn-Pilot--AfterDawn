
import { useEffect, useRef } from 'react';

export function useBinaryStream(socket: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!socket) return;

    const img = new Image();
    
    // When the browser finishes decoding the JPEG blob...
    img.onload = () => {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        // Paint the frame instantly
        ctx?.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
        
        // Signal A-Frame that the texture needs an update
        canvasRef.current.setAttribute('data-updated', Date.now().toString());
      }
      // Cleanup memory
      URL.revokeObjectURL(img.src);
    };

    const handleFrame = (arrayBuffer: ArrayBuffer) => {
      // Create a Blob from the raw binary data
      const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
      img.src = URL.createObjectURL(blob);
    };

    socket.on('video_frame', handleFrame);

    return () => {
      socket.off('video_frame', handleFrame);
    };
  }, [socket]);

  return canvasRef;
}