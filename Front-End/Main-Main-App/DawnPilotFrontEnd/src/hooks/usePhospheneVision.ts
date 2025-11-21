import { useState, useCallback, useRef } from 'react';

// Auto-detect FastAPI URL based on hostname
const getFastAPIUrl = (): string => {
  if (import.meta.env.VITE_FASTAPI_URL) {
    return import.meta.env.VITE_FASTAPI_URL;
  }
  
  // Use same hostname as current page, port 8000
  const hostname = window.location.hostname;
  return `http://${hostname}:8000`;
};

const FASTAPI_URL = getFastAPIUrl();

interface Detection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number];
  centroid_px?: [number, number];
  distance_m?: number;
}

interface PhospheneMetadata {
  detection_count: number;
  depth_assigned_count: number;
  depth_sampling_method: string;
  timing_breakdown: {
    total_ms: number;
    image_decode_ms: number;
    depth_decode_ms: number;
    detection_ms: number;
    depth_assignment_ms: number;
    translation_ms: number;
    encode_ms: number;
  };
}

interface PhospheneResult {
  detections: Detection[];
  phosphene_image: string;
  metadata: PhospheneMetadata;
}

interface ProcessOptions {
  depth_sampling?: 'median' | 'centroid' | 'min' | 'mean';
  conf_threshold?: number;
  t_min?: number;
  k_min?: number;
  k_max?: number;
}

export function usePhospheneVision() {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PhospheneResult | null>(null);
  const processingCountRef = useRef(0);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      console.log(`Checking FastAPI health at: ${FASTAPI_URL}/api/health`);
      const response = await fetch(`${FASTAPI_URL}/api/health`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`Health check failed: ${response.status} ${response.statusText}`);
        return false;
      }
      
      const data = await response.json();
      console.log('FastAPI health response:', data);
      return data.status === 'healthy';
    } catch (err) {
      console.error('FastAPI health check failed:', err);
      setError(`Cannot connect to FastAPI at ${FASTAPI_URL}. Make sure it's running.`);
      return false;
    }
  }, []);

  const processFrame = useCallback(async (
    imageBase64: string,
    depthBase64: string,
    options: ProcessOptions = {}
  ): Promise<PhospheneResult | null> => {
    if (processing) {
      console.warn('Already processing a frame, skipping...');
      return null;
    }

    setProcessing(true);
    setError(null);

    try {
      console.log(`Processing frame at: ${FASTAPI_URL}/api/process-with-depth`);
      
      const response = await fetch(`${FASTAPI_URL}/api/process-with-depth`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          image_base64: imageBase64,
          depth_map_base64: depthBase64,
          depth_sampling: options.depth_sampling || 'median',
          conf_threshold: options.conf_threshold || 0.5,
          t_min: options.t_min || 0.3,
          k_min: options.k_min || 1,
          k_max: options.k_max || 5
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText || response.statusText}`);
      }

      const result: PhospheneResult = await response.json();
      
      setLastResult(result);
      processingCountRef.current++;
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to process frame:', errorMsg);
      setError(errorMsg);
      return null;
    } finally {
      setProcessing(false);
    }
  }, [processing]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setLastResult(null);
    setError(null);
    processingCountRef.current = 0;
  }, []);

  return {
    processFrame,
    checkHealth,
    processing,
    error,
    lastResult,
    processingCount: processingCountRef.current,
    clearError,
    reset
  };
}
