// src/workers/frameEncoder.worker.ts

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

let offscreenCanvas: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;
let imageData: ImageData | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { pixelBuffer, depthBlob, frameId, stage, width, height } = e.data;

  try {
    let rgbBase64 = "";

    if (pixelBuffer && width && height) {
      const stride = width * 4;
      
      // Safety Check: Ensure buffer size matches expected dimensions
      if (pixelBuffer.byteLength !== stride * height) {
          throw new Error(`Buffer size mismatch: Expected ${stride * height}, got ${pixelBuffer.byteLength}`);
      }

      // 1. Setup Canvas & ImageData (only when dimensions change)
      if (!offscreenCanvas || offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
        offscreenCanvas = new OffscreenCanvas(width, height);
        offscreenCtx = offscreenCanvas.getContext("2d");
        
        // Create ImageData once with internal buffer
        const buffer = new Uint8ClampedArray(stride * height);
        imageData = new ImageData(buffer, width, height);
      }

      if (offscreenCtx && imageData) {
        // Copy transferred data into reusable ImageData buffer (single copy operation)
        imageData.data.set(pixelBuffer instanceof Uint8ClampedArray ? pixelBuffer : new Uint8ClampedArray(pixelBuffer));
        // Draw & Compress
        offscreenCtx.putImageData(imageData, 0, 0);

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
    };

    self.postMessage({ success: true, payload: JSON.stringify(message) });

  } catch (error) {
    // Send the error back so the main thread can log it
    self.postMessage({ success: false, error: String(error) });
  }
};