import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
// import { SOCKET_URL } from '../config/api';
const SOCKET_URL = "http://192.168.1.116:5000";
interface CameraState {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

interface UseCameraSyncOptions {
  clientType: 'mobile' | 'desktop';
  throttleMs?: number;
}

export function useCameraSync(options: UseCameraSyncOptions) {
  const { clientType, throttleMs = 50 } = options;

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Last remote camera (from other device)
  const remoteCameraRef = useRef<CameraState | null>(null);

  // Optional callback when remote camera changes
  const onCameraUpdateRef = useRef<((camera: CameraState) => void) | null>(null);

  // Throttle state
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      timeout: 10000,
      autoConnect: true
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Socket.IO connected');
      setIsConnected(true);
      // Tell server what type this client is
      socket.emit('client:register', { type: clientType });
    });

    socket.on('connect_error', (error: any) => {
      console.warn('❌ Socket.IO connection error:', error);
      setIsConnected(false);
    });

    socket.on('disconnect', (reason: string) => {
      console.log('⚠️ Socket.IO disconnected - reason:', reason);
      setIsConnected(false);
    });

    socket.on('error', (error: any) => {
      console.error('❌ Socket.IO error:', error);
    });

    // Receive other client camera updates
    socket.on('camera:updated', (data: { clientId: string } & CameraState) => {
      const remoteCam: CameraState = {
        position: { ...data.position },
        rotation: { ...data.rotation }
      };

      remoteCameraRef.current = remoteCam;

      if (onCameraUpdateRef.current) {
        onCameraUpdateRef.current(remoteCam);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [clientType]);

  // Send own camera state (desktop or mobile) to server, throttled
  const updateCamera = useCallback(
    (camera: CameraState) => {
      const now = Date.now();
      if (now - lastUpdateRef.current < throttleMs) return;
      lastUpdateRef.current = now;

      if (socketRef.current?.connected) {
        socketRef.current.emit('camera:update', camera);
      }
    },
    [throttleMs]
  );

  // Allow components to register a handler for remote camera updates
  const setOnCameraUpdate = useCallback((callback: (camera: CameraState) => void) => {
    onCameraUpdateRef.current = callback;
  }, []);

  return {
    isConnected,
    remoteCameraRef,
    setOnCameraUpdate,
    updateCamera,
    socket: socketRef.current
  };
}
