import React, { useEffect, useRef } from 'react';

// Define the shape of your Entity based on your project structure
interface Entity {
  id: string;
  Position: { x: number; y: number; z: number };
  Rotation?: { x: number; y: number; z: number };
  Scale?: { x: number; y: number; z: number };
  Color?: { value: string };
  name?: string;
}

interface MinimapProps {
  entities: Entity[];
  cameraRef: React.RefObject<any>; // Reference to the A-Frame camera
  width?: number;
  height?: number;
  scale?: number; // How many pixels per world unit (Zoom)
}

const Minimap: React.FC<MinimapProps> = ({
  entities,
  cameraRef,
  width = 280,
  height = 200,
  scale = 10 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      // 1. Get Camera Data First
      // We default to 0 if the camera isn't ready yet
      let camX = 0;
      let camZ = 0;
      let camRot = 0;

      if (cameraRef.current && cameraRef.current.el && cameraRef.current.el.object3D) {
        const obj = cameraRef.current.el.object3D;
        camX = obj.position.x;
        camZ = obj.position.z;
        camRot = obj.rotation.y;
      }

      // 2. Clear Background
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      // 3. Draw Grid (Optional - Moving Grid)
      // To make the grid look like it's moving, we apply an offset based on camera position modulo the grid size
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1;
      
      // Calculate the offset so the grid slides
      // e.g., if scale is 10, a 1 unit move in 3D is 10px on canvas
      const gridSize = 5 * scale; // Grid lines every 5 world units
      const offsetX = (camX * scale) % gridSize;
      const offsetY = (camZ * scale) % gridSize;

      ctx.beginPath();
      // This is a simple static crosshair, but you could generate a grid loop here using offsets
      // For now, let's keep the center crosshair to show where the player is
      ctx.moveTo(0, cy); ctx.lineTo(width, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
      ctx.stroke();

      // 4. Draw Entities (Relatively to Camera)
      entities.forEach(entity => {
        if (entity.name === "Light") return;

        const pos = entity.Position || { x: 0, y: 0, z: 0 };
        const scl = entity.Scale || { x: 1, y: 1, z: 1 };
        const color = entity.Color?.value || '#888';

        // --- KEY CHANGE HERE ---
        // Calculate relative position: (EntityPos - CameraPos)
        // Then add cx/cy to center it on the canvas
        const relX = (pos.x - camX) * scale;
        const relY = (pos.z - camZ) * scale; // Assuming Z is the 'depth' in 3D

        const x = cx + relX;
        const y = cy + relY;

        // Optimization: Don't draw if it's way off canvas
        if (x < -50 || x > width + 50 || y < -50 || y > height + 50) return;

        const w = scl.x * scale;
        const h = scl.z * scale;

        ctx.fillStyle = color;
        // Draw rect centered on the calculated position
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
      });

      // 5. Draw User (Always in the Center)
      ctx.save();
      
      // Translate to the exact center of the canvas
      ctx.translate(cx, cy);
      
      // Rotate the canvas context around the center to match player rotation
      // Note: We usually rotate the "Player Marker" to show direction
      // Alternatively, if you want the whole MAP to rotate (compass style), you would rotate entities instead.
      // This implementation keeps "North" up and rotates the player arrow.
      ctx.rotate(-camRot); 

      // Draw the Player Box
      ctx.fillStyle = '#00ff88';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      
      // Determine shape sizes
      const size = 10;
      ctx.fillRect(-size/2, -size/2, size, size);
      ctx.strokeRect(-size/2, -size/2, size, size);

      // Draw View Cone / Direction arrow
      ctx.beginPath();
      ctx.moveTo(0, -15); // Arrow tip
      ctx.lineTo(-5, -5);
      ctx.lineTo(5, -5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 255, 136, 0.5)';
      ctx.fill();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [entities, cameraRef, width, height, scale]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      style={{ border: '1px solid #444', borderRadius: '4px', background: '#000' }}
    />
  );
};

export default Minimap;