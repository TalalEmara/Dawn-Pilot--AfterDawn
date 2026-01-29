import { useEffect, useRef, type RefObject } from 'react';
import '../AFrameComponents/Collision'; // Import the component side-effect

// ============== DEBUG CONTROL ==============
const DEBUG_HOOK = false; // <-- SET TO false TO DISABLE ALL LOGS
// ===========================================

const log = (...args: any[]) => DEBUG_HOOK && console.log('[useCollision]', ...args);
const warn = (...args: any[]) => DEBUG_HOOK && console.warn('[useCollision]', ...args);
const error = (...args: any[]) => DEBUG_HOOK && console.error('[useCollision]', ...args);

export function useCollisionDetection(
  entityRef: RefObject<any>,
  onCollision: (detail: { obstacleId: string; timestamp: number }) => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(onCollision);
  const mountCountRef = useRef(0);
  const eventCountRef = useRef(0);
  
  log('========== HOOK RENDER ==========');
  log('enabled:', enabled);
  log('entityRef.current:', entityRef.current ? 'EXISTS' : 'NULL');
  log('entityRef.current?.el:', entityRef.current?.el ? 'EXISTS' : 'NULL');
  
  // Keep callback ref up to date
  useEffect(() => {
    log('Callback ref updated');
    callbackRef.current = onCollision;
  }, [onCollision]);

  useEffect(() => {
    mountCountRef.current++;
    const mountId = mountCountRef.current;
    
    log(`========== EFFECT RUN #${mountId} ==========`);
    log('enabled:', enabled);
    log('entityRef.current:', entityRef.current);
    
    const element = entityRef.current?.el;
    
    log('element (A-Frame el):', element ? element.tagName : 'NULL');
    
    if (!element) {
      warn('⚠️ No element found! entityRef.current?.el is null/undefined');
      warn('This means the ref is not properly connected to an A-Frame entity');
      return;
    }
    
    if (!enabled) {
      log('Hook disabled, not attaching listener');
      return;
    }

    log('Element tagName:', element.tagName);
    log('Element id:', element.id || '(no id)');
    log('Element has collision-detector?', element.getAttribute('collision-detector') ? 'YES' : 'NO');

    const handleCollision = (e: any) => {
      eventCountRef.current++;
      log(`========== EVENT RECEIVED #${eventCountRef.current} ==========`);
      log('Event object:', e);
      log('Event detail:', e.detail);
      log('obstacleId:', e.detail?.obstacleId);
      log('timestamp:', e.detail?.timestamp);
      log('Calling callback...');
      
      try {
        callbackRef.current(e.detail);
        log('✅ Callback executed successfully');
      } catch (err) {
        error('❌ Callback threw error:', err);
      }
    };

    log('Adding event listener to element...');
    element.addEventListener('collision', handleCollision);
    log('✅ Event listener added');

    // Cleanup
    return () => {
      log(`========== CLEANUP #${mountId} ==========`);
      log('Removing event listener...');
      element.removeEventListener('collision', handleCollision);
      log('✅ Event listener removed');
    };
  }, [enabled]);
}