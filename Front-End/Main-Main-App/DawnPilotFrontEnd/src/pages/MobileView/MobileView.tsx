import 'aframe';
import 'aframe-particle-system-component';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { Entity, Scene } from 'aframe-react';
import { useScenarioWorld } from '../../hooks/useScenarioWorld';
import { useEffect, useRef, useState } from 'react';
import { useComponentManager } from '../../hooks/useComponentManager';
import { useFrameBuffer } from '../../hooks/useFrameBuffer';
import { useCameraSync } from '../../hooks/useCameraSync';
import { useCameraCapture } from '../../hooks/useCameraCapture';
import { useDepthCapture } from '../../hooks/useDepthCapture';
import { usePhospheneVision } from '../../hooks/usePhospheneVision';
import { SOCKET_URL } from '../../config/api';

function MobileView() {
  const cameraRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const rigRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const targetPosition = useRef({ x: 0, y: 2, z: 0 });
  const animationFrameId = useRef<number | null>(null);
  const gamepadIndex = useRef<number | null>(null);
  const phoneControllerWS = useRef<WebSocket | null>(null);
  const externalAxisRef = useRef({ x: 0, y: 0 }); // Axis from pygame server
  
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 2, z: 0 });
  const [showCertWarning, setShowCertWarning] = useState(false);
  const [controllerStatus, setControllerStatus] = useState<string>('Touch/Keyboard');
  
  // Mobile control state (now supports keyboard from controller)
  const [activeButtons, setActiveButtons] = useState({ w: false, a: false, s: false, d: false, q: false, e: false });
  const keyboardKeysPressed = useRef<Set<string>>(new Set());
  const unidentifiedKeyMap = useRef<Map<number, keyof typeof activeButtons>>(new Map());
  const nextButtonIndexRef = useRef(0);
  
  // Debug mode to see raw controller input
  const [debugMode, setDebugMode] = useState(true);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  
  // Phosphene vision state
  const [phospheneActive, setPhospheneActive] = useState(false);
  const [phospheneImage, setPhospheneImage] = useState<string | null>(null);
  const [fastAPIHealthy, setFastAPIHealthy] = useState<boolean | null>(null);
  const phospheneIntervalRef = useRef<number | null>(null);
  
  // Phosphene hooks
  const { captureFrameRaw } = useCameraCapture();
  const { captureDepthMapRaw } = useDepthCapture();
  const { processFrame, processing, error: phospheneError, lastResult, checkHealth } = usePhospheneVision();
  
  // WebSocket camera synchronization - mobile controls, desktop follows
  const { isConnected, updateCamera } = useCameraSync({
    clientType: 'mobile',
    enableDeviceMotion: true,
    throttleMs: 16  // 60fps
  });
  
  // Movement state for rocker control (reserved for future use)
  // const movementVelocityRef = useRef({ x: 0, z: 0 });
  
  // Check if certificate needs to be accepted
  useEffect(() => {
    if (!isConnected) {
      const timer = setTimeout(() => {
        setShowCertWarning(true);
      }, 3000); // Show warning after 3 seconds of failed connection
      return () => clearTimeout(timer);
    } else {
      setShowCertWarning(false);
    }
  }, [isConnected]);
  
  // Enable buffer debugging (only in development)
  useFrameBuffer({
    logInterval: 1000,      // Log every second
    logPixelData: true,
    downsamplePercentage: 50
  });

  const {
    world,
    loadWorld,
  } = useScenarioWorld();

  const {
    clearAllTimers
  } = useComponentManager();

  useEffect(() => {
    loadWorld()
      .then(data => {
        console.log('Mobile - World loaded, entities:', data.entities.length, data.entities);
      })
      .catch(err => {
        console.error('Failed to load world:', err);
        alert('Error loading world. Make sure backend is running.');
      });

    // Cleanup on unmount
    return () => {
      clearAllTimers();
    };
  }, [loadWorld, clearAllTimers]);
  
  // Gamepad detection
  useEffect(() => {
    const onGamepadConnected = (e: GamepadEvent) => {
      console.log(`🎮 Gamepad connected: ${e.gamepad.id} (index ${e.gamepad.index})`);
      gamepadIndex.current = e.gamepad.index;
      setControllerStatus(`✅ ${e.gamepad.id}`);
      setDebugMode(false); // Exit debug mode when controller connects
    };
    
    const onGamepadDisconnected = (e: GamepadEvent) => {
      console.log(`🎮 Gamepad disconnected: ${e.gamepad.id}`);
      if (e.gamepad.index === gamepadIndex.current) {
        gamepadIndex.current = null;
        setControllerStatus('❌ Controller Disconnected');
      }
    };
    
    window.addEventListener('gamepadconnected', onGamepadConnected);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
    
    // Check for already connected gamepad
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        console.log(`🎮 Found existing gamepad: ${gamepads[i]?.id} (index ${i})`);
        gamepadIndex.current = i;
        setControllerStatus(`✅ ${gamepads[i]?.id}`);
        setDebugMode(false);
        break;
      }
    }
    
    return () => {
      window.removeEventListener('gamepadconnected', onGamepadConnected);
      window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
    };
  }, []);

  // WebXR Controller Detection (more powerful than Gamepad API)
  useEffect(() => {
    const checkWebXR = async () => {
      if ('xr' in navigator) {
        try {
          const isSupported = await (navigator as Navigator & { xr?: { isSessionSupported: (mode: string) => Promise<boolean> } }).xr?.isSessionSupported('immersive-vr');
          console.log(`🥽 WebXR VR supported: ${isSupported}`);
          
          if (isSupported) {
            console.log('💡 WebXR available - VR controllers can be accessed via WebXR session');
            setDebugLog(prev => [...prev, '🥽 WebXR supported - Enter VR to detect controllers']);
          }
        } catch (e) {
          console.log('⚠️ WebXR check failed:', e);
        }
      } else {
        console.log('❌ WebXR not available in this browser');
      }
    };
    
    checkWebXR();
  }, []);

  // Connect to phone controller server (Termux pygame)
  useEffect(() => {
    const connectToPhoneController = () => {
      const wsURL = `ws://localhost:8766`; // Phone's local pygame server
      
      console.log('🎮 Attempting to connect to phone controller server...');
      
      try {
        const ws = new WebSocket(wsURL);
        
        ws.onopen = () => {
          console.log('✅ Connected to phone controller server (pygame)');
          console.log('🕹️ Controller input via Termux + pygame');
          setControllerStatus('✅ VR Controller (Pygame)');
          setDebugMode(false); // Disable debug mode when pygame connected
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'controller_input') {
              // Receive raw axis values from pygame server
              const axis0 = data.axis0 || 0;
              const axis1 = data.axis1 || 0;
              
              // Apply deadzone
              const DEADZONE = 0.15;
              const x = Math.abs(axis0) > DEADZONE ? axis0 : 0;
              const y = Math.abs(axis1) > DEADZONE ? axis1 : 0;
              
              // Store for movement loop to use
              externalAxisRef.current = { x, y };
              
              // Optional: Handle buttons
              if (data.buttons && debugMode) {
                const pressedButtons = data.buttons
                  .map((pressed: boolean, i: number) => pressed ? `B${i}` : null)
                  .filter((b: string | null) => b !== null);
                if (pressedButtons.length > 0) {
                  console.log('🔘 Buttons:', pressedButtons.join(', '));
                }
              }
            }
          } catch (e) {
            console.error('Error parsing controller input:', e);
          }
        };
        
        ws.onerror = () => {
          console.log('⚠️ Phone controller server not available');
          console.log('📱 Start Termux server: python phone_controller_server.py');
          setControllerStatus('Touch/Keyboard');
        };
        
        ws.onclose = () => {
          console.log('🎮 Controller server disconnected');
          setControllerStatus('Touch/Keyboard');
          externalAxisRef.current = { x: 0, y: 0 }; // Reset axes
        };
        
        phoneControllerWS.current = ws;
      } catch {
        console.log('⚠️ Could not connect to phone controller server');
        console.log('📱 Make sure Termux server is running');
      }
    };
    
    // Try to connect after a short delay
    const timer = setTimeout(connectToPhoneController, 2000);
    
    return () => {
      clearTimeout(timer);
      if (phoneControllerWS.current) {
        phoneControllerWS.current.close();
      }
    };
  }, [debugMode]);

  // Handle controller detection on mount
  useEffect(() => {
    console.log('🎮 Controller Mode Active');
    console.log('📱 Controller button presses will be auto-mapped to movement');
    console.log('🔧 Watching for button presses...');
    console.log('');
    console.log('If your controller sends keyCode 0 (Unidentified):');
    console.log('  First button = Forward (W)');
    console.log('  Second button = Backward (S)');
    console.log('  Third button = Strafe Left (A)');
    console.log('  Fourth button = Strafe Right (D)');
    setControllerStatus('🎮 Keyboard/Controller (Auto-map)');
  }, []);

  // Keyboard event handling for controller in keyboard mode
  useEffect(() => {
    // Map keyboard keys to movement buttons
    // Common VR controller keyboard mappings:
    // Arrow keys, WASD, or custom keys depending on controller
    const keyToButton: Record<string, keyof typeof activeButtons> = {
      'w': 'w', 'W': 'w',
      'ArrowUp': 'w',
      'a': 'a', 'A': 'a', 
      'ArrowLeft': 'a',
      's': 's', 'S': 's',
      'ArrowDown': 's',
      'd': 'd', 'D': 'd',
      'ArrowRight': 'd',
      'q': 'q', 'Q': 'q',
      'PageUp': 'q',
      'e': 'e', 'E': 'e',
      'PageDown': 'e',
      ' ': 'w', // Space might be forward
      'Enter': 'w', // Enter might be forward
    };

    const buttonAssignmentOrder: Array<keyof typeof activeButtons> = ['w', 's', 'a', 'd'];

    const onKeyDown = (e: KeyboardEvent) => {
      let mappedButton: keyof typeof activeButtons | undefined;
      
      // DEBUG MODE: Log all key details
      if (debugMode) {
        const logEntry = `🎮 keyCode: ${e.keyCode} | key: "${e.key}" | code: "${e.code}" | which: ${e.which}`;
        console.log(logEntry);
        setDebugLog(prev => [...prev.slice(-9), logEntry]); // Keep last 10
      }
      
      // Try mapping by key name first
      mappedButton = keyToButton[e.key];
      
      // If "Unidentified" or no mapping, try keyCode
      if (!mappedButton && (e.key === 'Unidentified' || e.key === '')) {
        // Check if we've already mapped this keyCode
        if (unidentifiedKeyMap.current.has(e.keyCode)) {
          mappedButton = unidentifiedKeyMap.current.get(e.keyCode);
        } else if (!debugMode && nextButtonIndexRef.current < buttonAssignmentOrder.length) {
          // Only auto-map when NOT in debug mode
          mappedButton = buttonAssignmentOrder[nextButtonIndexRef.current];
          unidentifiedKeyMap.current.set(e.keyCode, mappedButton);
          console.log(`🎮 Auto-mapped keyCode ${e.keyCode} → Button "${mappedButton}"`);
          nextButtonIndexRef.current++;
        }
      }
      
      if (mappedButton) {
        console.log(`🎮 Button ${mappedButton} pressed`);
        keyboardKeysPressed.current.add(e.key + e.keyCode); // Use combo to track
        setActiveButtons(prev => ({ ...prev, [mappedButton]: true }));
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      // Ignore keys when user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return; // Don't interfere with typing
      }

      let mappedButton: keyof typeof activeButtons | undefined = keyToButton[e.key];
      
      // Check unidentified key mappings
      if (!mappedButton && (e.key === 'Unidentified' || e.key === '')) {
        mappedButton = unidentifiedKeyMap.current.get(e.keyCode);
      }
      
      if (mappedButton) {
        const keyId = e.key + e.keyCode;
        keyboardKeysPressed.current.delete(keyId);
        
        // Only release if no other key is holding this button
        const stillPressed = Array.from(keyboardKeysPressed.current).some(k => {
          const otherMapped = keyToButton[k] || unidentifiedKeyMap.current.get(parseInt(k.replace(/\D/g, '')));
          return otherMapped === mappedButton;
        });
        
        if (!stillPressed) {
          setActiveButtons(prev => ({ ...prev, [mappedButton]: false }));
        }
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [debugMode]);

  // Additional event listeners for exotic controller inputs
  useEffect(() => {
    // Media keys (play, pause, next, previous)
    const onMediaKey = (details: MediaSessionActionDetails) => {
      console.log('🎵 Media key event:', details);
      setDebugLog(prev => [...prev.slice(-9), `🎵 Media: ${details.action || 'unknown'}`]);
    };

    // Pointer events (some controllers send these)
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'mouse') {
        console.log('🖱️ Pointer event:', e.pointerType, e.movementX, e.movementY);
        if (Math.abs(e.movementX) > 5 || Math.abs(e.movementY) > 5) {
          setDebugLog(prev => [...prev.slice(-9), `🖱️ Pointer (${e.pointerType}): Δ${e.movementX},${e.movementY}`]);
        }
      }
    };

    // Generic input events
    const onInput = (e: Event) => {
      console.log('📝 Input event:', e);
    };

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', onMediaKey);
        navigator.mediaSession.setActionHandler('pause', onMediaKey);
        navigator.mediaSession.setActionHandler('previoustrack', onMediaKey);
        navigator.mediaSession.setActionHandler('nexttrack', onMediaKey);
      } catch {
        console.log('Media session handlers not available');
      }
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('input', onInput);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('input', onInput);
    };
  }, [debugMode]);

  // Movement loop - handles gamepad and button input
  useEffect(() => {
    if (!rigRef.current?.el) return;

    const el = rigRef.current.el;
    const moveSpeed = 0.15;
    const deadzone = 0.3;
    
    const animate = () => {
      let targetVelocityX = 0;
      let targetVelocityZ = 0;
      
      // Get mobile's current Y rotation (yaw)
      const rotation = cameraRef.current?.el?.getAttribute('rotation');
      const yaw = rotation ? (rotation.y * Math.PI / 180) : 0;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      
      // Priority 1: External controller (pygame via WebSocket)
      const extAxis = externalAxisRef.current;
      if (Math.abs(extAxis.x) > 0.01 || Math.abs(extAxis.y) > 0.01) {
        // External pygame controller is active
        
        // Forward/Backward (axis1: negative = forward, positive = backward)
        if (extAxis.y < -0.01) {
          const speed = Math.abs(extAxis.y) * moveSpeed;
          targetVelocityX += sinYaw * speed;
          targetVelocityZ += cosYaw * speed;
        } else if (extAxis.y > 0.01) {
          const speed = Math.abs(extAxis.y) * moveSpeed;
          targetVelocityX -= sinYaw * speed;
          targetVelocityZ -= cosYaw * speed;
        }
        
        // Left/Right strafe (axis0: negative = left, positive = right)
        if (extAxis.x < -0.01) {
          const speed = Math.abs(extAxis.x) * moveSpeed;
          targetVelocityX -= cosYaw * speed;
          targetVelocityZ += sinYaw * speed;
        } else if (extAxis.x > 0.01) {
          const speed = Math.abs(extAxis.x) * moveSpeed;
          targetVelocityX += cosYaw * speed;
          targetVelocityZ -= sinYaw * speed;
        }
      }
      // Priority 2: Gamepad input (if connected and no external controller)
      else if (gamepadIndex.current !== null) {
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[gamepadIndex.current];
        
        if (gamepad && gamepad.axes.length >= 2) {
          const axis0 = gamepad.axes[0]; // Horizontal
          const axis1 = gamepad.axes[1]; // Vertical
          
          // Debug: Log axes values when they move
          if (Math.abs(axis0) > 0.1 || Math.abs(axis1) > 0.1) {
            console.log(`🎮 Gamepad axes: [${axis0.toFixed(2)}, ${axis1.toFixed(2)}]`);
          }
          
          // Forward/Backward
          if (axis1 < -deadzone) {
            const speed = Math.abs(axis1) * moveSpeed;
            targetVelocityX += sinYaw * speed;
            targetVelocityZ += cosYaw * speed;
          } else if (axis1 > deadzone) {
            const speed = Math.abs(axis1) * moveSpeed;
            targetVelocityX -= sinYaw * speed;
            targetVelocityZ -= cosYaw * speed;
          }
          
          // Left/Right strafe
          if (axis0 < -deadzone) {
            const speed = Math.abs(axis0) * moveSpeed;
            targetVelocityX -= cosYaw * speed;
            targetVelocityZ += sinYaw * speed;
          } else if (axis0 > deadzone) {
            const speed = Math.abs(axis0) * moveSpeed;
            targetVelocityX += cosYaw * speed;
            targetVelocityZ -= sinYaw * speed;
          }
        }
      }
      
      // Button input (touch controls)
      if (activeButtons.w) {
        targetVelocityX += sinYaw * moveSpeed;
        targetVelocityZ += cosYaw * moveSpeed;
      }
      if (activeButtons.s) {
        targetVelocityX -= sinYaw * moveSpeed;
        targetVelocityZ -= cosYaw * moveSpeed;
      }
      if (activeButtons.a) {
        targetVelocityX -= cosYaw * moveSpeed;
        targetVelocityZ += sinYaw * moveSpeed;
      }
      if (activeButtons.d) {
        targetVelocityX += cosYaw * moveSpeed;
        targetVelocityZ -= sinYaw * moveSpeed;
      }
      if (activeButtons.q) {
        targetPosition.current.y += 0.05;
      }
      if (activeButtons.e) {
        targetPosition.current.y -= 0.05;
      }
      
      // Apply movement directly (no smoothing)
      const hasInput = targetVelocityX !== 0 || targetVelocityZ !== 0 || activeButtons.q || activeButtons.e;
      
      if (hasInput) {
        targetPosition.current.x += targetVelocityX;
        targetPosition.current.z += targetVelocityZ;
      }
      
      // Always update camera position (not just when moving)
      el.object3D.position.set(
        targetPosition.current.x,
        targetPosition.current.y,
        targetPosition.current.z
      );
      
      // Only broadcast when there's input
      if (hasInput) {
        updateCamera({
          position: { ...targetPosition.current },
          rotation: { x: 0, y: 0, z: 0 }
        });
        
        setCameraPosition(targetPosition.current);
      }
      
      animationFrameId.current = requestAnimationFrame(animate);
    };
    
    animationFrameId.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [activeButtons, updateCamera]);

  // Initialize camera rig position on mount
  useEffect(() => {
    if (rigRef.current?.el) {
      rigRef.current.el.setAttribute('position', { x: 0, y: 2, z: 0 });
    }
  }, []);
  
  // Check FastAPI health on mount
  useEffect(() => {
    const checkAPIHealth = async () => {
      const healthy = await checkHealth();
      setFastAPIHealthy(healthy);
    };
    checkAPIHealth();
  }, [checkHealth]);

  // Phosphene vision capture loop
  useEffect(() => {
    if (!phospheneActive) {
      if (phospheneIntervalRef.current) {
        clearInterval(phospheneIntervalRef.current);
        phospheneIntervalRef.current = null;
      }
      return;
    }

    const captureAndProcess = async () => {
      if (processing) return;

      try {
        // Await async captures
        const rgbBase64 = await captureFrameRaw(0.8);
        const depthBase64 = await captureDepthMapRaw();

        if (!rgbBase64 || !depthBase64) {
          console.warn('Failed to capture frame or depth');
          return;
        }

        console.log(`[Phosphene] Captured RGB: ${Math.round(rgbBase64.length / 1024)}KB, Depth: ${Math.round(depthBase64.length / 1024)}KB`);

        const result = await processFrame(rgbBase64, depthBase64, {
          depth_sampling: 'median',
          conf_threshold: 0.5,
          t_min: 0.3,
          k_min: 1,
          k_max: 5
        });

        if (result?.phosphene_image) {
          setPhospheneImage(`data:image/png;base64,${result.phosphene_image}`);
        }
      } catch (err) {
        console.error('Phosphene processing error:', err);
      }
    };

    // Start capture loop every 500ms
    phospheneIntervalRef.current = window.setInterval(captureAndProcess, 500);

    return () => {
      if (phospheneIntervalRef.current) {
        clearInterval(phospheneIntervalRef.current);
      }
    };
  }, [phospheneActive, processing, captureFrameRaw, captureDepthMapRaw, processFrame]);

  return (
    <div style={{ background: "Black", width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* Force VR button to be visible without scrolling */}
      <style>{`
        .a-enter-vr-button {
          bottom: 20% !important;
          position: fixed !important;
          z-index: 99999 !important;
        }
        body {
          overflow: hidden !important;
        }
      `}</style>

      {/* Certificate Warning Modal */}
      {showCertWarning && !isConnected && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#1e1e1e',
            color: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '400px',
            border: '2px solid #f44336'
          }}>
            <h2 style={{ margin: '0 0 16px 0', color: '#f44336' }}>🔒 SSL Certificate Required</h2>
            <p style={{ margin: '0 0 16px 0', lineHeight: '1.5' }}>
              The backend uses a self-signed HTTPS certificate. You need to accept it first.
            </p>
            <ol style={{ margin: '0 0 16px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li>Click the button below to open the backend</li>
              <li>Accept the security warning (click "Advanced" → "Proceed")</li>
              <li>Return here and refresh the page</li>
            </ol>
            <a 
              href={SOCKET_URL + '/health'} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{
                display: 'block',
                background: '#4CAF50',
                color: 'white',
                padding: '12px',
                textAlign: 'center',
                textDecoration: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
                marginBottom: '8px'
              }}
            >
              Open Backend & Accept Certificate
            </a>
            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%',
                background: '#2196F3',
                color: 'white',
                padding: '12px',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              ↻ Refresh Page
            </button>
          </div>
        </div>
      )}
      
      {/* WebSocket Connection Status */}
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        background: isConnected ? '#4CAF50' : '#f44336',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.8 }}>
          {SOCKET_URL}
        </div>
      </div>
      
      {/* Controller Status */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        background: controllerStatus.includes('✅') ? '#4CAF50' : '#FF9800',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '4px',
        fontSize: '11px',
        fontFamily: 'monospace'
      }}>
        🎮 {controllerStatus}
      </div>
      
      {/* Debug Mode Toggle & Log */}
      {debugMode && (
        <div style={{
          position: 'absolute',
          top: 50,
          left: 10,
          right: 10,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.9)',
          color: '#0f0',
          padding: '10px',
          borderRadius: '8px',
          fontSize: '10px',
          fontFamily: 'monospace',
          maxHeight: '200px',
          overflow: 'auto',
          border: '2px solid #0f0'
        }}>
          <div style={{ marginBottom: '8px', color: '#ff0', fontWeight: 'bold' }}>
            🔍 DEBUG MODE - Press controller buttons to see keyCodes
          </div>
          {debugLog.map((log, i) => (
            <div key={i} style={{ margin: '2px 0' }}>{log}</div>
          ))}
          <button
            onClick={() => setDebugMode(false)}
            style={{
              marginTop: '8px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '10px'
            }}
          >
            ✅ Done - Start Mapping
          </button>
        </div>
      )}
      
      {/* Phosphene Vision Toggle */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        left: 10,
        zIndex: 1000
      }}>
        {/* FastAPI Status Indicator */}
        {fastAPIHealthy === false && (
          <div style={{
            background: '#f44336',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '11px',
            marginBottom: '8px',
            fontFamily: 'monospace'
          }}>
            ⚠️ FastAPI Not Available
            <div style={{ fontSize: '9px', marginTop: '4px' }}>
              Start: python phosphene_api.py
            </div>
          </div>
        )}
        
        <button
          onClick={() => setPhospheneActive(!phospheneActive)}
          disabled={fastAPIHealthy === false}
          style={{
            background: phospheneActive ? '#f44336' : fastAPIHealthy === false ? '#999' : '#4CAF50',
            color: 'white',
            padding: '12px 20px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: fastAPIHealthy === false ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            opacity: fastAPIHealthy === false ? 0.5 : 1
          }}
        >
          {phospheneActive ? '🛑 Stop Phosphene' : '▶️ Start Phosphene'}
        </button>
        {phospheneActive && (
          <div style={{
            marginTop: '8px',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontFamily: 'monospace'
          }}>
            <div>Status: {processing ? '⏳ Processing...' : '✓ Active'}</div>
            {lastResult && (
              <>
                <div>Detections: {lastResult.metadata.detection_count}</div>
                <div>Time: {lastResult.metadata.timing_breakdown.total_ms.toFixed(0)}ms</div>
              </>
            )}
            {phospheneError && <div style={{ color: '#ff5555' }}>Error: {phospheneError}</div>}
          </div>
        )}
      </div>
      
      {/* Camera Position Display */}
      <div style={{
        position: 'absolute',
        top: 50,
        right: 10,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '8px',
        borderRadius: '4px',
        fontSize: '10px',
        fontFamily: 'monospace'
      }}>
        <div>X: {cameraPosition.x.toFixed(2)}</div>
        <div>Y: {cameraPosition.y.toFixed(2)}</div>
        <div>Z: {cameraPosition.z.toFixed(2)}</div>
      </div>
      
      {/* Phosphene Overlay - Full Screen */}
      {phospheneActive && phospheneImage && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 500,
          pointerEvents: 'none'
        }}>
          <img
            src={phospheneImage}
            alt="Phosphene Vision"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        </div>
      )}
      
      {/* Mobile Control Panel */}
      <div style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px'
        }}>
          {/* Top row: W */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onTouchStart={() => setActiveButtons(prev => ({ ...prev, w: true }))}
              onTouchEnd={() => setActiveButtons(prev => ({ ...prev, w: false }))}
              onMouseDown={() => setActiveButtons(prev => ({ ...prev, w: true }))}
              onMouseUp={() => setActiveButtons(prev => ({ ...prev, w: false }))}
              style={{
                width: '60px',
                height: '60px',
                background: activeButtons.w ? '#4CAF50' : 'rgba(255,255,255,0.2)',
                border: '2px solid white',
                borderRadius: '8px',
                color: 'white',
                fontSize: '20px',
                fontWeight: 'bold',
                cursor: 'pointer',
                userSelect: 'none',
                touchAction: 'none'
              }}
            >
              ▲<br/><span style={{ fontSize: '12px' }}>W</span>
            </button>
          </div>
          
          {/* Middle row: A S D */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onTouchStart={() => setActiveButtons(prev => ({ ...prev, a: true }))}
              onTouchEnd={() => setActiveButtons(prev => ({ ...prev, a: false }))}
              onMouseDown={() => setActiveButtons(prev => ({ ...prev, a: true }))}
              onMouseUp={() => setActiveButtons(prev => ({ ...prev, a: false }))}
              style={{
                width: '60px',
                height: '60px',
                background: activeButtons.a ? '#4CAF50' : 'rgba(255,255,255,0.2)',
                border: '2px solid white',
                borderRadius: '8px',
                color: 'white',
                fontSize: '20px',
                fontWeight: 'bold',
                cursor: 'pointer',
                userSelect: 'none',
                touchAction: 'none'
              }}
            >
              ◄<br/><span style={{ fontSize: '12px' }}>A</span>
            </button>
            <button
              onTouchStart={() => setActiveButtons(prev => ({ ...prev, s: true }))}
              onTouchEnd={() => setActiveButtons(prev => ({ ...prev, s: false }))}
              onMouseDown={() => setActiveButtons(prev => ({ ...prev, s: true }))}
              onMouseUp={() => setActiveButtons(prev => ({ ...prev, s: false }))}
              style={{
                width: '60px',
                height: '60px',
                background: activeButtons.s ? '#4CAF50' : 'rgba(255,255,255,0.2)',
                border: '2px solid white',
                borderRadius: '8px',
                color: 'white',
                fontSize: '20px',
                fontWeight: 'bold',
                cursor: 'pointer',
                userSelect: 'none',
                touchAction: 'none'
              }}
            >
              ▼<br/><span style={{ fontSize: '12px' }}>S</span>
            </button>
            <button
              onTouchStart={() => setActiveButtons(prev => ({ ...prev, d: true }))}
              onTouchEnd={() => setActiveButtons(prev => ({ ...prev, d: false }))}
              onMouseDown={() => setActiveButtons(prev => ({ ...prev, d: true }))}
              onMouseUp={() => setActiveButtons(prev => ({ ...prev, d: false }))}
              style={{
                width: '60px',
                height: '60px',
                background: activeButtons.d ? '#4CAF50' : 'rgba(255,255,255,0.2)',
                border: '2px solid white',
                borderRadius: '8px',
                color: 'white',
                fontSize: '20px',
                fontWeight: 'bold',
                cursor: 'pointer',
                userSelect: 'none',
                touchAction: 'none'
              }}
            >
              ►<br/><span style={{ fontSize: '12px' }}>D</span>
            </button>
          </div>
          
          {/* Bottom row: Q E (up/down) */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onTouchStart={() => setActiveButtons(prev => ({ ...prev, q: true }))}
              onTouchEnd={() => setActiveButtons(prev => ({ ...prev, q: false }))}
              onMouseDown={() => setActiveButtons(prev => ({ ...prev, q: true }))}
              onMouseUp={() => setActiveButtons(prev => ({ ...prev, q: false }))}
              style={{
                width: '90px',
                height: '50px',
                background: activeButtons.q ? '#4CAF50' : 'rgba(255,255,255,0.2)',
                border: '2px solid white',
                borderRadius: '8px',
                color: 'white',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                userSelect: 'none',
                touchAction: 'none'
              }}
            >
              ⬆ Q (Up)
            </button>
            <button
              onTouchStart={() => setActiveButtons(prev => ({ ...prev, e: true }))}
              onTouchEnd={() => setActiveButtons(prev => ({ ...prev, e: false }))}
              onMouseDown={() => setActiveButtons(prev => ({ ...prev, e: true }))}
              onMouseUp={() => setActiveButtons(prev => ({ ...prev, e: false }))}
              style={{
                width: '90px',
                height: '50px',
                background: activeButtons.e ? '#4CAF50' : 'rgba(255,255,255,0.2)',
                border: '2px solid white',
                borderRadius: '8px',
                color: 'white',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                userSelect: 'none',
                touchAction: 'none'
              }}
            >
              ⬇ E (Down)
            </button>
          </div>
        </div>
      
      <Scene
        embedded
        vr-mode-ui="enabled: true"
        device-orientation-permission-ui="enabled: true"
        fog="type: linear; color: #111; near: 50; far: 200"
        style={{ width: "100%", height: "100%" }}
      >
        {/* Sky background */}
        <Entity primitive="a-sky" color="#87CEEB" />
        
        <Entity light={{ type: "ambient", color: "#ffffff", intensity: 0.8 }} />
        <Entity
          light={{ type: "directional", color: "#ffffff", intensity: 1.0 }}
          position="5 10 2"
        />
        <Entity
          light={{ type: "directional", color: "#ffffff", intensity: 0.9 }}
          position="0 2 -6"
        />

        {/* Ground plane with grid pattern for movement visualization */}
        <Entity
          primitive="a-plane"
          position="0 -1 -4"
          rotation="-90 0 0"
          width="1000"
          height="1000"
          color="#2a5a2a"
          material="src: url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDEwIDAgTCAwIDAgMCAxMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMWE0YTFhIiBzdHJva2Utd2lkdGg9IjAuNSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=); repeat: 100 100"
        />

        {/* Render entities from backend */}
        {world.entities.map((e) => {
            const pos = e.Position || { x: 0, y: 0, z: 0 };
            const rot = e.Rotation || { x: 0, y: 0, z: 0 };
            const scl = e.Scale || { x: 1, y: 1, z: 1 };
            const color = e.Color?.value || "#fff";
            const url = e.Model?.url;

            console.log("Rendering entity:", e);
            console.log("Rendering url:", url);

            if (url === "Aframe") {
              const tag = `a-${e.name.toLowerCase()}`; // e.g. Sphere -> a-sphere
              console.log("Rendering primitive tag:", tag);
              return (
                <Entity
                  key={e.id}
                  primitive={tag}
                  position={`${pos.x} ${pos.y} ${pos.z}`}
                  rotation={`${rot.x} ${rot.y} ${rot.z}`}
                  scale={`${scl.x} ${scl.y} ${scl.z}`}
                  material={`color: ${color}`}
                />
              );
            }

            // GLTF Model entity
            console.log("Rendering GLTF model:", url);
            return (
              <Entity
                key={e.id}
                gltf-model={url}
                position={`${pos.x} ${pos.y} ${pos.z}`}
                rotation={`${rot.x} ${rot.y} ${rot.z}`}
                scale={`${scl.x} ${scl.y} ${scl.z}`}
              />
            );
          })}

        {/* Camera rig for movement (works in VR and normal mode) */}
        <Entity ref={rigRef}>
          <Entity
            ref={cameraRef}
            primitive="a-camera"
            look-controls="enabled: true; touchEnabled: true; magicWindowTrackingEnabled: true; pointerLockEnabled: false"
          >
            {/* VR cursor for interaction */}
            <Entity
              primitive="a-cursor"
              animation__click="property: scale; startEvents: click; from: 0.1 0.1 0.1; to: 1 1 1; dur: 150"
              material="color: white; shader: flat"
            />
          </Entity>
        </Entity>
      </Scene>
    </div>
  );
}

export default MobileView;