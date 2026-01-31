import React, { useState, useRef } from 'react'
import styles from "./ExperimentSidebar.module.css";
import Navbar from '../../level-0/Navbar/Navbar';
import ExperimentSidebarHeader from '../../level-0/ExperimentSidebarHeader/ExperimentSidebarHeader';
import CollisionPanel, { type CollisionPanelRef } from '../../level-0/CollisionPanel/CollisionPanel';
import RecordingPanel, { type RecordingPanelRef } from '../../level-0/RecordingPanel/RecordingPanel';
import ModeControlPanel from '../../level-0/ModeControlPanel/ModeControlPanel';
import AiFeedPanel from '../../level-0/AiFeedPanel/AiFeedPanel';
import WorldSettingsPanel from '../../level-0/WorldSettingsPanel/WorldSettingsPanel';
import SubjectSettingsPanel from '../../level-0/SubjectSettingsPanel/SubjectSettingsPanel';

interface ExperimentSidebarProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket?: any;
  // The WebSocket connection to the backend server
  // Used by RecordingPanel to start/stop experiments
  // Used by CollisionPanel to send alert status (DANGER/SAFE)

  isConnected?: boolean;
  // Laptop/Desktop connection status to the sync socket
  // Displays 🟢 or 🔴 in ExperimentSidebarHeader

  mobileId?: string;
  // Unique ID of the connected mobile viewer device
  // If empty/falsy, shows 🔴 (not connected)
  // Required to start recording (ensures mobile is ready)

  aiConnected?: boolean;
  // AI WebSocket connection status
  // Shows whether the AI processing stream is active

  subjectId?: string;
  // Identifier for the experiment subject (e.g., "test_subject_01")
  // Displayed in header and sent when starting recording
  // Used to organize experiment data files

  currentScenarioId?: string;
  // ID of the currently loaded scenario/world
  // Sent to backend when starting experiment
  // Helps track which environment was used

  visionMode?: string;
  // Current vision simulation mode: "normal", "prosthetic", or "low_res"
  // Passed to RecordingPanel for experiment metadata
  // ModeControlPanel can update this value

  hitboxRef?: React.RefObject<any>;
  // Reference to the A-Frame hitbox entity in 3D scene
  // CollisionPanel uses this to detect collisions
  // Optional - panel won't crash if not provided

  onVisionModeChange?: (mode: string) => void;
  // Callback when user changes vision mode in ModeControlPanel
  // Parent can update state and sync with other components

  onKMaxChange?: (k: number) => void;
  // Callback when user configures k_max (1, 2, or 3)
  // Parent can respond to AI configuration changes

  onOpenLoadDialog?: () => void;
  // Callback to open the scenario load dialog
  // Parent manages the dialog state

  saveLoadLoading?: boolean;
  // Indicates if scenario save/load operation is in progress
  // Used to disable load button during operations

  aiHudCanvasRef?: React.RefObject<HTMLCanvasElement>;
  // Reference to the canvas element for displaying AI vision feed
  // Shows the processed frames being sent to AI backend

  onFrameBufferChange?: (settings: { frequency: number; downsamplePercentage: number }) => void;
  // Callback when frame buffer settings change
  
  onWorldChange?: (settings: { width: number; depth: number; zShift: number; xShift: number }) => void;
  // Callback when world dimensions change
  
  onSubjectIdChange?: (id: string) => void;
  // Callback when subject ID changes
  
  onLiteModeChange?: (enabled: boolean) => void;
  // Callback when lite mode changes
  
  onThrottleChange?: (settings: { desktopMs: number; mobileMs: number }) => void;
  // Callback when throttle settings change
  
  onEyeControlChange?: (control: string) => void;
  // Callback when eye control mode changes

  wallsTransparent?: boolean;
  onTriggerWallVisibilty?: () => void;
}

const tabs = [
  { id: 'controls', label: 'C' },
  { id: 'settings', label: 'S' }
];

function ExperimentSidebar({
  socket,
  isConnected = false,
  mobileId = '',
  aiConnected = false,
  subjectId = 'test_subject_01',
  currentScenarioId = 'default',
  visionMode = 'prosthetic',
  hitboxRef,
  onVisionModeChange,
  onKMaxChange,
  onOpenLoadDialog,
  saveLoadLoading = false,
  aiHudCanvasRef,
  onFrameBufferChange,
  onWorldChange,
  onSubjectIdChange,
  onLiteModeChange,
  onThrottleChange,
  onEyeControlChange,
  wallsTransparent = true,
  onTriggerWallVisibilty,
}: ExperimentSidebarProps) {
  const [activeTab, setActiveTab] = useState<string>("controls");
  
  // Refs for component integration
  const recordingPanelRef = useRef<RecordingPanelRef>(null);
  const collisionPanelRef = useRef<CollisionPanelRef>(null);

  return (
    <div className={styles.sidebar}>
      <Navbar 
        tabs={tabs} 
        activeTabId={activeTab} 
        onTabClick={(tabId: string) => setActiveTab(tabId)} 
      />
      <div className={styles.content}>
        <ExperimentSidebarHeader 
          isConnected={isConnected} 
          mobileId={mobileId} 
          aiConnected={aiConnected}
          subjectId={subjectId}
        />
        
        {activeTab === 'controls' && (
          <div className={styles.workspace}>
            <RecordingPanel 
              ref={recordingPanelRef}
              socket={socket} 
              mobileId={mobileId} 
              subjectId={subjectId} 
              currentScenarioId={currentScenarioId} 
              visionMode={visionMode}
              onRecordingStart={() => {
                // Reset collision count when recording starts
                collisionPanelRef.current?.reset();
              }}
            />
            
            <CollisionPanel 
              ref={collisionPanelRef}
              hitboxRef={hitboxRef}
              socket={socket}
              onCollision={(detail) => {
                // Log collision to recording if active
                recordingPanelRef.current?.logCollision(detail.obstacleId);
              }}
            />
            {aiHudCanvasRef && (
              <AiFeedPanel canvasRef={aiHudCanvasRef} />
            )}
            <ModeControlPanel 
              disabled={false}
              onVisionModeChange={onVisionModeChange}
              onKMaxChange={onKMaxChange}
            />

               <button
                className={styles.loadButton}
                onClick={onTriggerWallVisibilty}
              >{!wallsTransparent ? '🧱 WALLS: visible' : '👻 WALLS: invisible'}
              </button>

            {onOpenLoadDialog && (
              <button
                className={styles.loadButton}
                onClick={onOpenLoadDialog}
                disabled={saveLoadLoading}
              >
                📂 Load Scenario
              </button>
            )}
           
          </div>
        )}
        
        {activeTab === 'settings' && (
          <div className={styles.workspace}>
            <SubjectSettingsPanel
              onSubjectIdChange={onSubjectIdChange}
              onEyeControlChange={onEyeControlChange}
            />
            
            <WorldSettingsPanel
              onFrameBufferChange={onFrameBufferChange}
              onWorldChange={onWorldChange}
              onLiteModeChange={onLiteModeChange}
              onThrottleChange={onThrottleChange}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default ExperimentSidebar