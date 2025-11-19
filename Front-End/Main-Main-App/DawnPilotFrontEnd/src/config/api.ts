// Auto-detect backend URL or use environment variable
const getBackendUrl = (): string => {
  // Check if environment variable is set
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Auto-detect based on current window location
  const protocol = window.location.protocol; // 'https:' or 'http:'
  const hostname = window.location.hostname; // IP or domain
  
  // Default backend port
  const backendPort = 5000;
  
  return `${protocol}//${hostname}:${backendPort}`;
};

export const API_BASE_URL = getBackendUrl();
export const SOCKET_URL = API_BASE_URL;
export const SCENARIO_API_URL = `${API_BASE_URL}/scenario`;
