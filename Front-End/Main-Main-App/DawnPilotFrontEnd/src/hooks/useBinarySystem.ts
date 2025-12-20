
import { useEffect, useRef } from 'react';

export function useBinaryStream(ws: WebSocket | null) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ws) return;

    const img = new Image();
    
    // When the browser finishes decoding the JPEG/PNG blob...
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

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle phosphene result from backend
        if (data.type === 'result' && data.data?.output_image) {
          // Convert base64 to blob
          const base64 = data.data.output_image;
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'image/png' });
          img.src = URL.createObjectURL(blob);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

  return canvasRef;
}