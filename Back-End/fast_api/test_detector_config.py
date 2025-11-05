#!/usr/bin/env python3
"""
Test Detector Configuration

Quick script to verify your detector_config.json is set up correctly
and your model files are accessible.
"""

import os
import json
from realtime_detector import create_detector

def test_detector_config():
    """Test loading detector from config file"""
    
    print("=" * 60)
    print("DETECTOR CONFIGURATION TEST")
    print("=" * 60)
    
    # Load config
    config_path = "detector_config.json"
    
    if not os.path.exists(config_path):
        print("❌ ERROR: detector_config.json not found!")
        print(f"   Expected location: {os.path.abspath(config_path)}")
        return False
    
    print(f"✓ Found config file: {config_path}\n")
    
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        print("✓ Config file loaded successfully\n")
    except Exception as e:
        print(f"❌ ERROR loading config: {e}")
        return False
    
    # Display config
    print("Configuration:")
    print(json.dumps(config, indent=2))
    print()
    
    # Check detector type
    detector_type = config.get("detector_type", "mock")
    print(f"Detector Type: {detector_type}")
    print("-" * 60)
    
    # Test detector initialization
    if detector_type == "mock":
        print("\n✓ Mock detector selected - no files needed")
        detector = create_detector("mock")
        
    elif detector_type == "yolo":
        print("\nChecking YOLO configuration...")
        yolo_config = config.get("yolo", {})
        
        # Check model file
        model_path = yolo_config.get("model_path", "")
        
        print(f"  Model: {model_path}")
        print()
        
        # Check if it's a pre-trained model (will be auto-downloaded)
        pretrained_models = [
            'yolov5n.pt', 'yolov5s.pt', 'yolov5m.pt', 'yolov5l.pt', 'yolov5x.pt',
            'yolov8n.pt', 'yolov8s.pt', 'yolov8m.pt', 'yolov8l.pt', 'yolov8x.pt',
            'yolov9c.pt', 'yolov9e.pt'
        ]
        
        is_pretrained = model_path in pretrained_models
        
        if is_pretrained:
            print(f"  ℹ Pre-trained model detected: {model_path}")
            print(f"  ℹ Will be automatically downloaded on first use")
        elif not os.path.exists(model_path):
            print(f"  ❌ Model file not found: {model_path}")
            print(f"  ℹ If this is a pre-trained model, make sure the name is correct")
            print(f"     Valid pre-trained models: yolov8n.pt, yolov8s.pt, yolov8m.pt, etc.")
            return False
        else:
            print(f"  ✓ Model file exists")
            file_size = os.path.getsize(model_path) / (1024 * 1024)  # MB
            print(f"     Size: {file_size:.1f} MB")
        
        print("\nAttempting to load YOLO detector...")
        print("  (This may take a moment for first-time download of pre-trained models)")
        detector = create_detector(
            "yolo",
            model_path=model_path,
            conf_threshold=yolo_config.get("conf_threshold", 0.5)
        )
        
    elif detector_type == "fasterrcnn":
        print("\nChecking Faster R-CNN configuration...")
        frcnn_config = config.get("fasterrcnn", {})
        
        model_path = frcnn_config.get("model_path", "")
        print(f"  Model: {model_path}")
        
        if model_path and not os.path.exists(model_path):
            print(f"  ❌ Model file not found: {model_path}")
            return False
        elif model_path:
            print(f"  ✓ Model file exists")
        else:
            print(f"  ⚠ No model path (will use pre-trained COCO model)")
        
        print("\nAttempting to load Faster R-CNN detector...")
        detector = create_detector(
            "fasterrcnn",
            model_path=model_path if model_path else None,
            conf_threshold=frcnn_config.get("conf_threshold", 0.5)
        )
    
    else:
        print(f"❌ Unknown detector type: {detector_type}")
        return False
    
    # Check if detector loaded
    print()
    if detector.is_loaded:
        print("=" * 60)
        print("✅ SUCCESS! Detector loaded successfully")
        print(f"   Type: {detector_type}")
        print(f"   Classes: {len(detector.classes)}")
        print(f"   Ready to use!")
        print("=" * 60)
        return True
    else:
        print("=" * 60)
        print("❌ FAILED! Detector did not load properly")
        print("   Check error messages above for details")
        print("=" * 60)
        return False


if __name__ == "__main__":
    success = test_detector_config()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ All tests passed!")
        print("   You can now run: python realtime_camera_gui.py")
    else:
        print("❌ Configuration needs fixes")
        print("   See YOLO_INTEGRATION_GUIDE.md for help")
    print("=" * 60)
