// src/workers/frameEncoder.worker.ts

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
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

self.onmessage = async (e: MessageEvent) => {
  const { pixelBuffer, depthBlob, frameId, stage, width, height } = e.data;

  try {
    let rgbBase64 = "";

    if (pixelBuffer && width && height) {
      // 1. Setup Canvas (Standard, no options to prevent compatibility issues)
      if (!offscreenCanvas || offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
        offscreenCanvas = new OffscreenCanvas(width, height);
        offscreenCtx = offscreenCanvas.getContext("2d"); 
      }

      if (offscreenCtx) {
        const stride = width * 4;
        
        // Safety Check: Ensure buffer size matches expected dimensions
        if (pixelBuffer.byteLength !== stride * height) {
            throw new Error(`Buffer size mismatch: Expected ${stride * height}, got ${pixelBuffer.byteLength}`);
        }

        const data = new Uint8ClampedArray(pixelBuffer);
        const tempRow = new Uint8ClampedArray(stride);
        const halfHeight = Math.floor(height / 2);

        // 2. FLIP Y & FORCE OPAQUE
        for (let y = 0; y < halfHeight; y++) {
          const topOffset = y * stride;
          const bottomOffset = (height - 1 - y) * stride;

          // Swap Rows (Flip Y)
          tempRow.set(data.subarray(topOffset, topOffset + stride));
          data.set(data.subarray(bottomOffset, bottomOffset + stride), topOffset);
          data.set(tempRow, bottomOffset);
          
          // Force Alpha to 255 for the *swapped* rows
          // (We do it here to ensure both top and bottom get fixed)
          for (let x = 0; x < width; x++) {
             data[topOffset + x * 4 + 3] = 255;
             data[bottomOffset + x * 4 + 3] = 255;
          }
        }
        
        // Handle middle row if height is odd
        if (height % 2 !== 0) {
             const midOffset = halfHeight * stride;
             for (let x = 0; x < width; x++) {
                 data[midOffset + x * 4 + 3] = 255;
             }
        }

        // 3. Draw & Compress
        const imgData = new ImageData(data, width, height);
        offscreenCtx.putImageData(imgData, 0, 0);

        const blob = await offscreenCanvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
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
      debug: true,  // Prevent backend from saving debug images (saves disk I/O)
    };

    self.postMessage({ success: true, payload: JSON.stringify(message) });

  } catch (error) {
    // Send the error back so the main thread can log it
    self.postMessage({ success: false, error: String(error) });
  }
};