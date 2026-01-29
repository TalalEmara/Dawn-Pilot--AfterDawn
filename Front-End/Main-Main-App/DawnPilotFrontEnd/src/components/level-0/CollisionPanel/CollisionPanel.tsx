import styles from "./CollisionPanel.module.css";
import { useState, useCallback, forwardRef, useImperativeHandle, useRef, useEffect } from "react";
import { useCollisionDetection } from "../../../hooks/useCollision";

interface CollisionPanelProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hitboxRef?: React.RefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket?: any;
  onCollision?: (detail: { obstacleId: string; timestamp: number }) => void;
}

export interface CollisionPanelRef {
  getCount: () => number;
  getLogs: () => string[];
  reset: () => void;
}

const CollisionPanel = forwardRef<CollisionPanelRef, CollisionPanelProps>((
  { hitboxRef, socket, onCollision },
  ref
) => {
  const [collisionCount, setCollisionCount] = useState<number>(0);
  const [collisionLog, setCollisionLog] = useState<string[]>([]);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCollidingRef = useRef(false);

  const handleCollision = useCallback(
    (detail: { obstacleId: string; timestamp: number }) => {
      // Send DANGER alert on first collision
      if (!isCollidingRef.current && socket) {
        isCollidingRef.current = true;
        socket.emit('alert:status', { status: 'DANGER' });
      }

      // Reset safety timer
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
      }

      // Send SAFE after 500ms of no collisions
      safetyTimerRef.current = setTimeout(() => {
        if (socket) {
          socket.emit('alert:status', { status: 'SAFE' });
        }
        isCollidingRef.current = false;
        safetyTimerRef.current = null;
      }, 500);

      const timestamp = new Date().toLocaleTimeString();
      const logMsg = `[${timestamp}] Hit: ${detail.obstacleId}`;

      setCollisionCount((prev) => prev + 1);
      setCollisionLog((prev) => [logMsg, ...prev].slice(0, 10));

      // Notify parent if callback provided
      if (onCollision) {
        onCollision(detail);
      }
    },
    [socket, onCollision]
  );

  // Use collision detection hook only if hitboxRef is provided
  useCollisionDetection(hitboxRef || { current: null }, handleCollision, !!hitboxRef);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
      }
    };
  }, []);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    getCount: () => collisionCount,
    getLogs: () => collisionLog,
    reset: () => {
      setCollisionCount(0);
      setCollisionLog([]);
    },
  }));

  return (
    <div className={styles.panel}>
      <p className={`${styles.count} ${collisionCount > 0 ? styles.danger : ''}`}>
        {collisionCount}
      </p>
      <p className={styles.label}>Collisions</p>
    </div>
  );
});

CollisionPanel.displayName = "CollisionPanel";

export default CollisionPanel;