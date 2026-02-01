// src/workers/decoder.worker.ts

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (e: MessageEvent) => {
  const { jsonString, lastFrameId } = e.data;

  try {
    const data = JSON.parse(jsonString);

    if (data.type === 'result' && data.data?.output_image) {
      const frameId = parseInt(data.data.frame_id) || 0;

      if (frameId < lastFrameId) return;

      const base64 = data.data.output_image;

      // ⚡ OPTIMIZATION: Use fetch instead of loop
      // Note: Ensure the MIME type matches your backend (png vs jpeg)
      const res = await fetch(`data:image/jpeg;base64,${base64}`);
      const blob = await res.blob();

      const bitmap = await createImageBitmap(blob);

      self.postMessage(
        { success: true, frameId, bitmap }, 
        [bitmap]
      );
    }
  } catch (err) {
    console.error("Worker error:", err);
  }
};