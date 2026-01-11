

// 1. Run 'ipconfig' (Windows) or 'ifconfig' (Mac/Linux) to find your PC's IP.
// 2. Paste it here.
export const SERVER_IP = "10.242.188.161"; //192.168.100.8 

export const URLS = {
  // Backend 1: Camera Sync & World Data (Flask/Node)
  SYNC_SOCKET: `http://${SERVER_IP}:5000`,
  SCENARIO_API: `http://${SERVER_IP}:5000/scenario`,
  
  // Backend 2: Phosphene AI Stream (FastAPI)
  AI_STREAM: `http://${SERVER_IP}:8000`
};