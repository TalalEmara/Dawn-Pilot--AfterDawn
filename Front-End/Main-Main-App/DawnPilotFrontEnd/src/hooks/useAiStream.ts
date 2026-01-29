import { useState, useEffect } from 'react';
import { useBinaryStream } from './useBinarySystem';
import { URLS } from '../ApiConfig';

interface UseAiStreamOptions {
  /** * Optional dependency to force reconnection when changed.
   * Useful for Researcher view to clear frame queues on mode switch.
   */
  reconnectDependency?: any;
  /**
   * Endpoint path. Defaults to navigation-phosphene
   */
  endpoint?: string;
}

export const useAiStream = ({ 
  reconnectDependency,
  endpoint = 'navigation-phosphene' 
}: UseAiStreamOptions = {}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // 1. Establish Connection
    const wsUrl = `${URLS.AI_STREAM}/ws/navigation-phosphene`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`🟢 [AI Stream] Connected to ${endpoint}`);
      setSocket(ws);
      setIsConnected(true);
    };

    ws.onerror = (error) => {
      console.error("🔴 [AI Stream] Error:", error);
      setIsConnected(false);
    };

    ws.onclose = () => {
      console.log("🔴 [AI Stream] Disconnected");
      setSocket(null);
      setIsConnected(false);
    };

    // 2. Cleanup
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      setSocket(null);
      setIsConnected(false);
    };
  }, [reconnectDependency, endpoint]); // Re-run effect if dependency changes

  // 3. Handle Binary Stream (Canvas Updates)
  const canvasRef = useBinaryStream(socket);

  return { 
    socket, 
    canvasRef, 
    isConnected 
  };
};