import { useMutation } from "@tanstack/react-query";

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Overrides {
  Position?: Vector3;
  Rotation?: Vector3;
  Scale?: Vector3;
  Color?: { value: string };
}

interface CreateEntityPayload {
  modelName: string;
  overrides: Overrides;
}

export const useCreateEntityFromModel = () => {
  return useMutation({
    mutationFn: async (payload: CreateEntityPayload) => {
      const res = await fetch("http://localhost:5000/scenario/entities/from-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      return res.json();
    },
  });
};
