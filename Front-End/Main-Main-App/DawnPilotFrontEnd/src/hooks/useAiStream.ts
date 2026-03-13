import { useState, useEffect } from 'react';
import { useBinaryStream } from './useBinarySystem';
import { URLS } from '../ApiConfig';

interface UseAiStreamOptions {
  /** * Optional dependency to force reconnection when changed.
   * Useful for Researcher view to clear frame queues on mode switch.
   */
  reconnectDependency?: unknown;
  /**
   * Endpoint path. Defaults to navigation-phosphene
   */
  endpoint?: string;
  /**
   * Stream transport mode.
   * legacy-json uses a single websocket endpoint.
   * phosphene-binary uses /ws/frames (send) + /ws/output (receive).
   */
  transport?: 'legacy-json' | 'phosphene-binary';
}

export const useAiStream = ({ 
  reconnectDependency,
  endpoint = 'navigation-phosphene',
  transport = 'legacy-json',
}: UseAiStreamOptions = {}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [outputSocket, setOutputSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketsToClose: WebSocket[] = [];

    if (transport === 'phosphene-binary') {
      const framesWs = new WebSocket(`${URLS.AI_STREAM}/ws/frames`);
      const outputWs = new WebSocket(`${URLS.AI_STREAM}/ws/output`);
      outputWs.binaryType = 'arraybuffer';

      socketsToClose.push(framesWs, outputWs);

      framesWs.onopen = () => {
        console.log('🟢 [AI Stream] Connected to PhospheneGenerator input (/ws/frames)');
        setSocket(framesWs);
        setIsConnected(true);
      };

      framesWs.onerror = (error) => {
        console.error('🔴 [AI Stream] Input socket error:', error);
      };

      framesWs.onclose = () => {
        console.log('🔴 [AI Stream] Input socket disconnected');
        setSocket(null);
        setIsConnected(false);
      };

      outputWs.onopen = () => {
        console.log('🟢 [AI Stream] Connected to PhospheneGenerator output (/ws/output)');
        setOutputSocket(outputWs);
      };

      outputWs.onerror = (error) => {
        console.error('🔴 [AI Stream] Output socket error:', error);
      };

      outputWs.onclose = () => {
        console.log('🔴 [AI Stream] Output socket disconnected');
        setOutputSocket(null);
      };
    } else {
      // Legacy single-socket endpoint
      const wsUrl = `${URLS.AI_STREAM}/ws/${endpoint}`;
      const ws = new WebSocket(wsUrl);
      socketsToClose.push(ws);

      ws.onopen = () => {
        console.log(`🟢 [AI Stream] Connected to ${endpoint}`);
        setSocket(ws);
        setOutputSocket(ws);
        setIsConnected(true);
      };

      ws.onerror = (error) => {
        console.error('🔴 [AI Stream] Error:', error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('🔴 [AI Stream] Disconnected');
        setSocket(null);
        setOutputSocket(null);
        setIsConnected(false);
      };
    }

    // Cleanup
    return () => {
      socketsToClose.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      });
      setSocket(null);
      setOutputSocket(null);
      setIsConnected(false);
    };
  }, [reconnectDependency, endpoint, transport]);

  // Handle output stream rendering
  const canvasRef = useBinaryStream(outputSocket, {
    mode: transport === 'phosphene-binary' ? 'phosphene-binary' : 'legacy-json',
  });

  return { 
    socket, 
    canvasRef, 
    isConnected 
  };
};