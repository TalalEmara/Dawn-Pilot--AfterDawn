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

async function getFolderHandle() {
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
}) => {
  const frameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const cleanupFnsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (options?.enabled === false) return;

    const LOG_INTERVAL = options?.logInterval ?? 2000;
    const LOG_PIXEL_DATA = options?.logPixelData ?? false;

    const setupDebug = () => {
      if (isInitializedRef.current) {
        return;
      }

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
        if (!gl) {
          return;
        }

        isInitializedRef.current = true;

        let lastLog = 0;

        const loop = () => {
          const now = performance.now();

          if (now - lastLog > LOG_INTERVAL) {
            lastLog = now;

            try {
              const debugInfo = renderer.info;

              if (LOG_PIXEL_DATA) {
                requestAnimationFrame(() => {
                  try {
                    const width = renderer.domElement.width;
                    const height = renderer.domElement.height;
                    
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

                    // Check if we got any non-black pixels
                    let hasColor = false;
                    for (let i = 0; i < pixelData.length; i += 4) {
                      if (pixelData[i] > 0 || pixelData[i + 1] > 0 || pixelData[i + 2] > 0) {
                        hasColor = true;
                        break;
                      }
                    }
                    
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
                    // Save as PNG and send to FastAPI
                    saveFrameDataJSON(rgbData, depthData, Math.floor(now));
                  } catch (err) {
                    // Silent
                  }
                });
              }
            } catch (err) {
              // Silent
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
    };
  }, [options?.enabled, options?.logInterval, options?.logPixelData, options?.downsamplePercentage]);
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
  
  // Create flat array for downsampled data (RGBA format)
  const downsampled = new Uint8Array(newWidth * newHeight * 4);
  let writeIdx = 0;

  // Sample pixels with step
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const readIdx = (y * width + x) * 4;
      downsampled[writeIdx++] = pixels[readIdx];     // R
      downsampled[writeIdx++] = pixels[readIdx + 1]; // G
      downsampled[writeIdx++] = pixels[readIdx + 2]; // B
      downsampled[writeIdx++] = pixels[readIdx + 3]; // A
    }
  }

  return { 
    data: downsampled, 
    width: newWidth, 
    height: newHeight 
  };
}

// Read depth buffer using a shader-based approach
// Read depth buffer using a shader-based approach
// Read depth buffer using a shader-based approach
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

// Send frame data to FastAPI for phosphene processing
async function sendToFastAPI(rgbData: any, depthData: any) {
  try {
    // Convert RGB data to base64 PNG
    const rgbCanvas = document.createElement("canvas");
    rgbCanvas.width = rgbData.width;
    rgbCanvas.height = rgbData.height;
    const rgbCtx = rgbCanvas.getContext("2d");
    if (!rgbCtx) return null;

    const rgbImgData = rgbCtx.createImageData(rgbCanvas.width, rgbCanvas.height);
    for (let y = 0; y < rgbData.height; y++) {
      for (let x = 0; x < rgbData.width; x++) {
        const srcIdx = (y * rgbData.width + x) * 4;
        const dstY = rgbData.height - 1 - y;
        const dstIdx = (dstY * rgbData.width + x) * 4;
        rgbImgData.data[dstIdx] = rgbData.data[srcIdx];
        rgbImgData.data[dstIdx + 1] = rgbData.data[srcIdx + 1];
        rgbImgData.data[dstIdx + 2] = rgbData.data[srcIdx + 2];
        rgbImgData.data[dstIdx + 3] = rgbData.data[srcIdx + 3];
      }
    }
    rgbCtx.putImageData(rgbImgData, 0, 0);
    const imageBase64 = rgbCanvas.toDataURL("image/png");

    // Convert depth data to base64 PNG
    let depthBase64 = "";
    if (depthData) {
      const depthCanvas = document.createElement("canvas");
      depthCanvas.width = depthData.width;
      depthCanvas.height = depthData.height;
      const depthCtx = depthCanvas.getContext("2d");
      if (!depthCtx) return null;

      const depthImgData = depthCtx.createImageData(depthCanvas.width, depthCanvas.height);
      for (let y = 0; y < depthData.height; y++) {
        for (let x = 0; x < depthData.width; x++) {
          const srcIdx = y * depthData.width + x;
          const dstY = depthData.height - 1 - y;
          const dstIdx = (dstY * depthData.width + x) * 4;
          const depth = depthData.data[srcIdx];
          depthImgData.data[dstIdx] = depth;
          depthImgData.data[dstIdx + 1] = depth;
          depthImgData.data[dstIdx + 2] = depth;
          depthImgData.data[dstIdx + 3] = 255;
        }
      }
      depthCtx.putImageData(depthImgData, 0, 0);
      depthBase64 = depthCanvas.toDataURL("image/png");
    }

    // Call FastAPI with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    try {
      const response = await fetch("http://localhost:8000/api/process-with-depth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_base64: imageBase64,
          depth_map_base64: depthBase64,
          depth_sampling: "median",
          conf_threshold: 0.1,
          t_min: 0.1,
          k_min: 1,
          k_max: 5,
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`⚠️ FastAPI error: ${response.status} - Continuing without phosphene processing`);
        return null;
      }

      const result = await response.json();
      console.log(`🔮 FastAPI response:`, {
        detections: result.metadata.detection_count,
        withDepth: result.metadata.depth_assigned_count,
        processingTime: result.metadata.timing_breakdown.total_ms,
      });

      return result;
    } catch (fetchErr) {
      clearTimeout(timeout);
      if ((fetchErr as Error).name === 'AbortError') {
        console.warn("⚠️ FastAPI request timeout - Continuing without phosphene processing");
      } else {
        console.warn("⚠️ FastAPI unavailable - Continuing without phosphene processing");
      }
      return null;
    }
  } catch (err) {
    console.error("Frame processing error:", err);
    return null;
  }
}

function saveFrameDataJSON(rgbData: any, depthData: any, frameIndex: number) {
  frameCounter++;
  
  // Save only every 10th frame
  if (frameCounter % 10 !== 0) {
    return;
  }

  const savedCount = Math.floor(frameCounter / 10);
  
  // Send to FastAPI for processing
  sendToFastAPI(rgbData, depthData).then((result) => {
    if (result && result.phosphene_image) {
      // Save the phosphene output image
      savePhospheneImage(result.phosphene_image, frameIndex, savedCount);
    }
  });
  
  // Also save original frames
  saveRGBImage(rgbData, frameIndex, savedCount);
  if (depthData) {
    saveDepthImage(depthData, frameIndex, savedCount);
  }
}

// Fixed RGB image saving with Y-flip
async function saveRGBImage(rgbData: any, frameIndex: number, savedCount: number) {
  const canvas = document.createElement("canvas");
  canvas.width = rgbData.width;
  canvas.height = rgbData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const imgData = ctx.createImageData(canvas.width, canvas.height);
  
  // CRITICAL FIX: Flip Y-axis while copying data
  // WebGL has origin at bottom-left, canvas at top-left
  for (let y = 0; y < rgbData.height; y++) {
    for (let x = 0; x < rgbData.width; x++) {
      // Source index (from WebGL, bottom-up)
      const srcIdx = (y * rgbData.width + x) * 4;
      
      // Destination index (for canvas, top-down) - flip Y
      const dstY = rgbData.height - 1 - y;
      const dstIdx = (dstY * rgbData.width + x) * 4;
      
      imgData.data[dstIdx] = rgbData.data[srcIdx];         // R
      imgData.data[dstIdx + 1] = rgbData.data[srcIdx + 1]; // G
      imgData.data[dstIdx + 2] = rgbData.data[srcIdx + 2]; // B
      imgData.data[dstIdx + 3] = rgbData.data[srcIdx + 3]; // A
    }
  }
  
  ctx.putImageData(imgData, 0, 0);
  
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b))
  );
  if (!blob) return;

  const folder = await getFolderHandle();
  if (!folder) return;

  const fileHandle = await folder.getFileHandle(`frame_${savedCount}_${frameIndex}.png`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

// Save depth data as grayscale PNG
async function saveDepthImage(depthData: any, frameIndex: number, savedCount: number) {
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

  const fileHandle = await folder.getFileHandle(`frame_${savedCount}_${frameIndex}_depth.png`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

// Save phosphene processed image from FastAPI
async function savePhospheneImage(phospheneBase64: string, frameIndex: number, savedCount: number) {
  try {
    // Convert base64 to blob
    const base64Data = phospheneBase64.split(',')[1] || phospheneBase64;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/png' });

    const folder = await getFolderHandle();
    if (!folder) return;

    const fileHandle = await folder.getFileHandle(`frame_${savedCount}_${frameIndex}_phosphene.png`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (err) {
    console.error("Error saving phosphene image:", err);
  }
}

// Export other versions for compatibility
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