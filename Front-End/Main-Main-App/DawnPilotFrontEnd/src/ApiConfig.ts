
// Dynamically get the IP from the browser's address bar
// This works for localhost AND for mobile devices on the network
const ip = window.location.hostname;

export const SERVER_IP = ip;

export const URLS = {
  // Backend 1: Camera Sync & World Data (Flask/Node)
  SYNC_SOCKET: `http://${SERVER_IP}:5000`,
  SCENARIO_API: `http://${SERVER_IP}:5000/scenario`,
  
  // Backend 2: Phosphene AI Stream (FastAPI)
  AI_STREAM: `http://${SERVER_IP}:8000`
};