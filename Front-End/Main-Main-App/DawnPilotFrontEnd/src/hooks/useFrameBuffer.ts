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
// NEW: Reusable canvas for streaming to prevent memory leaks
let encodingCanvas: HTMLCanvasElement | null = null;

// Exported so UI can trigger it from a button (user gesture)
export async function getFolderHandle() {
  if (folderHandle) return folderHandle;

  try {
    // This must be called from a user gesture (e.g., button click)
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
  // NEW: Callback to stream RGB and depth frames
  onFrame?: (rgbBlob: Blob, depthBlob: Blob | null) => void;
}) => {
  const frameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const cleanupFnsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (options?.enabled === false) return;

    const LOG_INTERVAL = options?.logInterval ?? 2000;
    const LOG_PIXEL_DATA = options?.logPixelData ?? false;
    // Capture if either logging is on OR we have a streaming callback
    const SHOULD_CAPTURE = LOG_PIXEL_DATA || !!options?.onFrame;

    const setupDebug = () => {
      if (isInitializedRef.current) {
        console.log("[A-Frame Debug] Already initialized, skipping");
        return;
      }

      const sceneEl = document.querySelector("a-scene") as ASceneEl;

      if (!sceneEl) {
        console.warn(
          "[A-Frame Debug] a-scene element not found, retrying in 200ms..."
        );
        setTimeout(setupDebug, 200);
        return;
      }

      console.log("[A-Frame Debug] Found a-scene element");

      const checkRenderer = () => {
        const renderer = (sceneEl as any).renderer;

        if (!renderer) {
          console.warn(
            "[A-Frame Debug] Renderer not ready, retrying in 200ms..."
          );
          setTimeout(checkRenderer, 200);
          return;
        }

        const gl = renderer.getContext() as WebGLRenderingContext;
        if (!gl) {
          console.error("[A-Frame Debug] WebGL context not available");
          return;
        }

        isInitializedRef.current = true;
        console.log("[A-Frame Debug] ✓ Buffer monitoring started");

        let lastLog = 0;

        const loop = () => {
          const now = performance.now();

          if (now - lastLog > LOG_INTERVAL) {
            lastLog = now;

            try {
              const debugInfo = renderer.info;
              if (debugInfo && LOG_PIXEL_DATA) {
                console.log(`🔺 Triangles: ${debugInfo.render.triangles}`);
              }

              if (SHOULD_CAPTURE) {
                // IMPORTANT: Read pixels AFTER the frame is rendered
                requestAnimationFrame(() => {
                  try {
                    const width = renderer.domElement.width;
                    const height = renderer.domElement.height;

                    if (LOG_PIXEL_DATA) console.log(`📸 Capturing frame: ${width}x${height}`);

                    const pixelData = new Uint8Array(width * height * 4);

                    // Read the entire framebuffer
                    gl.readPixels(
                      0,
                      0,
                      width,
                      height,
                      gl.RGBA,
                      gl.UNSIGNED_BYTE,
                      pixelData
                    );

                    // Downsample
                    const percentage = options?.downsamplePercentage ?? 50;
                    const rgbData = downsamplePixels(
                      pixelData,
                      width,
                      height,
                      percentage
                    );

                    // Read depth buffer
                    const depthData = readDepthBuffer(
                      gl,
                      renderer,
                      sceneEl,
                      width,
                      height,
                      percentage
                    );

                    // NEW: Stream both RGB and depth frames if callback exists
                    if (options?.onFrame) {
                        pixelsToBlob(rgbData.data, rgbData.width, rgbData.height).then(async rgbBlob => {
                            if (!rgbBlob) return;
                            
                            let depthBlob: Blob | null = null;
                            if (depthData) {
                                // Convert grayscale depth to RGBA for canvas
                                const depthRGBA = new Uint8Array(depthData.width * depthData.height * 4);
                                for (let i = 0; i < depthData.data.length; i++) {
                                    const val = depthData.data[i];
                                    depthRGBA[i * 4] = val;
                                    depthRGBA[i * 4 + 1] = val;
                                    depthRGBA[i * 4 + 2] = val;
                                    depthRGBA[i * 4 + 3] = 255;
                                }
                                depthBlob = await pixelsToBlob(depthRGBA, depthData.width, depthData.height);
                            }
                            
                            options.onFrame!(rgbBlob, depthBlob);
                        });
                    }

                    if (LOG_PIXEL_DATA) {
                        // Check if we got any non-black pixels
                        let hasColor = false;
                        for (let i = 0; i < pixelData.length; i += 4) {
                          if (
                            pixelData[i] > 0 ||
                            pixelData[i + 1] > 0 ||
                            pixelData[i + 2] > 0
                          ) {
                            hasColor = true;
                            break;
                          }
                        }
                        console.log(`🎨 Has visible pixels: ${hasColor}`);

                        if (!depthData) {
                          console.log(`Depth not captured`);
                        } else {
                          console.log(`Depth captured`);
                        }

                        // Save images
                        saveFrameDataJSON(rgbData, depthData, Math.floor(now));
                    }
                  } catch (err) {
                    console.error(
                      "[A-Frame Debug] Error capturing pixels:",
                      err
                    );
                  }
                });
              }
            } catch (err) {
              console.error(
                "[A-Frame Debug] ❌ Error reading buffer info:",
                err
              );
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
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
      isInitializedRef.current = false;

      cleanupFnsRef.current.forEach((fn) => fn());
      cleanupFnsRef.current = [];

      console.log("[A-Frame Debug] ℹ️  Buffer monitoring stopped");
    };
  }, [
    options?.enabled,
    options?.logInterval,
    options?.logPixelData,
    options?.downsamplePercentage,
    options?.onFrame,
  ]);
};

// Fixed downsample function
function downsamplePixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  percentage: number
) {
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

  return {
    data: downsampled,
    width: newWidth,
    height: newHeight,
  };
}

// NEW: Helper to efficiently convert raw pixels to JPEG Blob
async function pixelsToBlob(data: Uint8Array, width: number, height: number): Promise<Blob | null> {
    if (!encodingCanvas) encodingCanvas = document.createElement("canvas");
    encodingCanvas.width = width;
    encodingCanvas.height = height;
    const ctx = encodingCanvas.getContext("2d");
    if (!ctx) return null;
  
    // Create ImageData (requires Uint8ClampedArray)
    const clampedData = new Uint8ClampedArray(data.buffer);
    const imgData = new ImageData(clampedData, width, height);
    
    // WebGL reads pixels bottom-to-top, so we need to flip it
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

    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    if ((camera as any).updateProjectionMatrix) {
      (camera as any).updateProjectionMatrix();
    }

    const near = (camera as any).near || 0.1;
    const originalFar = (camera as any).far || 1000;
    const visualizationFar = 10;

    const cameraWorldPos = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPos);
    const cameraWorldDir = new THREE.Vector3();
    camera.getWorldDirection(cameraWorldDir);

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
          float depth = (vDepth - near) / (far - near);
          depth = clamp(depth, 0.0, 1.0);
          depth = 1.0 - depth;
          gl_FragColor = vec4(vec3(depth), 1.0);
        }
      `,
      uniforms: {
        near: { value: near },
        far: { value: visualizationFar },
      },
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });

    const originalMaterials = new Map();
    let meshCount = 0;
    let minDist = Infinity,
      maxDist = 0;

    scene.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.updateMatrixWorld(true);
        originalMaterials.set(obj, obj.material);

        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);

        const toObject = worldPos.clone().sub(cameraWorldPos);
        const dotProduct = toObject.dot(cameraWorldDir);
        const distance = worldPos.distanceTo(cameraWorldPos);

        if (distance < minDist) minDist = distance;
        if (distance > maxDist) maxDist = distance;

        obj.material = depthMaterial;
        obj.material.needsUpdate = true;
        meshCount++;
      }
    });

    if (maxDist > visualizationFar) {
      console.warn(
        `⚠️  Objects are farther (${maxDist.toFixed(
          2
        )}) than visualization far (${visualizationFar}).`
      );
    }

    const depthTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

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

    originalMaterials.forEach((material: any, obj: any) => {
      obj.material = material;
      obj.material.needsUpdate = true;
    });

    const depthPixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(
      depthTarget,
      0,
      0,
      width,
      height,
      depthPixels
    );

    let minVal = 255,
      maxVal = 0,
      nonZeroCount = 0;
    const sampleValues: number[] = [];

    for (let i = 0; i < depthPixels.length; i += 4) {
      const val = depthPixels[i];
      if (val > 0) nonZeroCount++;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;

      if (sampleValues.length < 10 && val > 0) {
        sampleValues.push(val);
      }
    }

    console.log(
      `📊 Depth stats - min: ${minVal}, max: ${maxVal}, non-zero: ${nonZeroCount}/${width * height}`
    );

    depthTarget.dispose();
    depthMaterial.dispose();

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

    return {
      data: grayscaleDepth,
      width: newWidth,
      height: newHeight,
    };
  } catch (err) {
    console.error("Error reading depth buffer:", err);
    return null;
  }
}

let frameCounter = 0;

function saveFrameDataJSON(
  rgbData: any,
  depthData: any,
  frameIndex: number
) {
  frameCounter++;

  if (frameCounter % 10 !== 0) return;

  const savedCount = Math.floor(frameCounter / 10);
  console.log(
    `✅ [Saving] Frame #${savedCount} (total processed: ${frameCounter})`
  );

  saveRGBImage(rgbData, frameIndex, savedCount);
  if (depthData) {
    saveDepthImage(depthData, frameIndex, savedCount);
  }
}

async function saveRGBImage(
  rgbData: any,
  frameIndex: number,
  savedCount: number
) {
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

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b))
  );
  if (!blob) return;

  const folder = await getFolderHandle();
  if (!folder) return;

  const fileHandle = await folder.getFileHandle(
    `frame_${savedCount}_${frameIndex}.png`,
    { create: true }
  );
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  console.log(
    `✅ RGB image saved to folder: frame_${savedCount}_${frameIndex}.png`
  );
}

async function saveDepthImage(
  depthData: any,
  frameIndex: number,
  savedCount: number
) {
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

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b))
  );
  if (!blob) return;

  const folder = await getFolderHandle();
  if (!folder) return;

  const fileHandle = await folder.getFileHandle(
    `frame_${savedCount}_${frameIndex}_depth.png`,
    { create: true }
  );
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  console.log(
    `✅ Depth image saved to folder: frame_${savedCount}_${frameIndex}_depth.png`
  );
}

// Optional helper variants
export const useFrameBufferWithSelector = (
  selector: string = "a-scene",
  options?: {
    enabled?: boolean;
    logInterval?: number;
    logPixelData?: boolean;
  }
) => {
  useFrameBuffer({ ...options });
};

export const useFrameBufferDev = (options?: {
  logInterval?: number;
  logPixelData?: boolean;
}) => {
  const isDev = process.env.NODE_ENV === "development";
  useFrameBuffer({
    ...options,
    enabled: isDev,
  });
};