"""
VR Controller Diagnostic Tool
Tests multiple input methods to identify how your VR controller sends data
"""

import sys
import time

print("=" * 60)
print("VR Controller Diagnostic Tool")
print("=" * 60)
print("\nThis script will test your VR controller in multiple modes:")
print("1. Gamepad/Joystick mode (pygame)")
print("2. Keyboard events (pynput)")
print("3. Mouse events (pynput)")
print("4. Raw HID device detection")
print("\nPress Ctrl+C to stop any test\n")
print("=" * 60)

# Test 1: Gamepad/Joystick Detection
print("\n[TEST 1] Checking for Gamepad/Joystick...")
try:
    import pygame
    pygame.init()
    pygame.joystick.init()
    
    joystick_count = pygame.joystick.get_count()
    print(f"Found {joystick_count} joystick(s)")
    
    if joystick_count > 0:
        for i in range(joystick_count):
            joystick = pygame.joystick.Joystick(i)
            joystick.init()
            print(f"\n  Joystick {i}:")
            print(f"    Name: {joystick.get_name()}")
            print(f"    Axes: {joystick.get_numaxes()}")
            print(f"    Buttons: {joystick.get_numbuttons()}")
            print(f"    Hats: {joystick.get_numhats()}")
        
        print("\n  Testing gamepad input for 10 seconds...")
        print("  Move the rocker and press buttons!")
        
        start_time = time.time()
        last_print = start_time
        
        while time.time() - start_time < 20:
            pygame.event.pump()
            
            # Print every 0.5 seconds if there's movement
            if time.time() - last_print > 0.5:
                for i in range(joystick_count):
                    joystick = pygame.joystick.Joystick(i)
                    
                    # Check axes
                    axes_str = []
                    for axis_id in range(joystick.get_numaxes()):
                        value = joystick.get_axis(axis_id)
                        if abs(value) > 0.1:  # Deadzone
                            axes_str.append(f"Axis{axis_id}={value:.2f}")
                    
                    # Check buttons
                    buttons_str = []
                    for btn_id in range(joystick.get_numbuttons()):
                        if joystick.get_button(btn_id):
                            buttons_str.append(f"Btn{btn_id}")
                    
                    # Check hats
                    hats_str = []
                    for hat_id in range(joystick.get_numhats()):
                        hat_value = joystick.get_hat(hat_id)
                        if hat_value != (0, 0):
                            hats_str.append(f"Hat{hat_id}={hat_value}")
                    
                    if axes_str or buttons_str or hats_str:
                        output = f"  Joy{i}: "
                        if axes_str:
                            output += " ".join(axes_str) + " "
                        if buttons_str:
                            output += " ".join(buttons_str) + " "
                        if hats_str:
                            output += " ".join(hats_str)
                        print(output)
                
                last_print = time.time()
        
        print("  ✓ Gamepad test complete")
    else:
        print("  ✗ No gamepads detected")
        
    pygame.quit()
    
except ImportError:
    print("  ⚠ pygame not installed. Install with: pip install pygame")
except Exception as e:
    print(f"  ✗ Error: {e}")

# # Test 2: Keyboard Events
# print("\n[TEST 2] Checking for Keyboard events...")
# try:
#     from pynput import keyboard
    
#     print("  Listening for keyboard events for 10 seconds...")
#     print("  Press any buttons on the controller!")
    
#     detected_keys = []
    
#     def on_press(key):
#         try:
#             key_str = f"'{key.char}'" if hasattr(key, 'char') else str(key)
#             if key_str not in detected_keys:
#                 detected_keys.append(key_str)
#             print(f"    Key pressed: {key_str} (Code: {key if hasattr(key, 'vk') else 'N/A'})")
#         except Exception as e:
#             print(f"    Key event error: {e}")
    
#     listener = keyboard.Listener(on_press=on_press)
#     listener.start()
    
#     time.sleep(10)
#     listener.stop()
    
#     if detected_keys:
#         print(f"  ✓ Detected keys: {', '.join(detected_keys)}")
#     else:
#         print("  ✗ No keyboard events detected")
    
# except ImportError:
#     print("  ⚠ pynput not installed. Install with: pip install pynput")
# except Exception as e:
#     print(f"  ✗ Error: {e}")

# # Test 3: Mouse Events
# print("\n[TEST 3] Checking for Mouse events...")
# try:
#     from pynput import mouse
    
#     print("  Listening for mouse events for 10 seconds...")
#     print("  Move the rocker!")
    
#     class MouseCounter:
#         def __init__(self):
#             self.movement_count = 0
#             self.button_count = 0
    
#     counter = MouseCounter()
    
#     def on_move(x, y):
#         counter.movement_count += 1
#         if counter.movement_count % 50 == 0:  # Print every 50 movements
#             print(f"    Mouse moved to: ({x}, {y})")
    
#     def on_click(x, y, button, pressed):
#         counter.button_count += 1
#         action = "pressed" if pressed else "released"
#         print(f"    Mouse button {button} {action} at ({x}, {y})")
    
#     def on_scroll(x, y, dx, dy):
#         print(f"    Mouse scroll: ({dx}, {dy}) at ({x}, {y})")
    
#     listener = mouse.Listener(on_move=on_move, on_click=on_click, on_scroll=on_scroll)
#     listener.start()
    
#     time.sleep(10)
#     listener.stop()
    
#     if counter.movement_count > 0 or counter.button_count > 0:
#         print(f"  ✓ Detected {counter.movement_count} mouse movements, {counter.button_count} button events")
#     else:
#         print("  ✗ No mouse events detected")
    
# except ImportError:
#     print("  ⚠ pynput not installed. Install with: pip install pynput")
# except Exception as e:
#     print(f"  ✗ Error: {e}")

# # Test 4: HID Device Detection
# print("\n[TEST 4] Checking for HID devices...")
# try:
#     import hid
    
#     print("  Scanning for HID devices...")
#     devices = hid.enumerate()
    
#     vr_related = []
#     for device in devices:
#         device_name = device['product_string'].lower() if device['product_string'] else ''
#         manufacturer = device['manufacturer_string'].lower() if device['manufacturer_string'] else ''
        
#         # Look for VR/controller keywords
#         keywords = ['vr', 'controller', 'remote', 'bluetooth', 'gamepad', 'joystick']
#         if any(keyword in device_name or keyword in manufacturer for keyword in keywords):
#             vr_related.append(device)
#             print(f"\n  Potential VR Controller:")
#             print(f"    Product: {device['product_string']}")
#             print(f"    Manufacturer: {device['manufacturer_string']}")
#             print(f"    Vendor ID: 0x{device['vendor_id']:04x}")
#             print(f"    Product ID: 0x{device['product_id']:04x}")
#             print(f"    Path: {device['path']}")
    
#     if vr_related:
#         print(f"\n  ✓ Found {len(vr_related)} potential VR controller(s)")
#     else:
#         print("  ⚠ No VR-related devices found in HID list")
#         print("  All HID devices:")
#         for device in devices[:10]:  # Show first 10
#             print(f"    - {device['product_string']} ({device['manufacturer_string']})")
    
# except ImportError:
#     print("  ⚠ hidapi not installed. Install with: pip install hidapi")
# except Exception as e:
#     print(f"  ✗ Error: {e}")

# # Summary
# print("\n" + "=" * 60)
# print("DIAGNOSTIC COMPLETE")
# print("=" * 60)
# print("\nSUMMARY:")
# print("• If gamepad detected: Use pygame or web Gamepad API")
# print("• If keyboard detected: Controller sends keyboard codes")
# print("• If mouse detected: Controller sends mouse events (current setup)")
# print("• If HID only: Need custom driver or HID library")
# print("\nNext steps:")
# print("1. Check which test detected your controller")
# print("2. Note the exact output (axes/buttons/keys)")
# print("3. We'll adjust the code based on what works")
# print("=" * 60)
