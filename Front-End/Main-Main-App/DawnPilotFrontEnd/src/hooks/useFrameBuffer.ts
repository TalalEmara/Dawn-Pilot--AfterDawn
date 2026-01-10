import { useEffect, useRef } from "react";
import "aframe";
import type { THREE } from "aframe";

type ASceneEl = HTMLElement & {
  renderer?: THREE.WebGLRenderer;
  hasLoaded?: boolean;
  camera?: THREE.Camera;
  object3D?: THREE.Scene;
};

let folderHandle: FileSystemDirectoryHandle | null = null;
let encodingCanvas: HTMLCanvasElement | null = null;

export async function getFolderHandle() {
  if (folderHandle) return folderHandle;
  try {
    folderHandle = await (window as any).showDirectoryPicker();
    console.log("✅ Folder selected:", folderHandle.name);
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
  onFrame?: (rgbBlob: Blob, depthBlob: Blob | null) => void;
}) => {
  const frameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const cleanupFnsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (options?.enabled === false) return;

    const LOG_INTERVAL = options?.logInterval ?? 2000;
    const LOG_PIXEL_DATA = options?.logPixelData ?? false;
    const SHOULD_CAPTURE = LOG_PIXEL_DATA || !!options?.onFrame;

    const setupDebug = () => {
      if (isInitializedRef.current) return;

      const sceneEl = document.querySelector("a-scene") as ASceneEl;
      if (!sceneEl) {
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
        if (!gl) return;

        isInitializedRef.current = true;
        console.log("[A-Frame Debug] ✓ Buffer monitoring started");

        let lastLog = 0;

        const loop = () => {
          const now = performance.now();

          if (now - lastLog > LOG_INTERVAL) {
            lastLog = now;

            if (SHOULD_CAPTURE) {
              requestAnimationFrame(() => {
                try {
                  const width = renderer.domElement.width;
                  const height = renderer.domElement.height;
                  const pixelData = new Uint8Array(width * height * 4);

                  // --- 1. HIDE HUD ---
                  // Hide objects with class 'hud-ignore'
                  const hiddenObjects = toggleHudVisibility(sceneEl.object3D, false);
                  
                  // --- 2. CLEAR BUFFER (CRITICAL FIX) ---
                  // Since preserveDrawingBuffer is true, we MUST manually clear 
                  // to remove the "Ghost" HUD from the previous frame.
                  const originalAutoClear = renderer.autoClear;
                  renderer.autoClear = false; // We handle clearing manually
                  renderer.clear(true, true, true); // Clear Color, Depth, Stencil

                  // --- 3. RENDER CLEAN WORLD ---
                  if (sceneEl.object3D && sceneEl.camera) {
                      renderer.render(sceneEl.object3D, sceneEl.camera);
                  }

                  // --- 4. CAPTURE PIXELS ---
                  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);

                  // --- 5. CAPTURE DEPTH (Optional) ---
                  const percentage = options?.downsamplePercentage ?? 50;
                  const depthData = readDepthBuffer(gl, renderer, sceneEl, width, height, percentage);

                  // --- 6. RESTORE HUD & SHOW USER ---
                  renderer.autoClear = originalAutoClear; // Restore settings
                  toggleHudVisibility(sceneEl.object3D, true, hiddenObjects);
                  
                  // Render again immediately so the user sees the HUD (no flickering)
                  if (sceneEl.object3D && sceneEl.camera) {
                      renderer.render(sceneEl.object3D, sceneEl.camera);
                  }

                  // --- PROCESS DATA ---
                  const rgbData = downsamplePixels(pixelData, width, height, percentage);

                  if (options?.onFrame) {
                    pixelsToBlob(rgbData.data, rgbData.width, rgbData.height).then(async rgbBlob => {
                      if (!rgbBlob) return;
                      let depthBlob: Blob | null = null;
                      if (depthData) {
                        const depthRGBA = convertDepthToRGBA(depthData);
                        depthBlob = await pixelsToBlob(depthRGBA, depthData.width, depthData.height);
                      }
                      options.onFrame!(rgbBlob, depthBlob);
                    });
                  }

                  if (LOG_PIXEL_DATA) {
                    saveFrameDataJSON(rgbData, depthData, Math.floor(now));
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

function toggleHudVisibility(scene: any, visible: boolean, specificObjects: any[] = []): any[] {
    const affected: any[] = [];
    
    if (specificObjects.length > 0) {
        specificObjects.forEach(obj => obj.visible = visible);
        return [];
    } else {
        scene.traverse((obj: any) => {
            // Check if this object or any parent has the 'hud-ignore' class
            let isHud = false;
            let curr = obj;
            while(curr) {
                if (curr.el && curr.el.classList && curr.el.classList.contains('hud-ignore')) {
                    isHud = true;
                    break;
                }
                curr = curr.parent;
            }

            if (isHud) {
                // If visibility matches current state, toggle it
                // We assume default state is visible=true
                if (obj.visible !== visible) {
                    obj.visible = visible;
                    affected.push(obj);
                }
            }
        });
        return affected;
    }
}

function convertDepthToRGBA(depthData: { data: Uint8Array, width: number, height: number }) {
    const depthRGBA = new Uint8Array(depthData.width * depthData.height * 4);
    for (let i = 0; i < depthData.data.length; i++) {
        const val = depthData.data[i];
        depthRGBA[i * 4] = val;
        depthRGBA[i * 4 + 1] = val;
        depthRGBA[i * 4 + 2] = val;
        depthRGBA[i * 4 + 3] = 255;
    }
    return depthRGBA;
}

function downsamplePixels(pixels: Uint8Array, width: number, height: number, percentage: number) {
  const step = Math.max(1, Math.floor(100 / percentage));
  const newWidth = Math.ceil(width / step);
  const newHeight = Math.ceil(height / step);
  const downsampled = new Uint8Array(newWidth * newHeight * 4);
  let writeIdx = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const readIdx = (y * width + x) * 4;
      downsampled[writeIdx++] = pixels[readIdx];
      downsampled[writeIdx++] = pixels[readIdx + 1];
      downsampled[writeIdx++] = pixels[readIdx + 2];
      downsampled[writeIdx++] = pixels[readIdx + 3];
    }
  }
  return { data: downsampled, width: newWidth, height: newHeight };
}

async function pixelsToBlob(data: Uint8Array, width: number, height: number): Promise<Blob | null> {
  if (!encodingCanvas) encodingCanvas = document.createElement("canvas");
  encodingCanvas.width = width;
  encodingCanvas.height = height;
  const ctx = encodingCanvas.getContext("2d");
  if (!ctx) return null;

  const clampedData = new Uint8ClampedArray(data.buffer);
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

function readDepthBuffer(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  renderer: any,
  sceneEl: ASceneEl,
  width: number,
  height: number,
  percentage: number
) {
  try {
    const camera = sceneEl.camera;
    const scene = sceneEl.object3D;
    
    if (!camera || !scene) {
      console.warn("Camera or scene not available for depth reading");
      return null;
    }

    const THREE = (window as any).THREE;
    if (!THREE) {
      console.warn("THREE.js not available on window");
      return null;
    }

    // CRITICAL: Force complete matrix update
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    
    if (camera.updateProjectionMatrix) {
      camera.updateProjectionMatrix();
    }

    // Use camera's actual near/far, but override far for better depth visualization
    const near = (camera as any).near || 0.1;
    const originalFar = (camera as any).far || 1000;
    
    // CRITICAL FIX: Use a reasonable far plane for depth visualization
    // Instead of 10000, use something closer to actual scene scale (e.g., 50)
    const visualizationFar = 10; // Adjust this based on your scene size
    
    const cameraWorldPos = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPos);
    const cameraWorldDir = new THREE.Vector3();
    camera.getWorldDirection(cameraWorldDir);
    
    console.log(`📷 Camera near: ${near}, original far: ${originalFar}, visualization far: ${visualizationFar}`);
    console.log(`📷 Camera world position:`, cameraWorldPos);
    console.log(`📷 Camera world direction:`, cameraWorldDir);

    // Create depth shader with better normalization
    const depthMaterial = new THREE.ShaderMaterial({
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
          // Normalize depth to 0-1 range
          float depth = (vDepth - near) / (far - near);
          depth = clamp(depth, 0.0, 1.0);
          
          // Invert so closer = brighter (optional, but often more intuitive)
          depth = 1.0 - depth;
          
          gl_FragColor = vec4(vec3(depth), 1.0);
        }
      `,
      uniforms: {
        near: { value: near },
        far: { value: visualizationFar } // Use the shorter range
      },
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true
    });
    
    // Store original materials
    const originalMaterials = new Map();
    let meshCount = 0;
    let minDist = Infinity, maxDist = 0;
    
    scene.traverse((obj: any) => {
      if (obj.isMesh) {
        // SKIP meshes marked with 'depth-ignore' class
        if (obj.el?.classList?.contains('depth-ignore')) {
          return;
        }

        obj.updateMatrixWorld(true);
        originalMaterials.set(obj, obj.material);
        
        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);
        
        const toObject = worldPos.clone().sub(cameraWorldPos);
        const dotProduct = toObject.dot(cameraWorldDir);
        const distance = worldPos.distanceTo(cameraWorldPos);
        
        if (distance < minDist) minDist = distance;
        if (distance > maxDist) maxDist = distance;
        
        console.log(`  - Mesh: ${obj.name || 'unnamed'}, geometry: ${obj.geometry?.type}`);
        console.log(`    world position:`, worldPos);
        console.log(`    distance: ${distance.toFixed(2)}, in front: ${dotProduct > 0}`);
        
        obj.material = depthMaterial;
        obj.material.needsUpdate = true;
        meshCount++;
      }
    });
    
    console.log(`🎯 Processing ${meshCount} meshes for depth`);
    console.log(`📏 Distance range: ${minDist.toFixed(2)} - ${maxDist.toFixed(2)}`);
    
    if (maxDist > visualizationFar) {
      console.warn(`⚠️  Objects are farther (${maxDist.toFixed(2)}) than visualization far (${visualizationFar}). Consider increasing visualizationFar.`);
    }

    // Create render target
    const depthTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });

    // Render with depth shader
    const originalTarget = renderer.getRenderTarget();
    const originalAutoClear = renderer.autoClear;
    
    renderer.autoClear = false;
    renderer.setRenderTarget(depthTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, true);
    
    camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    
    renderer.render(scene, camera);
    
    renderer.setRenderTarget(originalTarget);
    renderer.autoClear = originalAutoClear;

    // Restore materials
    originalMaterials.forEach((material, obj) => {
      obj.material = material;
      obj.material.needsUpdate = true;
    });

    // Read pixels
    const depthPixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(depthTarget, 0, 0, width, height, depthPixels);

    // Check depth data
    let minVal = 255, maxVal = 0, nonZeroCount = 0;
    let sampleValues: number[] = [];
    
    for (let i = 0; i < depthPixels.length; i += 4) {
      const val = depthPixels[i];
      if (val > 0) nonZeroCount++;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
      
      if (sampleValues.length < 10 && val > 0) {
        sampleValues.push(val);
      }
    }
    
    console.log(`📊 Depth stats - min: ${minVal}, max: ${maxVal}, non-zero: ${nonZeroCount}/${width * height} (${(nonZeroCount/(width*height)*100).toFixed(2)}%)`);
    
    if (sampleValues.length > 0) {
      console.log(`📊 Sample depth values (0-255):`, sampleValues);
    } else {
      console.warn(`⚠️ WARNING: No depth data captured!`);
      const centerX = Math.floor(width / 2);
      const centerY = Math.floor(height / 2);
      const centerIdx = (centerY * width + centerX) * 4;
      console.log(`📊 Center pixel RGBA:`, [
        depthPixels[centerIdx],
        depthPixels[centerIdx + 1],
        depthPixels[centerIdx + 2],
        depthPixels[centerIdx + 3]
      ]);
    }

    // Clean up
    depthTarget.dispose();
    depthMaterial.dispose();

    // Downsample
    const step = Math.max(1, Math.floor(100 / percentage));
    const newWidth = Math.ceil(width / step);
    const newHeight = Math.ceil(height / step);
    const grayscaleDepth = new Uint8Array(newWidth * newHeight);
    
    let writeIdx = 0;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        grayscaleDepth[writeIdx++] = depthPixels[idx];
      }
    }

    console.log(`🔍 Depth buffer captured: ${newWidth}x${newHeight}`);
    
    return {
      data: grayscaleDepth,
      width: newWidth,
      height: newHeight
    };

  } catch (err) {
    console.error("Error reading depth buffer:", err);
    return null;
  }
}
let frameCounter = 0;
function saveFrameDataJSON(rgbData: any, depthData: any, frameIndex: number) {
  frameCounter++;
  if (frameCounter % 10 !== 0) return;
  const savedCount = Math.floor(frameCounter / 10);
  console.log(`✅ [Saving] Frame #${savedCount}`);
  saveRGBImage(rgbData, frameIndex, savedCount);
  if (depthData) saveDepthImage(depthData, frameIndex, savedCount);
}

async function saveRGBImage(rgbData: any, frameIndex: number, savedCount: number) {
  // ... (Keep existing saving logic) ...
  const canvas = document.createElement("canvas");
  canvas.width = rgbData.width;
  canvas.height = rgbData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const imgData = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < rgbData.height; y++) {
    for (let x = 0; x < rgbData.width; x++) {
      const srcIdx = (y * rgbData.width + x) * 4;
      const dstY = rgbData.height - 1 - y;
      const dstIdx = (dstY * rgbData.width + x) * 4;
      imgData.data[dstIdx] = rgbData.data[srcIdx];
      imgData.data[dstIdx + 1] = rgbData.data[srcIdx + 1];
      imgData.data[dstIdx + 2] = rgbData.data[srcIdx + 2];
      imgData.data[dstIdx + 3] = rgbData.data[srcIdx + 3];
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b)));
  if (!blob) return;
  const folder = await getFolderHandle();
  if (!folder) return;
  const fileHandle = await folder.getFileHandle(`frame_${savedCount}_${frameIndex}.png`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function saveDepthImage(depthData: any, frameIndex: number, savedCount: number) {
  // ... (Keep existing saving logic) ...
  const canvas = document.createElement("canvas");
  canvas.width = depthData.width;
  canvas.height = depthData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const imgData = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < depthData.height; y++) {
    for (let x = 0; x < depthData.width; x++) {
      const srcIdx = y * depthData.width + x;
      const dstY = depthData.height - 1 - y;
      const dstIdx = (dstY * depthData.width + x) * 4;
      const depth = depthData.data[srcIdx];
      imgData.data[dstIdx] = depth;
      imgData.data[dstIdx + 1] = depth;
      imgData.data[dstIdx + 2] = depth;
      imgData.data[dstIdx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b)));
  if (!blob) return;
  const folder = await getFolderHandle();
  if (!folder) return;
  const fileHandle = await folder.getFileHandle(`frame_${savedCount}_${frameIndex}_depth.png`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}