import { useEffect, useRef } from 'react';
// Import the worker (Vite/Webpack syntax usually looks like this)
import DecoderWorker from '../workers/frameDecoder.worker?worker'; 

export function useBinaryStream(ws: WebSocket | null) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastProcessedFrameRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Initialize the Decoder Worker
    workerRef.current = new DecoderWorker();

    // Handle decoded frames coming FROM the worker
    workerRef.current.onmessage = (e) => {
      const { success, bitmap, frameId } = e.data;

      if (success && canvasRef.current && bitmap) {
        // Update safeguard
        lastProcessedFrameRef.current = frameId;

        const ctx = canvasRef.current.getContext('2d');
        
        // DRAW INSTANTLY: No decoding, just a GPU texture upload
        ctx?.drawImage(bitmap, 0, 0, canvasRef.current.width, canvasRef.current.height);
        
        // Close the bitmap to free GPU memory immediately
        bitmap.close(); 
        // Signal A-Frame (custom property)
        (canvasRef.current as any).needsUpdate = true;
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      // ⚡ OPTIMIZATION: Don't parse here. 
      // Just pass the raw string to the worker.
      if (workerRef.current) {
        workerRef.current.postMessage({
          jsonString: event.data,
          lastFrameId: lastProcessedFrameRef.current
        });
      }
    };

    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

  return canvasRef;
}