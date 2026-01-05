import { useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { URLS } from '../../ApiConfig'; //

// === Types ===
export interface ExperimentStartParams {
  laptopSocketId: string; 
  mobileId: string;       
  subjectId: string;      
  scenarioId: string;     
  visionMode: string;     
}

interface ExperimentState {
  isRecording: boolean;
  currentExperimentId: string | null;
  startTime: number | null;
}

export const useExperimentVault = (socket: Socket | null) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [experimentState, setExperimentState] = useState<ExperimentState>({
    isRecording: false,
    currentExperimentId: null,
    startTime: null
  });

  // 1. Start Recording
  const startExperiment = useCallback(async (params: ExperimentStartParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${URLS.SYNC_SOCKET}/api/experiment/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to start experiment');
      }

      setExperimentState({
        isRecording: true,
        currentExperimentId: 'pending_server_confirmation', 
        startTime: Date.now()
      });
      
      console.log("✅ Experiment started successfully");
      return true;

    } catch (err: any) {
      console.error("❌ Error starting experiment:", err);
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 2. Stop Recording
  const stopExperiment = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${URLS.SYNC_SOCKET}/api/experiment/stop`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to stop experiment');
      }

      const data = await response.json();
      
      setExperimentState({
        isRecording: false,
        currentExperimentId: null,
        startTime: null
      });

      console.log(`💾 Experiment saved as: ${data.file}`);
      return data.file;

    } catch (err: any) {
      console.error("❌ Error stopping experiment:", err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 3. Log Collision
  const logCollision = useCallback((obstacleId: string) => {
    if (!socket || !experimentState.isRecording) return;

    socket.emit('experiment:collision', { 
      obstacleId,
      timestamp: Date.now() 
    });
  }, [socket, experimentState.isRecording]);

  return {
    isRecording: experimentState.isRecording,
    startTime: experimentState.startTime,
    isLoading,
    error,
    startExperiment,
    stopExperiment,
    logCollision,
    clearError: () => setError(null)
  };
};