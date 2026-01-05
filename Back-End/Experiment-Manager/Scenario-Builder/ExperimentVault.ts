import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// === Types matching your JSON structure ===
export interface ExperimentMeta {
  id: string;
  startTime: string; // ISO String
  duration: number;  // ms
  laptop: string;    // Socket ID
  mobile: string;    // Socket ID or Device ID
  subjectId: string;
  scenarioID: string;
  visionMode: string;
}

export interface TimelineEvent {
  t: number;      // Time relative to start (ms)
  type: string;   // 'START', 'CAM', 'COLLISION', 'STOP'
  data?: any;     // Optional data payload
  pos?: { x: number; y: number; z: number }; // Specific for CAM
  rot?: { x: number; y: number; z: number }; // Specific for CAM
}

interface ActiveSession {
  meta: ExperimentMeta;
  startTimestamp: number; // System timestamp for calculation
  timeline: TimelineEvent[];
  collisionCount: number;
}

class ExperimentVault {
  private currentSession: ActiveSession | null = null;
  private saveDir: string;

  constructor() {
    this.saveDir = path.join(__dirname, '../experiments');
    // Ensure directory exists
    if (!fs.existsSync(this.saveDir)) {
      fs.mkdirSync(this.saveDir, { recursive: true });
    }
  }

  /**
   * Start a new recording session
   */
  public startExperiment(params: {
    laptopSocketId: string;
    mobileId: string;
    subjectId: string;
    scenarioId: string;
    visionMode: string;
  }): void {
    if (this.currentSession) {
      throw new Error("Experiment already in progress. Stop the current one first.");
    }

    const id = `exp_${Date.now()}`;
    const now = Date.now();

    console.log(`🎬 ExperimentVault: Starting ${id}`);

    // Initialize Session
    this.currentSession = {
      startTimestamp: now,
      collisionCount: 0,
      timeline: [],
      meta: {
        id: id,
        startTime: new Date(now).toISOString(),
        duration: 0,
        laptop:" params.laptopSocketId",
        mobile: params.mobileId,
        subjectId: params.subjectId,
        scenarioID: params.scenarioId,
        visionMode: params.visionMode
      }
    };

    // Log the initial START event
    this.logEvent('START', {});
  }

  /**
   * Log an event to the timeline
   */
  public logEvent(type: string, data: any): void {
    if (!this.currentSession) return;

    // Calculate relative time
    const t = Date.now() - this.currentSession.startTimestamp;

    // Construct the frame based on type to keep JSON clean
    const frame: TimelineEvent = { t, type };

    if (type === 'CAM') {
      // Flatten position/rotation for cleaner logs as requested
      frame.pos = data.pos;
      frame.rot = data.rot;
    } else {
      frame.data = data;
    }

    // Auto-increment collision counter
    if (type === 'COLLISION') {
      this.currentSession.collisionCount++;
    }

    this.currentSession.timeline.push(frame);
  }

  /**
   * Stop recording and write JSON to disk
   */
  public stopExperiment(): string | null {
    if (!this.currentSession) return null;

    const endTime = Date.now();
    const duration = endTime - this.currentSession.startTimestamp;
    
    // Log STOP event
    this.logEvent('STOP', {});

    // Finalize Metadata
    this.currentSession.meta.duration = duration;

    // Construct Final JSON Structure
    const finalOutput = {
      meta: this.currentSession.meta,
      numberOfCollision: this.currentSession.collisionCount,
      timeline: this.currentSession.timeline
    };

    // Save File
    const filename = `${this.currentSession.meta.id}.json`;
    const filePath = path.join(this.saveDir, filename);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(finalOutput, null, 2));
      console.log(`💾 ExperimentVault: Saved ${filename}`);
    } catch (err) {
      console.error("ExperimentVault: Failed to save file", err);
    }

    this.currentSession = null;
    return filename;
  }

  public isRecording(): boolean {
    return this.currentSession !== null;
  }
}

// Export Singleton
export const experimentVault = new ExperimentVault();