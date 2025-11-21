import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/api';

interface CameraState {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

interface DeviceMotionData {
  acceleration?: { x: number; y: number; z: number };
  rotationRate?: { alpha: number; beta: number; gamma: number };
  orientation?: { alpha: number; beta: number; gamma: number };
}

interface UseCameraSyncOptions {
  clientType: 'mobile' | 'desktop';
  enableDeviceMotion?: boolean;
  throttleMs?: number;
}

export function useCameraSync(options: UseCameraSyncOptions) {
  const { clientType, enableDeviceMotion = true, throttleMs = 50 } = options;
  
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const remoteCameraRef = useRef<CameraState | null>(null);
  const onCameraUpdateRef = useRef<((camera: CameraState) => void) | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const cameraRef = useRef<CameraState>({
    position: { x: 0, y: 2, z: 4 },
    rotation: { x: 0, y: 0, z: 0 }
  });

  // Initialize Socket.IO connection
  useEffect(() => {
    console.log(`🔌 Connecting to WebSocket: ${SOCKET_URL} as ${clientType}...`);
    
    const socket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],  // Try polling first for HTTPS
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      timeout: 10000,
      secure: true,
      rejectUnauthorized: false  // Accept self-signed certificates
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`✅ WebSocket connected: ${socket.id}`);
      setIsConnected(true);
      
      // Register client type
      socket.emit('client:register', { type: clientType });
    });

    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error.message);
      setIsConnected(false);
    });

    socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      setIsConnected(false);
    });

    // Listen for camera updates from other clients
    socket.on('camera:updated', (data: { clientId: string } & CameraState) => {
      // Store in ref (no React re-render)
      remoteCameraRef.current = {
        position: { ...data.position },
        rotation: { ...data.rotation }
      };
      
      // Call callback if provided
      if (onCameraUpdateRef.current) {
        onCameraUpdateRef.current(remoteCameraRef.current);
      }
    });

    // Listen for device motion updates
    socket.on('device:motion:update', (data: { clientId: string } & DeviceMotionData) => {
      // Can be used for advanced synchronization
    });

    return () => {
      console.log('🔌 Disconnecting WebSocket...');
      socket.disconnect();
    };
  }, [clientType]);

  // Send camera update to server (throttled)
  const updateCamera = useCallback((camera: CameraState) => {
    const now = Date.now();
    
    // Throttle updates
    if (now - lastUpdateRef.current < throttleMs) {
      return;
    }
    
    lastUpdateRef.current = now;
    cameraRef.current = camera;

    if (socketRef.current?.connected) {
      socketRef.current.emit('camera:update', camera);
    }
  }, [throttleMs]);

  // Setup device motion listeners (mobile only)
  useEffect(() => {
    if (!enableDeviceMotion || clientType !== 'mobile') {
      return;
    }

    let permissionGranted = false;

    // Request device motion permission (iOS 13+)
    const requestPermission = async () => {
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        try {
          const permission = await (DeviceMotionEvent as any).requestPermission();
          permissionGranted = permission === 'granted';
          console.log(`📱 Device motion permission: ${permission}`);
        } catch (error) {
          console.error('❌ Device motion permission denied:', error);
        }
      } else {
        // Non-iOS or older iOS
        permissionGranted = true;
      }
    };

    requestPermission();

    // Device orientation handler
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (!permissionGranted || !socketRef.current?.connected) return;

      const orientation = {
        alpha: event.alpha || 0,  // Z-axis rotation (compass)
        beta: event.beta || 0,    // X-axis rotation (tilt front-back)
        gamma: event.gamma || 0   // Y-axis rotation (tilt left-right)
      };

      socketRef.current.emit('device:motion', { orientation });
    };

    // Device motion handler
    const handleMotion = (event: DeviceMotionEvent) => {
      if (!permissionGranted || !socketRef.current?.connected) return;

      const acceleration = event.acceleration ? {
        x: event.acceleration.x || 0,
        y: event.acceleration.y || 0,
        z: event.acceleration.z || 0
      } : undefined;

      const rotationRate = event.rotationRate ? {
        alpha: event.rotationRate.alpha || 0,
        beta: event.rotationRate.beta || 0,
        gamma: event.rotationRate.gamma || 0
      } : undefined;

      if (acceleration || rotationRate) {
        socketRef.current.emit('device:motion', { acceleration, rotationRate });
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleMotion);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [enableDeviceMotion, clientType]);

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
