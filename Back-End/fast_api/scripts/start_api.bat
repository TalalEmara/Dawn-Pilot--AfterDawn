@echo off
REM Startup script for Phosphene Vision FastAPI Service (Windows)

echo ========================================
echo Phosphene Vision API - Starting Server
echo ========================================
echo.

REM Check if virtual environment exists
if not exist "venv\" (
    echo Creating virtual environment...
    python -m venv venv
    echo.
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install/upgrade dependencies
echo.
echo Installing dependencies...
pip install -r ..\requirements.txt

REM Change to parent directory
cd ..

REM Start the server
echo.
echo ========================================
echo Starting FastAPI server on port 8000
echo API Docs: http://localhost:8000/docs
echo ========================================
echo.

python main.py

REM Keep window open on error
if errorlevel 1 (
    echo.
    echo Error occurred! Press any key to exit...
    pause > nul
)
