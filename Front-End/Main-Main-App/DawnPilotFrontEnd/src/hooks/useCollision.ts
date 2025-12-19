import { useEffect, type RefObject } from 'react';
import '../AFrameComponents/Collision'; // Import the component side-effect

export function useCollisionDetection(
  entityRef: RefObject<any>,
  onCollision: (detail: { obstacleId: string; timestamp: number }) => void,
  enabled: boolean = true
) {
  useEffect(() => {
    const element = entityRef.current?.el; // Access A-Frame element from React ref

    if (!element || !enabled) return;

    const handleCollision = (e: any) => {
      // Forward the detail from the A-Frame event to your callback
      onCollision(e.detail);
    };

    // Attach Listener
    element.addEventListener('collision', handleCollision);

    // Cleanup Listener on Unmount
    return () => {
      element.removeEventListener('collision', handleCollision);
    };
  }, [entityRef, onCollision, enabled]);
}