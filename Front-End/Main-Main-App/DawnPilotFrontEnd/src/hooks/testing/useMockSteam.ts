// hooks/useMockStream.ts
import { useEffect, useRef } from 'react';

export function useMockStream() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set resolution (simulating 360p video)
    canvas.width = 640;
    canvas.height = 360;

    let frameId: number;
    let x = 50; 
    let dx = 4; // Speed X

    const animate = () => {
      // 1. Clear Screen (Black background)
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Draw "Video" Content (Green Bouncing Ball)
      ctx.beginPath();
      ctx.arc(x, 180, 40, 0, Math.PI * 2);
      ctx.fillStyle = '#00FF00';
      ctx.fill();

      // 3. Draw Info Text
      ctx.fillStyle = 'white';
      ctx.font = '30px monospace';
      ctx.fillText("MOCK HUD MODE", 50, 50);
      ctx.fillText(`Time: ${Date.now()}`, 50, 100);

      // Animation Logic
      if (x + 40 > canvas.width || x - 40 < 0) dx = -dx;
      x += dx;

      // 4. IMPORTANT: Signal A-Frame texture to update
      // We manually add this attribute or rely on the loop in the component
      canvas.setAttribute('data-updated', Date.now().toString());

      frameId = requestAnimationFrame(animate);
    };

    animate();

    return () => cancelAnimationFrame(frameId);
  }, []);

  return canvasRef;
}