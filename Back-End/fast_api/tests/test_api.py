#!/usr/bin/env python3
"""
Quick test script for Phosphene Vision API

Tests all endpoints to verify the API is working correctly.
"""

import requests
import json
import base64
import os
from io import BytesIO
from PIL import Image
import numpy as np

# API base URL
BASE_URL = "http://localhost:8000"

def print_header(title):
    """Print a formatted header"""
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def create_test_image():
    """Create a simple test image"""
    # Create a 640x480 color image with some shapes
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Add colored rectangles
    img[100:200, 100:200] = [255, 0, 0]  # Red square
    img[200:350, 300:500] = [0, 255, 0]  # Green rectangle
    img[350:450, 150:250] = [0, 0, 255]  # Blue square
    
    # Convert to PIL and then to base64
    pil_img = Image.fromarray(img)
    buffer = BytesIO()
    pil_img.save(buffer, format='PNG')
    img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    return img_base64

def test_health():
    """Test health check endpoint"""
    print_header("Testing Health Check")
    
    try:
        response = requests.get(f"{BASE_URL}/api/health")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check passed")
            print(f"   Status: {data['status']}")
            print(f"   Detector: {data['detector_type']} (loaded: {data['detector_loaded']})")
            print(f"   Translator: {'Ready' if data['translator_ready'] else 'Not ready'}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    
    except requests.exceptions.ConnectionError:
        print(f"❌ Cannot connect to API at {BASE_URL}")
        print(f"   Make sure the service is running: python phosphene_api.py")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_detect():
    """Test object detection endpoint"""
    print_header("Testing Object Detection")
    
    try:
        img_base64 = create_test_image()
        
        response = requests.post(
            f"{BASE_URL}/api/detect",
            json={
                "image_base64": img_base64,
                "conf_threshold": 0.5
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Detection successful")
            print(f"   Objects detected: {data['count']}")
            print(f"   Image size: {data['image_size']['width']}x{data['image_size']['height']}")
            print(f"   Processing time: {data['processing_time_ms']:.1f}ms")
            
            if data['count'] > 0:
                print(f"\n   Detected objects:")
                for i, obj in enumerate(data['objects'][:3], 1):
                    print(f"   {i}. {obj['class']} (conf: {obj['confidence']:.2f})")
            
            return True
        else:
            print(f"❌ Detection failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_translate():
    """Test phosphene translation endpoint"""
    print_header("Testing Phosphene Translation")
    
    try:
        # Create mock detection data
        mock_objects = [
            {
                "class": "person",
                "confidence": 0.92,
                "bbox": [100, 150, 80, 200],
                "centroid_px": [140, 250],
                "distance_m": 3.5
            },
            {
                "class": "car",
                "confidence": 0.87,
                "bbox": [300, 200, 150, 100],
                "centroid_px": [375, 250],
                "distance_m": 8.2
            }
        ]
        
        response = requests.post(
            f"{BASE_URL}/api/translate",
            json={
                "objects": mock_objects,
                "image_width": 640,
                "image_height": 480,
                "t_min": 0.3,
                "k_min": 1,
                "k_max": 5
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Translation successful")
            print(f"   Selected objects: {data['metadata']['selected_count']}")
            print(f"   Processing time: {data['metadata']['processing_time_ms']:.1f}ms")
            print(f"   Output image size: {len(data['phosphene_image_base64'])} bytes (base64)")
            
            if data['selected_objects']:
                print(f"\n   Selected objects:")
                for i, obj in enumerate(data['selected_objects'], 1):
                    print(f"   {i}. {obj['class']} (score: {obj['score']:.3f})")
            
            return True
        else:
            print(f"❌ Translation failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_process():
    """Test end-to-end processing endpoint"""
    print_header("Testing End-to-End Processing")
    
    try:
        img_base64 = create_test_image()
        
        response = requests.post(
            f"{BASE_URL}/api/process",
            json={
                "image_base64": img_base64,
                "conf_threshold": 0.5,
                "t_min": 0.3,
                "k_min": 1,
                "k_max": 5
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Processing successful")
            print(f"   Detections: {len(data['detections'])}")
            print(f"   Selected: {data['metadata']['selected_count']}")
            print(f"   Total time: {data['metadata']['total_processing_time_ms']:.1f}ms")
            
            if data['detections']:
                print(f"\n   Detected:")
                for i, obj in enumerate(data['detections'][:3], 1):
                    print(f"   {i}. {obj['class']} (conf: {obj['confidence']:.2f})")
            
            # Save output image for inspection
            output_dir = "test_output"
            os.makedirs(output_dir, exist_ok=True)
            
            img_data = base64.b64decode(data['phosphene_image_base64'])
            output_path = os.path.join(output_dir, "test_phosphene.png")
            
            with open(output_path, 'wb') as f:
                f.write(img_data)
            
            print(f"\n   ✅ Phosphene image saved: {output_path}")
            
            return True
        else:
            print(f"❌ Processing failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_configure():
    """Test configuration update endpoint"""
    print_header("Testing Configuration Update")
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/configure",
            json={
                "t_min": 0.4,
                "k_min": 2,
                "k_max": 8
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Configuration updated")
            print(f"   Changes: {data['changes']}")
            print(f"   Current config: {data['current_config']}")
            return True
        else:
            print(f"❌ Configuration failed: {response.status_code}")
            return False
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    """Run all tests"""
    print("\n" + "🚀 Phosphene Vision API Test Suite".center(60))
    print("=" * 60)
    
    tests = [
        ("Health Check", test_health),
        ("Object Detection", test_detect),
        ("Phosphene Translation", test_translate),
        ("End-to-End Processing", test_process),
        ("Configuration Update", test_configure)
    ]
    
    results = []
    
    for name, test_func in tests:
        result = test_func()
        results.append((name, result))
    
    # Summary
    print_header("Test Summary")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status} - {name}")
    
    print("\n" + "="*60)
    print(f"   Results: {passed}/{total} tests passed")
    print("="*60)
    
    if passed == total:
        print("\n🎉 All tests passed! API is working correctly.\n")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Check the output above.\n")
        return 1

if __name__ == "__main__":
    exit(main())
