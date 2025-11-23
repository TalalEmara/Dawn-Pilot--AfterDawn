"""
VR Controller to Keyboard Mapper - Android/Termux Version
Maps VR controller rocker to WASD keyboard inputs directly on your phone
No network needed - controller is converted to keyboard locally!

SETUP ON ANDROID:
1. Install Termux from F-Droid (NOT Google Play)
2. In Termux run:
   pkg update && pkg upgrade
   pkg install python
   pip install pygame pynput
3. Pair VR controller via Bluetooth
4. Run this script: python phone_gamepad_to_keyboard.py
5. Open browser and use controller like keyboard!

The controller acts as keyboard input - browser will see WASD keys
"""

import time

try:
    import pygame
    PYGAME_OK = True
except ImportError:
    print("❌ pygame not installed!")
    print("Install: pip install pygame")
    PYGAME_OK = False

try:
    from pynput.keyboard import Controller, Key
    PYNPUT_OK = True
except ImportError:
    print("❌ pynput not installed!")
    print("Install: pip install pynput")
    print("\nNOTE: pynput may not work on all Android devices")
    print("Alternative: Use evdev for direct input device access")
    PYNPUT_OK = False

# Configuration
DEADZONE = 0.3  # Ignore small movements
UPDATE_RATE = 0.02  # 50Hz (20ms)

def main():
    if not PYGAME_OK or not PYNPUT_OK:
        print("\n❌ Missing dependencies")
        return
    
    # Initialize
    pygame.init()
    pygame.joystick.init()
    
    keyboard = Controller()
    
    print("=" * 60)
    print("🎮 VR CONTROLLER → KEYBOARD MAPPER")
    print("=" * 60)
    print()
    
    # Check for controller
    if pygame.joystick.get_count() == 0:
        print("❌ No controller detected!")
        print()
        print("Troubleshooting:")
        print("  1. Go to Settings → Bluetooth")
        print("  2. Make sure controller is paired")
        print("  3. Try reconnecting controller")
        print("  4. Restart Termux")
        print()
        input("Press Enter to exit...")
        return
    
    # Initialize joystick
    joystick = pygame.joystick.Joystick(0)
    joystick.init()
    
    print("✅ Controller detected!")
    print(f"   Name: {joystick.get_name()}")
    print(f"   Axes: {joystick.get_numaxes()}")
    print(f"   Buttons: {joystick.get_numbuttons()}")
    print()
    print("Mapping:")
    print("  Rocker Up    → W key (forward)")
    print("  Rocker Down  → S key (backward)")
    print("  Rocker Left  → A key (left)")
    print("  Rocker Right → D key (right)")
    print(f"  Deadzone: {DEADZONE}")
    print()
    print("=" * 60)
    print("✅ MAPPER ACTIVE")
    print("Move controller rocker - browser will see WASD keys")
    print("Press Ctrl+C to stop")
    print("=" * 60)
    print()
    
    # Track key states
    keys_pressed = {'w': False, 'a': False, 's': False, 'd': False}
    
    try:
        while True:
            pygame.event.pump()
            
            # Read axes
            if joystick.get_numaxes() >= 2:
                axis0 = joystick.get_axis(0)  # Horizontal: -1 (left) to +1 (right)
                axis1 = joystick.get_axis(1)  # Vertical: -1 (up) to +1 (down)
                
                # Determine which keys should be pressed
                should_press = {
                    'w': axis1 < -DEADZONE,  # Up
                    's': axis1 > DEADZONE,   # Down
                    'a': axis0 < -DEADZONE,  # Left
                    'd': axis0 > DEADZONE    # Right
                }
                
                # Press/release keys as needed
                for key_name, should_be_pressed in should_press.items():
                    if should_be_pressed and not keys_pressed[key_name]:
                        # Press key
                        keyboard.press(key_name)
                        keys_pressed[key_name] = True
                        
                        direction = {
                            'w': '↑ Forward',
                            's': '↓ Backward',
                            'a': '← Left',
                            'd': '→ Right'
                        }[key_name]
                        
                        print(f"[{time.strftime('%H:%M:%S')}] ✅ {key_name.upper()}: {direction} (axis: {axis0:.2f}, {axis1:.2f})")
                        
                    elif not should_be_pressed and keys_pressed[key_name]:
                        # Release key
                        keyboard.release(key_name)
                        keys_pressed[key_name] = False
                        print(f"[{time.strftime('%H:%M:%S')}] ⬜ Released {key_name.upper()}")
            
            time.sleep(UPDATE_RATE)
    
    except KeyboardInterrupt:
        print("\n" + "=" * 60)
        print("🛑 Stopping mapper...")
        
        # Release all keys
        for key_name, is_pressed in keys_pressed.items():
            if is_pressed:
                keyboard.release(key_name)
        
        print("✅ All keys released")
        print("=" * 60)
    
    finally:
        pygame.quit()

if __name__ == "__main__":
    main()
