import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { URLS } from '../ApiConfig';

export interface Entity {
  Collision: any;
  name: string;
  id: string;
  Position?: { x: number; y: number; z: number };
  Rotation?: { x: number; y: number; z: number };
  Scale?: { x: number; y: number; z: number };
  Color?: { value: string };
  Model?: { url: string };
}

interface ScenarioWorld {
  entities: Entity[];
}

const API_BASE_URL = URLS.SCENARIO_API;

// Query keys
const scenarioKeys = {
  all: ['scenario'] as const,
  world: () => [...scenarioKeys.all, 'world'] as const,
};

/**
 * Fetch the current scenario world
 */
async function fetchScenarioWorld(): Promise<ScenarioWorld> {
  const response = await fetch(`${API_BASE_URL}/scenario-world`);
  
  if (!response.ok) {
    throw new Error(`Failed to load world: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Create a new empty scenario world
 */
async function createScenarioWorld(): Promise<ScenarioWorld> {
  const response = await fetch(`${API_BASE_URL}/scenario-worlds`, {
    method: 'POST'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create world: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.world;
}

export function useScenarioWorld() {
  const queryClient = useQueryClient();

  // Query for fetching world data
  const {
    data: world = { entities: [] },
    isLoading: loading,
    error,
    refetch: loadWorld
  } = useQuery({
    queryKey: scenarioKeys.world(),
    queryFn: fetchScenarioWorld,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
  });

  // Mutation for creating new world
  const createNewWorldMutation = useMutation({
    mutationFn: createScenarioWorld,
    onSuccess: (newWorld) => {
      // Update the cache with the new world
      queryClient.setQueryData(scenarioKeys.world(), newWorld);
    },
  });

  // Manual setter for optimistic updates
  const setWorld = (newWorld: ScenarioWorld) => {
    queryClient.setQueryData(scenarioKeys.world(), newWorld);
  };

  return {
    world,
    loading,
    error: error ? (error as Error).message : null,
    loadWorld,
    createNewWorld: createNewWorldMutation.mutateAsync,
    setWorld
  };
}