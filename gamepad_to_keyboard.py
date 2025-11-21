"""
VR Gamepad to Keyboard Mapper
Maps your "axis 12 button gamepad" rocker to WASD keyboard inputs
This runs in the background and converts gamepad inputs to keyboard presses
"""

import pygame
import time
from pynput.keyboard import Controller, Key

# Initialize
pygame.init()
pygame.joystick.init()

keyboard = Controller()

# Configuration
DEADZONE = 0.3  # Ignore small movements below this threshold
UPDATE_RATE = 0.02  # 50Hz update rate (20ms)

print("=" * 60)
print("VR Gamepad to Keyboard Mapper")
print("=" * 60)
print("\nController detected:")

# Initialize joystick
if pygame.joystick.get_count() == 0:
    print("ERROR: No gamepad detected!")
    print("Make sure your VR controller is connected via Bluetooth")
    input("Press Enter to exit...")
    exit(1)

joystick = pygame.joystick.Joystick(0)
joystick.init()

print(f"  Name: {joystick.get_name()}")
print(f"  Axes: {joystick.get_numaxes()}")
print(f"  Buttons: {joystick.get_numbuttons()}")
print()
print("Mapping configuration:")
print("  Axis0 (horizontal): LEFT = A key, RIGHT = D key")
print("  Axis1 (vertical):   UP = W key, DOWN = S key")
print(f"  Deadzone: {DEADZONE}")
print()
print("=" * 60)
print("MAPPER ACTIVE - Move rocker to control WASD")
print("Press Ctrl+C to stop")
print("=" * 60)
print()

# Track key states to avoid repeated presses
keys_pressed = {'w': False, 'a': False, 's': False, 'd': False}

try:
    while True:
        pygame.event.pump()  # Process pygame events
        
        # Read axes
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
                
                # Show status
                direction = {
                    'w': '↑ Forward',
                    's': '↓ Backward',
                    'a': '← Left',
                    'd': '→ Right'
                }[key_name]
                print(f"[{time.strftime('%H:%M:%S')}] Pressing {key_name.upper()}: {direction} (Axis0={axis0:.2f}, Axis1={axis1:.2f})")
                
            elif not should_be_pressed and keys_pressed[key_name]:
                # Release key
                keyboard.release(key_name)
                keys_pressed[key_name] = False
                print(f"[{time.strftime('%H:%M:%S')}] Released {key_name.upper()}")
        
        time.sleep(UPDATE_RATE)

except KeyboardInterrupt:
    print("\n" + "=" * 60)
    print("Stopping mapper...")
    
    # Release all keys
    for key_name, is_pressed in keys_pressed.items():
        if is_pressed:
            keyboard.release(key_name)
    
    print("All keys released")
    print("=" * 60)
    
    pygame.quit()
