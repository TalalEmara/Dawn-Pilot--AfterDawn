import { useEffect, useCallback } from 'react';

const CAMERA_STORAGE_KEY = 'builder-camera';

type CameraState = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
};

const loadInitialCameraState = (): CameraState => {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (!raw) {
      return {
        position: { x: 0, y: 2, z: 4 },
        rotation: { x: 20, y: 0, z: 0 },
      };
    }
    return JSON.parse(raw) as CameraState;
  } catch {
    return {
      position: { x: 0, y: 2, z: 4 },
      rotation: { x: 20, y: 0, z: 0 },
    };
  }
};

export function usePersistentCamera() {
  const saveCameraNow = useCallback(() => {
    const scene = document.querySelector('a-scene');
    if (!scene) return;

    const cameraEl = scene.querySelector('[camera], a-camera') as any;
    if (!cameraEl) return;

    const pos = cameraEl.getAttribute('position');
    const rot = cameraEl.getAttribute('rotation');
    if (!pos || !rot) return;

    const newState: CameraState = {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: rot.x, y: rot.y, z: rot.z },
    };

    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(newState));
  }, []);

  const getCurrentCamera = useCallback((): CameraState | null => {
    const scene = document.querySelector('a-scene');
    if (!scene) return null;

    const cameraEl = scene.querySelector('[camera], a-camera') as any;
    if (!cameraEl) return null;

    const pos = cameraEl.getAttribute('position');
    const rot = cameraEl.getAttribute('rotation');
    if (!pos || !rot) return null;

    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: rot.x, y: rot.y, z: rot.z },
    };
  }, []);

  const setCameraState = useCallback((cameraState: CameraState) => {
    const scene = document.querySelector('a-scene');
    if (!scene) return;

    const cameraEl = scene.querySelector('[camera], a-camera') as any;
    if (!cameraEl) return;

    cameraEl.setAttribute('position', cameraState.position);
    cameraEl.setAttribute('rotation', cameraState.rotation);
  }, []);

  useEffect(() => {
    const scene = document.querySelector('a-scene');
    if (!scene) return;

    const cameraEl = scene.querySelector('[camera], a-camera') as any;
    if (!cameraEl) return;

    // Apply saved state on mount
    const camState = loadInitialCameraState();
    cameraEl.setAttribute('position', camState.position);
    cameraEl.setAttribute('rotation', camState.rotation);
  }, []);

  return { saveCameraNow, getCurrentCamera, setCameraState };
}
