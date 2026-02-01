import { useEffect, useRef } from "react";
import "aframe";
import type { THREE } from "aframe";

type ASceneEl = HTMLElement & {
  renderer?: THREE.WebGLRenderer;
  hasLoaded?: boolean;
  camera?: THREE.Camera;
  object3D?: THREE.Scene;
};

// --- CACHED OBJECTS (Prevents GC Lag) ---
let cachedDepthTarget: THREE.WebGLRenderTarget | null = null;
let cachedDepthMaterial: THREE.ShaderMaterial | null = null;
let encodingCanvas: HTMLCanvasElement | null = null; // Reused for depth encoding if needed
let folderHandle: FileSystemDirectoryHandle | null = null;

export async function getFolderHandle() {
  if (folderHandle) return folderHandle;
  try {
    folderHandle = await (window as any).showDirectoryPicker();
  } catch (err) {
    console.warn("⚠️ Folder not selected or access denied", err);
    folderHandle = null;
  }
  return folderHandle;
}

export const useFrameBuffer = (options?: {
  enabled?: boolean;
  logInterval?: number;
  logPixelData?: boolean;
  downsamplePercentage?: number;
  // UPDATE: Accepts raw buffer
  onFrame?: (pixelBuffer: Uint8Array, width: number, height: number, depthBlob: Blob | null) => void;
}) => {
  const frameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const cleanupFnsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (options?.enabled === false) return;

    const LOG_INTERVAL = options?.logInterval ?? 100;
    const LOG_PIXEL_DATA = options?.logPixelData ?? false;
    const SHOULD_CAPTURE = LOG_PIXEL_DATA || !!options?.onFrame;

    const setupDebug = () => {
      if (isInitializedRef.current) return;

      const sceneEl = document.querySelector("a-scene") as ASceneEl;
      if (!sceneEl) { setTimeout(setupDebug, 200); return; }

      const checkRenderer = () => {
        const renderer = (sceneEl as any).renderer;
        if (!renderer) { setTimeout(checkRenderer, 200); return; }

        const gl = renderer.getContext() as WebGLRenderingContext;
        if (!gl) return;

        isInitializedRef.current = true;
        let lastLog = 0;

        const loop = () => {
          const now = performance.now();

          if (now - lastLog > LOG_INTERVAL) {
            lastLog = now;

            if (SHOULD_CAPTURE) {
              requestAnimationFrame(async () => {
                try {
                  const width = renderer.domElement.width;
                  const height = renderer.domElement.height;

                  // --- 1. HIDE HUD & SETUP ---
                  const hiddenObjects = toggleHudVisibility(sceneEl.object3D, false);
                  const originalAutoClear = renderer.autoClear;
                  renderer.autoClear = false;
                  renderer.clear(true, true, true);

                  // --- 2. RENDER SCENE ---
                  if (sceneEl.object3D && sceneEl.camera) {
                      renderer.render(sceneEl.object3D, sceneEl.camera);
                  }

                  // --- 3. READ PIXELS (FULL RESOLUTION FIRST) ---
                  const fullPixelBuffer = new Uint8Array(width * height * 4);
                  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, fullPixelBuffer);

                  // --- 4. DOWNSAMPLE RGB TO MATCH DEPTH ---
                  const percentage = options?.downsamplePercentage ?? 50;
                  const step = Math.max(1, Math.floor(100 / percentage));
                  const downsampledWidth = Math.ceil(width / step);
                  const downsampledHeight = Math.ceil(height / step);
                  const pixelBuffer = downsampleRGBA(fullPixelBuffer, width, height, step);

                  // --- 5. CAPTURE DEPTH (ALREADY DOWNSAMPLED INSIDE) ---
                  const depthData = readDepthBuffer(gl, renderer, sceneEl, width, height, percentage);

                  // --- 6. RESTORE HUD ---
                  renderer.autoClear = originalAutoClear;
                  toggleHudVisibility(sceneEl.object3D, true, hiddenObjects);
                  
                  // Render again so user sees HUD
                  if (sceneEl.object3D && sceneEl.camera) {
                      renderer.render(sceneEl.object3D, sceneEl.camera);
                  }

                  // --- 7. PROCESS DEPTH (Optional/Legacy) ---
                  let depthBlob: Blob | null = null;
                  if (depthData) {
                       const depthRGBA = convertDepthToRGBA(depthData);
                       depthBlob = await pixelsToBlob(depthRGBA, depthData.width, depthData.height);
                  }

                  // --- 8. SEND DOWNSAMPLED BUFFERS (RGB + DEPTH SAME SIZE) ---
                  if (options?.onFrame) {
                    // Send downsampled RGB buffer with downsampled dimensions
                    options.onFrame(pixelBuffer, downsampledWidth, downsampledHeight, depthBlob);
                  }

                  if (LOG_PIXEL_DATA) {
                    // Logic for saving debug frames (optional)
                    // ... (Using pixelBuffer directly if needed for debug)
                  }

                } catch (err) {
                  console.error("[FrameCapture Error]", err);
                }
              });
            }
          }
          frameIdRef.current = requestAnimationFrame(loop);
        };
        frameIdRef.current = requestAnimationFrame(loop);
      };
      checkRenderer();
    };

    const timeoutId = setTimeout(setupDebug, 100);
    cleanupFnsRef.current.push(() => clearTimeout(timeoutId));

    return () => {
      if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
      isInitializedRef.current = false;
      cleanupFnsRef.current.forEach(fn => fn());
      cleanupFnsRef.current = [];
    };
  }, [options?.enabled, options?.logInterval, options?.onFrame]);
};

// --- HELPERS ---

function downsampleRGBA(fullBuffer: Uint8Array, width: number, height: number, step: number): Uint8Array {
  const newWidth = Math.ceil(width / step);
  const newHeight = Math.ceil(height / step);
  const downsampled = new Uint8Array(newWidth * newHeight * 4);
  
  let writeIdx = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const srcIdx = (y * width + x) * 4;
      downsampled[writeIdx++] = fullBuffer[srcIdx];     // R
      downsampled[writeIdx++] = fullBuffer[srcIdx + 1]; // G
      downsampled[writeIdx++] = fullBuffer[srcIdx + 2]; // B
      downsampled[writeIdx++] = fullBuffer[srcIdx + 3]; // A
    }
  }
  
  return downsampled;
}

function readDepthBuffer(gl: any, renderer: any, sceneEl: any, width: number, height: number, percentage: number) {
  try {
    const camera = sceneEl.camera;
    const scene = sceneEl.object3D;
    const THREE = (window as any).THREE;

    // 1. Reuse Material
    if (!cachedDepthMaterial) {
      cachedDepthMaterial = new THREE.ShaderMaterial({
        vertexShader: `
          varying float vDepth;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vDepth = -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying float vDepth;
          uniform float near;
          uniform float far;
          void main() {
            float depth = (vDepth - near) / (far - near);
            depth = clamp(depth, 0.0, 1.0);
            depth = 1.0 - depth;
            gl_FragColor = vec4(vec3(depth), 1.0);
          }
        `,
        uniforms: { near: { value: 0.1 }, far: { value: 10 } },
        side: THREE.DoubleSide
      });
    }
    if (cachedDepthMaterial) {
      cachedDepthMaterial.uniforms.near.value = camera.near || 0.1;
    }

    // 2. Reuse Target
    if (!cachedDepthTarget || cachedDepthTarget.width !== width || cachedDepthTarget.height !== height) {
      cachedDepthTarget?.dispose();
      cachedDepthTarget = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
      });
    }

    // 3. Render
    scene.traverse((obj: any) => {
        if (obj.isMesh && !obj.el?.classList?.contains("depth-ignore")) {
            obj.userData.originalMat = obj.material;
            obj.material = cachedDepthMaterial;
        }
    });

    const originalTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(cachedDepthTarget);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.setRenderTarget(originalTarget);

    // Restore materials
    scene.traverse((obj: any) => {
        if (obj.userData.originalMat) {
            obj.material = obj.userData.originalMat;
            delete obj.userData.originalMat;
        }
    });

    // 4. Read Pixels
    const depthPixels = new Uint8Array(width * height * 4);
    // FIX: Read from cachedDepthTarget, NOT depthTarget
    renderer.readRenderTargetPixels(cachedDepthTarget, 0, 0, width, height, depthPixels);

    // DO NOT DISPOSE HERE! (We want to reuse them)

    // 5. Downsample
    const step = Math.max(1, Math.floor(100 / percentage));
    const newWidth = Math.ceil(width / step);
    const newHeight = Math.ceil(height / step);
    const grayscaleDepth = new Uint8Array(newWidth * newHeight);
    
    let writeIdx = 0;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        grayscaleDepth[writeIdx++] = depthPixels[(y * width + x) * 4];
      }
    }

    return { data: grayscaleDepth, width: newWidth, height: newHeight };
  } catch (err) { 
    console.error("Depth read error", err);
    return null; 
  }
}

function toggleHudVisibility(scene: any, visible: boolean, specificObjects: any[] = []): any[] {
    const affected: any[] = [];
    if (specificObjects.length > 0) {
        specificObjects.forEach(obj => obj.visible = visible);
        return [];
    } else {
        scene.traverse((obj: any) => {
            let isHud = false;
            let curr = obj;
            while(curr) {
                if (curr.el && curr.el.classList && curr.el.classList.contains('hud-ignore')) {
                    isHud = true; break;
                }
                curr = curr.parent;
            }
            if (isHud && obj.visible !== visible) {
                obj.visible = visible;
                affected.push(obj);
            }
        });
        return affected;
    }
}

function convertDepthToRGBA(depthData: { data: Uint8Array, width: number, height: number }) {
    const depthRGBA = new Uint8Array(depthData.width * depthData.height * 4);
    for (let i = 0; i < depthData.data.length; i++) {
        const val = depthData.data[i];
        depthRGBA[i * 4] = val; depthRGBA[i * 4 + 1] = val; depthRGBA[i * 4 + 2] = val; depthRGBA[i * 4 + 3] = 255;
    }
    return depthRGBA;
}

async function pixelsToBlob(data: Uint8Array, width: number, height: number): Promise<Blob | null> {
  // Reuse canvas if possible
  if (!encodingCanvas) encodingCanvas = document.createElement("canvas");
  encodingCanvas.width = width;
  encodingCanvas.height = height;
  const ctx = encodingCanvas.getContext("2d");
  if (!ctx) return null;

  const clampedData = new Uint8ClampedArray(data);
  const imgData = new ImageData(clampedData, width, height);
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  tempCanvas.getContext("2d")?.putImageData(imgData, 0, 0);

  ctx.save();
  ctx.scale(1, -1);
  ctx.drawImage(tempCanvas, 0, -height);
  ctx.restore();

  return new Promise((resolve) => encodingCanvas!.toBlob(resolve, "image/jpeg", 0.7));
}

