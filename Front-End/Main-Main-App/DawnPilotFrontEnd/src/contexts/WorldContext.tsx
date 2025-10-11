import { createContext, useContext } from 'react';

interface Cube {
  id: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  color: string;
}

interface WorldState {
  cubes: Cube[];
}

interface WorldContextType {
  worldState: WorldState;
  loading: boolean;
  loadWorld: () => Promise<void>;
  addCube: (cubeData?: {
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    color?: string;
  }) => Promise<void>;
  removeCube: () => Promise<void>;
  saveWorld: () => Promise<void>;
}

const WorldContext = createContext<WorldContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useWorld = () => {
  const context = useContext(WorldContext);
  if (!context) {
    throw new Error('useWorld must be used within WorldProvider');
  }
  return context;
};

export default WorldContext;