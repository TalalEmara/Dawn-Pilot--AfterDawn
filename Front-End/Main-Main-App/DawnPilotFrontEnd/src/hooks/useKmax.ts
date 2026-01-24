import { useMutation } from '@tanstack/react-query';


export function useKMax() {
  const { mutate, isPending, error } = useMutation({
    mutationFn: async (k: number) => {
      // Construct URL dynamically matching your structure
      const response = await fetch(`/api/configure_new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k_max: k }),
      });

      if (!response.ok) {
        throw new Error(`Failed to configure k_max: ${response.statusText}`);
      }
      
      return k;
    },
    onError: (err) => {
      console.error("❌ Error configuring k_max:", err);
      alert(`Error configuring k_max: ${err}`);
    }
  });

  return {
    configureKMax: mutate,
    loading: isPending,
    error
  };
}