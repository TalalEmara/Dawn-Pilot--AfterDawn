@echo off
echo Installing Python dependencies for VR controller testing...
echo.

echo [1/3] Installing pygame (gamepad/joystick support)...
pip install pygame

echo.
echo [2/3] Installing pynput (keyboard/mouse events)...
pip install pynput

echo.
echo [3/3] Installing hidapi (raw HID device access)...
pip install hidapi

echo.
echo ========================================
echo Setup complete!
echo ========================================
echo.
echo To run the diagnostic tool:
echo   python test_vr_controller.py
echo.
pause
