// src/workers/frameEncoder.worker.ts

// Helper to convert Blob to Base64 inside the worker
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove "data:image/png;base64," prefix
      resolve(base64.split(",")[1]); 
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

self.onmessage = async (e: MessageEvent) => {
  const { rgbBlob, depthBlob, frameId, stage } = e.data;

  try {
    // 1. Heavy Task: Convert RGB
    const rgbBase64 = await blobToBase64(rgbBlob);

    // 2. Heavy Task: Convert Depth (if exists)
    let depthBase64 = null;
    if (depthBlob) {
      depthBase64 = await blobToBase64(depthBlob);
    }

    // 3. Heavy Task: Stringify JSON (Yes, this is also slow for large images)
    const message = {
      type: "frame",
      frame_id: String(frameId).padStart(3, "0"),
      rgb: rgbBase64,
      stage: stage,
      depth: depthBase64 || undefined,
    };

    const jsonString = JSON.stringify(message);

    // Send the ready-to-send string back to main thread
    self.postMessage({ success: true, payload: jsonString });

  } catch (error) {
    self.postMessage({ success: false, error: String(error) });
  }
};