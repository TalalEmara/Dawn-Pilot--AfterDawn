#!/bin/bash
# Startup script for Phosphene Vision FastAPI Service (Linux/Mac)

echo "========================================"
echo "Phosphene Vision API - Starting Server"
echo "========================================"
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo ""
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install/upgrade dependencies
echo ""
echo "Installing dependencies..."
pip install -r ../requirements.txt

# Change to parent directory
cd ..

# Start the server
echo ""
echo "========================================"
echo "Starting FastAPI server on port 8000"
echo "API Docs: http://localhost:8000/docs"
echo "========================================"
echo ""

python main.py
