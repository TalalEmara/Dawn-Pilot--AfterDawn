
import { useEffect, useRef } from 'react';

export function useBinaryStream(ws: WebSocket | null) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastProcessedFrameRef = useRef(0);

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
          // Validate frame ordering to prevent old frame flicker
          const frameId = parseInt(data.data.frame_id) || 0;
          if (frameId < lastProcessedFrameRef.current) {
            console.warn(`⏭️ Skipping old frame ${frameId} (current: ${lastProcessedFrameRef.current})`);
            return;
          }
          lastProcessedFrameRef.current = frameId;
          
          // Convert base64 to blob
          const base64 = data.data.output_image;
          
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'image/png' });
          img.src = URL.createObjectURL(blob);
        } else if (data.type === 'error') {
          console.error('❌ Backend error:', data.error || data.data?.error);
        } else {
          console.warn('⚠️ Unknown message type or missing output_image:', data);
        }
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error, event.data);
      }
    };

    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

  return canvasRef;
}