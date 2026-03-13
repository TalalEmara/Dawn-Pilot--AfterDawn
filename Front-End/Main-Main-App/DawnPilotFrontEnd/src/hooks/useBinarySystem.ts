import { useEffect, useRef } from 'react';

type BinaryStreamMode = 'legacy-json' | 'phosphene-binary';
type CanvasWithNeedsUpdate = HTMLCanvasElement & { needsUpdate?: boolean };

interface UseBinaryStreamOptions {
  mode?: BinaryStreamMode;
}

export function useBinaryStream(
  ws: WebSocket | null,
  options: UseBinaryStreamOptions = {},
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastProcessedFrameRef = useRef(0);
  const mode = options.mode ?? 'legacy-json';

  useEffect(() => {
    if (!ws) return;

    const drawToCanvas = (width: number, height: number, rgba: Uint8Array) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      if (!ctx) return;

      const imageData = new ImageData(width, height);
      imageData.data.set(rgba);
      ctx.putImageData(imageData, 0, 0);
      (canvas as CanvasWithNeedsUpdate).needsUpdate = true;
    };

    const handleBinaryMessage = (event: MessageEvent) => {
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength < 8) return;

      const view = new DataView(event.data);
      const width = view.getUint32(0, true);
      const height = view.getUint32(4, true);
      const rgbaSize = width * height * 4;

      if (event.data.byteLength < 8 + rgbaSize) return;

      const rgba = new Uint8Array(event.data, 8, rgbaSize);
      drawToCanvas(width, height, rgba);
    };

    const handleLegacyMessage = async (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;

      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'result' || !data.data?.output_image) return;

        const frameId = parseInt(data.data.frame_id, 10) || 0;
        if (frameId < lastProcessedFrameRef.current) return;

        lastProcessedFrameRef.current = frameId;
        const canvas = canvasRef.current;
        if (!canvas) return;

        await new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            if (canvas.width !== image.width || canvas.height !== image.height) {
              canvas.width = image.width;
              canvas.height = image.height;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve();
              return;
            }

            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve();
          };
          image.onerror = () => reject(new Error('Failed to decode legacy frame image'));
          image.src = `data:image/jpeg;base64,${data.data.output_image}`;
        });

        (canvas as CanvasWithNeedsUpdate).needsUpdate = true;
      } catch (err) {
        console.error('[BinaryStream] Legacy decode error', err);
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (mode === 'phosphene-binary') {
        handleBinaryMessage(event);
        return;
      }
      void handleLegacyMessage(event);
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, mode]);

  return canvasRef;
}
