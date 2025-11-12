import { useEffect, useRef } from 'react';
import 'aframe';
import type { THREE } from 'aframe';

// Define type for A-Frame Scene element
type ASceneEl = HTMLElement & {
  renderer?: THREE.WebGLRenderer;
  hasLoaded?: boolean;
  camera?: THREE.Camera;
  object3D?: THREE.Scene;
};

/**
 * Logs A-Frame / Three.js WebGL buffer info when the scene is ready.
 * Works with aframe-react by querying the DOM for the a-scene element.
 *
 * ⚠️ Logs every 2 seconds – use only for debugging (not production).
 * 
 * @param options - Configuration options
 */
export const useFrameBuffer = (
  options?: {
    enabled?: boolean;
    logInterval?: number;
    logPixelData?: boolean;
  }
) => {
  const frameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const cleanupFnsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    // Skip if disabled
    if (options?.enabled === false) return;

    const LOG_INTERVAL = options?.logInterval ?? 2000;
    const LOG_PIXEL_DATA = options?.logPixelData ?? false;

    const setupDebug = () => {
      if (isInitializedRef.current) {
        console.log('[A-Frame Debug] Already initialized, skipping');
        return;
      }

      // Query for a-scene element (aframe-react creates this)
      const sceneEl = document.querySelector('a-scene') as ASceneEl;
      
      if (!sceneEl) {
        console.warn('[A-Frame Debug] a-scene element not found, retrying in 200ms...');
        setTimeout(setupDebug, 200);
        return;
      }

      console.log('[A-Frame Debug] Found a-scene element');

      // Check for renderer
      const checkRenderer = () => {
        const renderer = (sceneEl as any).renderer;
        
        if (!renderer) {
          console.warn('[A-Frame Debug] Renderer not ready, retrying in 200ms...');
          setTimeout(checkRenderer, 200);
          return;
        }

        const gl = renderer.getContext() as WebGLRenderingContext;
        if (!gl) {
          console.error('[A-Frame Debug] WebGL context not available');
          return;
        }

        isInitializedRef.current = true;
        console.log('[A-Frame Debug] ✓ Buffer monitoring started');

        let lastLog = 0;

        const loop = () => {
          const now = performance.now();
          
          if (now - lastLog > LOG_INTERVAL) {
            lastLog = now;
            
            try {
              // Buffer configuration
              const r = gl.getParameter(gl.RED_BITS);
              const g = gl.getParameter(gl.GREEN_BITS);
              const b = gl.getParameter(gl.BLUE_BITS);
              const a = gl.getParameter(gl.ALPHA_BITS);
              const depth = gl.getParameter(gl.DEPTH_BITS);
              const stencil = gl.getParameter(gl.STENCIL_BITS);
              
              // Viewport and canvas info
              const viewport = gl.getParameter(gl.VIEWPORT);
              const width = renderer.domElement.width;
              const height = renderer.domElement.height;
              const pixelRatio = window.devicePixelRatio || 1;
              
              console.group('[A-Frame Debug] 🎨 Buffer Info');
              console.log(`📊 Color Buffer: R:${r} G:${g} B:${b} A:${a} bits`);
              console.log(`📏 Depth Buffer: ${depth} bits`);
              console.log(`🎯 Stencil Buffer: ${stencil} bits`);
              console.log(`📐 Viewport: ${viewport[2]}x${viewport[3]}`);
              console.log(`🖼️  Canvas: ${width}x${height} (ratio: ${pixelRatio})`);
              
              // Optional: Sample pixel data from center of screen
              if (LOG_PIXEL_DATA) {
                const centerX = Math.floor(width / 2);
                const centerY = Math.floor(height / 2);
                const pixel = new Uint8Array(4);
                
                gl.readPixels(centerX, centerY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                console.log(`🎨 Center pixel RGBA: [${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${pixel[3]}]`);
              }
              
              // Memory info (if available)
              const debugInfo = renderer.info;
              if (debugInfo) {
                console.log(`🔢 Geometries: ${debugInfo.memory.geometries}`);
                console.log(`🖼️  Textures: ${debugInfo.memory.textures}`);
                console.log(`📦 Draw Calls: ${debugInfo.render.calls}`);
                console.log(`🔺 Triangles: ${debugInfo.render.triangles}`);
              }
              
              console.groupEnd();
            } catch (err) {
              console.error('[A-Frame Debug] ❌ Error reading buffer info:', err);
            }
          }
          
          frameIdRef.current = requestAnimationFrame(loop);
        };

        frameIdRef.current = requestAnimationFrame(loop);
      };

      // Start checking for renderer
      checkRenderer();
    };

    // Start setup with a small delay to let aframe-react mount
    const timeoutId = setTimeout(setupDebug, 100);
    cleanupFnsRef.current.push(() => clearTimeout(timeoutId));

    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
      isInitializedRef.current = false;
      
      // Run all cleanup functions
      cleanupFnsRef.current.forEach(fn => fn());
      cleanupFnsRef.current = [];
      
      console.log('[A-Frame Debug] ⏹️  Buffer monitoring stopped');
    };
  }, [options?.enabled, options?.logInterval, options?.logPixelData]);
};

// ============================================
// ALTERNATIVE: With manual scene query
// ============================================

/**
 * Version that lets you pass a custom scene selector
 */
export const useFrameBufferWithSelector = (
  selector: string = 'a-scene',
  options?: {
    enabled?: boolean;
    logInterval?: number;
    logPixelData?: boolean;
  }
) => {
  const frameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (options?.enabled === false) return;

    const LOG_INTERVAL = options?.logInterval ?? 2000;
    const LOG_PIXEL_DATA = options?.logPixelData ?? false;

    const setupDebug = () => {
      if (isInitializedRef.current) return;

      const sceneEl = document.querySelector(selector) as ASceneEl;
      
      if (!sceneEl) {
        console.warn(`[A-Frame Debug] Scene element "${selector}" not found, retrying...`);
        setTimeout(setupDebug, 200);
        return;
      }

      const checkRenderer = () => {
        const renderer = (sceneEl as any).renderer;
        
        if (!renderer) {
          setTimeout(checkRenderer, 200);
          return;
        }

        const gl = renderer.getContext() as WebGLRenderingContext;
        if (!gl) {
          console.error('[A-Frame Debug] WebGL context not available');
          return;
        }

        isInitializedRef.current = true;
        console.log(`[A-Frame Debug] ✓ Monitoring "${selector}"`);

        let lastLog = 0;

        const loop = () => {
          const now = performance.now();
          
          if (now - lastLog > LOG_INTERVAL) {
            lastLog = now;
            
            try {
              const r = gl.getParameter(gl.RED_BITS);
              const g = gl.getParameter(gl.GREEN_BITS);
              const b = gl.getParameter(gl.BLUE_BITS);
              const a = gl.getParameter(gl.ALPHA_BITS);
              const depth = gl.getParameter(gl.DEPTH_BITS);
              
              const width = renderer.domElement.width;
              const height = renderer.domElement.height;
              
              console.group('[A-Frame Debug] 🎨 Buffer Info');
              console.log(`Color: R:${r} G:${g} B:${b} A:${a} | Depth: ${depth} bits`);
              console.log(`Canvas: ${width}x${height}`);
              
              if (LOG_PIXEL_DATA) {
                const centerX = Math.floor(width / 2);
                const centerY = Math.floor(height / 2);
                const pixel = new Uint8Array(4);
                gl.readPixels(centerX, centerY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                console.log(`Center pixel: [${Array.from(pixel).join(', ')}]`);
              }
              
              console.groupEnd();
            } catch (err) {
              console.error('[A-Frame Debug] Error:', err);
            }
          }
          
          frameIdRef.current = requestAnimationFrame(loop);
        };

        frameIdRef.current = requestAnimationFrame(loop);
      };

      checkRenderer();
    };

    const timeoutId = setTimeout(setupDebug, 100);

    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
      clearTimeout(timeoutId);
      isInitializedRef.current = false;
    };
  }, [selector, options?.enabled, options?.logInterval, options?.logPixelData]);
};

// ============================================
// DEVELOPMENT-ONLY VERSION
// ============================================

/**
 * Only enables buffer debugging in development mode.
 * Safe to leave in production code.
 */
export const useFrameBufferDev = (
  options?: {
    logInterval?: number;
    logPixelData?: boolean;
  }
) => {
  const isDev = process.env.NODE_ENV === 'development';
  
  useFrameBuffer({
    ...options,
    enabled: isDev
  });
};

// ============================================
// USAGE EXAMPLES
// ============================================

/*
// Example 1: Simple usage (no ref needed!)
import { useFrameBuffer } from './useFrameBuffer';

function BuilderPage() {
  useFrameBuffer();
  
  return (
    <Scene embedded>
      <Entity primitive="a-box" />
    </Scene>
  );
}

// Example 2: Development only (recommended)
import { useFrameBufferDev } from './useFrameBuffer';

function BuilderPage() {
  useFrameBufferDev({
    logInterval: 3000,
    logPixelData: true
  });
  
  return <Scene embedded>...</Scene>;
}

// Example 3: Custom selector
import { useFrameBufferWithSelector } from './useFrameBuffer';

function BuilderPage() {
  useFrameBufferWithSelector('#my-scene', {
    enabled: true
  });
  
  return <Scene id="my-scene">...</Scene>;
}
*/