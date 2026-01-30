// src/workers/frameEncoder.worker.ts

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

const reader = new FileReader();
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64.split(",")[1]); 
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// We only need to persist the Canvas and Context
let offscreenCanvas: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { pixelBuffer, depthBlob, frameId, stage, width, height, debug, cropping_config } = e.data;

  try {
    let rgbBase64 = "";

    if (pixelBuffer && width && height) {
      const stride = width * 4;
      
      // Safety Check
      if (pixelBuffer.byteLength !== stride * height) {
          throw new Error(`Buffer size mismatch: Expected ${stride * height}, got ${pixelBuffer.byteLength}`);
      }

      // 1. Setup Canvas (Only runs once or when size changes)
      if (!offscreenCanvas || offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
        offscreenCanvas = new OffscreenCanvas(width, height);
        offscreenCtx = offscreenCanvas.getContext("2d");
      }

      if (offscreenCtx) {
        // 🔥 ZERO-COPY OPTIMIZATION START 🔥
        
        // 1. Wrap the buffer directly (No memory copy)
        // We cast to ArrayBuffer to satisfy TypeScript strictness
        const view = new Uint8ClampedArray(pixelBuffer as ArrayBuffer);

        // 2. Create the lightweight wrapper
        const imgData = new ImageData(view, width, height);

        // 3. Draw directly
        offscreenCtx.putImageData(imgData, 0, 0);

        // 🔥 OPTIMIZATION END 🔥

        const blob = await offscreenCanvas.convertToBlob({ type: "image/jpeg", quality: 0.5 });
        rgbBase64 = await blobToBase64(blob);
      }
    }

    let depthBase64 = null;
    if (depthBlob) {
      depthBase64 = await blobToBase64(depthBlob);
    }

    const message = {
      type: "frame",
      frame_id: String(frameId).padStart(3, "0"),
      rgb: rgbBase64,
      stage: stage,
      depth: depthBase64 || undefined,
      debug: debug !== undefined ? debug : false,
      cropping_config: cropping_config || undefined,
    };

    self.postMessage({ success: true, payload: JSON.stringify(message) });

  } catch (error) {
    self.postMessage({ success: false, error: String(error) });
  }
};