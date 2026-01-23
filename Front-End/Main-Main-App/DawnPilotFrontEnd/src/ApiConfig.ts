// src/ApiConfig.ts

// 1. Get current URL details
const protocol = window.location.protocol; // e.g. 'https:'
const hostname = window.location.hostname; // e.g. '192.168.1.5'
const port = window.location.port ? `:${window.location.port}` : "";

// 2. Determine WebSocket protocol (wss if https, ws if http)
const isSecure = protocol === 'https:';
const wsProtocol = isSecure ? 'wss:' : 'ws:';

export const SERVER_IP = hostname;
export const IS_LOCALHOST = hostname === "localhost" || hostname === "127.0.0.1";

// 3. Helper for generic URLs
export const getClientUrl = (path: string) => {
  return `${protocol}//${hostname}${port}${path}`;
};

export const URLS = {
  // Sync Socket: Connect to the SAME address as the website (Port 5173)
  // Vite will see the request and proxy it to Port 5000
  SYNC_SOCKET: `${protocol}//${hostname}${port}`, 

  // Scenario API: Relative path, handled by Vite Proxy
  SCENARIO_API: `/scenario`,
  
  // AI Stream: Connect to the SAME address as the website (Port 5173)
  // Vite will proxy "/ws" to Port 8000
  AI_STREAM: `${wsProtocol}//${hostname}${port}`
};