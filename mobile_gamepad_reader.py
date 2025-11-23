"""
Mobile Gamepad Reader for Android
Reads VR controller via pygame and sends to WebSocket

SETUP ON ANDROID:
1. Install Termux from F-Droid: https://f-droid.org/en/packages/com.termux/
2. In Termux, run:
   pkg install python
   pip install pygame websockets
3. Pair your VR controller via Bluetooth settings
4. Run this script: python mobile_gamepad_reader.py

ALTERNATIVE: Use Pydroid 3 app (easier but limited)
"""

import asyncio
import json
import time

try:
    import pygame
    PYGAME_OK = True
except ImportError:
    print("❌ pygame not installed")
    print("Install: pip install pygame")
    PYGAME_OK = False

try:
    import websockets
    WEBSOCKETS_OK = True
except ImportError:
    print("❌ websockets not installed")  
    print("Install: pip install websockets")
    WEBSOCKETS_OK = False

class MobileGamepadBridge:
    def __init__(self, server_ip="192.168.100.8", server_port=5000):
        self.ws_url = f"wss://{server_ip}:{server_port}"  # Use WSS for HTTPS
        self.position = {"x": 0, "y": 2, "z": 0}
        self.rotation = {"x": 0, "y": 0, "z": 0}
        self.joystick = None
        
    def init_gamepad(self):
        """Initialize pygame and find controller"""
        pygame.init()
        pygame.joystick.init()
        
        count = pygame.joystick.get_count()
        print(f"🎮 Gamepads found: {count}")
        
        if count == 0:
            print("❌ No gamepad detected!")
            print("Make sure controller is paired in Settings → Bluetooth")
            return False
        
        self.joystick = pygame.joystick.Joystick(0)
        self.joystick.init()
        
        print(f"✅ Connected: {self.joystick.get_name()}")
        print(f"   Axes: {self.joystick.get_numaxes()}")
        print(f"   Buttons: {self.joystick.get_numbuttons()}")
        return True
    
    async def run(self):
        """Main loop"""
        if not self.init_gamepad():
            return
        
        print(f"\n🔌 Connecting to: {self.ws_url}")
        print("   (Make sure WebSocket server is running)")
        
        try:
            async with websockets.connect(self.ws_url, ssl=True) as ws:
                print("✅ Connected to WebSocket!")
                
                # Identify as controller
                await ws.send(json.dumps({
                    "type": "client_type",
                    "clientType": "mobile_gamepad"
                }))
                
                print("\n" + "="*50)
                print("🎮 CONTROLLER ACTIVE")
                print("Move joystick to control movement")
                print("Press Ctrl+C to stop")
                print("="*50 + "\n")
                
                move_speed = 0.15
                deadzone = 0.3
                last_send = 0
                send_interval = 1/60  # 60 FPS
                
                while True:
                    pygame.event.pump()
                    
                    has_input = False
                    vel_x = 0
                    vel_z = 0
                    
                    # Read joystick axes
                    if self.joystick.get_numaxes() >= 2:
                        axis0 = self.joystick.get_axis(0)  # Horizontal
                        axis1 = self.joystick.get_axis(1)  # Vertical
                        
                        # Forward/Backward
                        if axis1 < -deadzone:
                            vel_z += abs(axis1) * move_speed
                            has_input = True
                        elif axis1 > deadzone:
                            vel_z -= abs(axis1) * move_speed
                            has_input = True
                        
                        # Left/Right
                        if axis0 < -deadzone:
                            vel_x -= abs(axis0) * move_speed
                            has_input = True
                        elif axis0 > deadzone:
                            vel_x += abs(axis0) * move_speed
                            has_input = True
                    
                    # Read buttons for up/down
                    if self.joystick.get_numbuttons() > 0:
                        if self.joystick.get_button(0):  # Button 0 = Up
                            self.position["y"] += 0.05
                            has_input = True
                        if self.joystick.get_numbuttons() > 1:
                            if self.joystick.get_button(1):  # Button 1 = Down
                                self.position["y"] -= 0.05
                                has_input = True
                    
                    # Apply movement
                    if has_input:
                        self.position["x"] += vel_x
                        self.position["z"] += vel_z
                        
                        # Send to WebSocket (throttled)
                        now = time.time()
                        if now - last_send >= send_interval:
                            msg = {
                                "type": "camera_update",
                                "position": self.position.copy(),
                                "rotation": self.rotation.copy(),
                                "timestamp": now * 1000
                            }
                            await ws.send(json.dumps(msg))
                            last_send = now
                            
                            print(f"📍 X:{self.position['x']:.1f} Y:{self.position['y']:.1f} Z:{self.position['z']:.1f}", end='\r')
                    
                    await asyncio.sleep(0.016)  # ~60 FPS
                    
        except KeyboardInterrupt:
            print("\n\n⏹️ Stopped by user")
        except Exception as e:
            print(f"\n❌ Error: {e}")
            print("\nTroubleshooting:")
            print("  • Is WebSocket server running?")
            print("  • Is the IP address correct?")
            print("  • Are you on the same network?")
        finally:
            if PYGAME_OK:
                pygame.quit()

def main():
    if not PYGAME_OK or not WEBSOCKETS_OK:
        print("\n❌ Missing dependencies. Install them first.")
        return
    
    print("="*60)
    print("🎮 MOBILE GAMEPAD BRIDGE")
    print("="*60)
    print("\nThis reads your VR controller and sends data to browser")
    print()
    
    ip = input("Server IP [192.168.100.8]: ").strip() or "192.168.100.8"
    
    bridge = MobileGamepadBridge(server_ip=ip)
    
    try:
        asyncio.run(bridge.run())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")

if __name__ == "__main__":
    main()
