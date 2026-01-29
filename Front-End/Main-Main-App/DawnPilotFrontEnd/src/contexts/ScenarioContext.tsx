import { createContext, useContext } from 'react';
import type { Entity } from '../hooks/useScenarioWorld';
import type { ModelInfo } from '../hooks/useModelLibrary.ts';

export interface World {
  entities: Entity[];
}

// In ScenarioContext.ts
export interface ScenarioContextType {
  world: World;
  models: ModelInfo[];
  loading: boolean;
  error: string | null;
  loadWorld: () => Promise<void>;
  createNewWorld: () => Promise<void>;
  addEntity: (modelName: string, overrides?: Record<string, any>) => Promise<void>;
  removeLastEntity: () => Promise<void>;
  deleteEntity: (entityId: string) => Promise<void>;
  queryEntities: (query: any) => Promise<any>;
  onModelSelect?: (modelName: string) => void; // Add this
}

const ScenarioContext = createContext<ScenarioContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useScenario = () => {
  const context = useContext(ScenarioContext);
  if (!context) {
    throw new Error('useScenario must be used within ScenarioContext.Provider');
  }
  return context;
};

export default ScenarioContext;