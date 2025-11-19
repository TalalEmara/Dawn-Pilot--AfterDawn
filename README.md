# Dawn Pilot – AfterDawn

A web platform to build and manage **VR experiments for bionic eye systems**, allowing researchers to create scenarios and analyze subject performance.

---

## 🚀 Recent Updates

### Real-Time VR Synchronization & GPS Tracking (Nov 2025)

**Implemented Features:**
- ✅ **HTTPS Support**: Self-signed SSL certificates for VR mode and device sensor access on mobile
- ✅ **Dynamic API Configuration**: Auto-detection of backend URLs based on hostname
- ✅ **WebSocket Real-Time Sync**: Bidirectional camera synchronization between mobile and desktop
- ✅ **GPS-Based Movement**: Real-world position tracking with 7x scale multiplier for visibility
- ✅ **Desktop Viewer**: Monitor and control mobile VR session from desktop browser
- ✅ **Dual Sync Modes**: 
  - **Manual Mode**: Desktop controls, mobile follows (when WASD pressed)
  - **Sync Mode**: Mobile GPS active, desktop follows (2s after last desktop input)
- ✅ **Visual Feedback**: Grid patterns, movement trails, lighting improvements
- ✅ **Entity/Model System**: Dynamic loading of 3D models (GLTF) and primitives

**Technical Stack:**
- Frontend: Vite + React 19.2 + A-Frame 1.7.1 + Socket.IO Client 4.8.1
- Backend: Node.js HTTPS + Express + Socket.IO 4.8.1
- Ports: 5173 (frontend), 5000 (backend), 8000 (FastAPI)

**Known Issues:**
- ⚠️ **GPS Accuracy**: GPS tracking needs refinement - position sometimes resets or shows inaccurate readings (0.3m → 0m)
- ⚠️ **VR Button**: VR mode entry button not functioning properly on some mobile browsers
- ⚠️ **Sync Stability**: Camera synchronization between devices occasionally drops or lags

**Setup Instructions:**
1. Accept self-signed certificates in both mobile and desktop browsers
2. Connect devices to same WiFi network (currently configured for 192.168.100.8)
3. Mobile: Navigate to `https://<IP>:5173/` for VR view
4. Desktop: Navigate to `https://<IP>:5173/desktop` for monitoring

---

## Naming Conventions

### 📂 Folder Names
- Start each word with a **capital letter**.  
- Replace spaces with a **dash (`-`)**.  
- Example:  
    Data Models → Data-Models
### 📄 File Names

#### 🔧 Back-End
- Use `api_Main` style (snake + Pascal hybrid).  
- Example:  
    api_Experiment.ts       

#### 🎨 Front-End (React)
- Follow **React defaults**:
- **Components** → Start with a capital letter.  
  ```
  MyComponent.tsx
  ```
- **Custom Hooks** → Use `useHook` PascalCase style.  
  ```
  useFetchData.ts
  ```
