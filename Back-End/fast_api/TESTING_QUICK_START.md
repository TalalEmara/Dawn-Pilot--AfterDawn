# Testing Quick Start Guide

## 🚀 Quick Test: Parallel Processing

### Prerequisites
```bash
cd Back-End/fast_api
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### Start Server
```bash
python main.py
```

Expected output:
```
🔧 INITIALIZING NavigationDetectorService
✅ Object detection model FOUND
✅ Freepath model FOUND
🔄 Initializing ObjectDetector (FASTER_RCNN)...
✅ ObjectDetector loaded successfully
🔄 Initializing FreepathDetector (DeepLabV3)...
✅ FreepathDetector loaded successfully
🚀 Navigation detector service ready on CUDA (GeForce GTX 1650)!
```

---

## 🧪 Test 1: Basic WebSocket Connection

### Python Client
```python
import asyncio
import websockets
import json
import base64

async def test_basic():
    uri = "ws://localhost:8000/ws/navigation-phosphene"
    
    async with websockets.connect(uri) as ws:
        # Load test image
        with open("testing_sequence/7/Color/frame_0000.png", "rb") as f:
            img_data = f.read()
            rgb_b64 = base64.b64encode(img_data).decode()
        
        # Send message
        message = {
            "rgb": rgb_b64,
            "depth": rgb_b64,  # Use RGB as depth for testing
            "frame_id": 0,
            "debug": True
        }
        
        await ws.send(json.dumps(message))
        
        # Receive response
        response = await ws.recv()
        result = json.loads(response)
        
        # Print results
        print("✅ Connection successful!")
        print(f"Detections: {result['stats']['num_detections']}")
        print(f"Freepath points: {result['stats']['freepath_points']}")
        print(f"Processing time: {result['processing_time_ms']:.2f}ms")

asyncio.run(test_basic())
```

**Expected Output:**
```
✅ Connection successful!
Detections: 3
Freepath points: 45
Processing time: 520.45ms
```

---

## ⚡ Test 2: Parallel Processing Verification

### Check Timing Stats
```python
async def test_parallel_stats():
    uri = "ws://localhost:8000/ws/navigation-phosphene"
    
    async with websockets.connect(uri) as ws:
        # Load image
        with open("testing_sequence/7/Color/frame_0000.png", "rb") as f:
            rgb_b64 = base64.b64encode(f.read()).decode()
        
        message = {
            "rgb": rgb_b64,
            "depth": rgb_b64,
            "frame_id": 0,
            "debug": False
        }
        
        await ws.send(json.dumps(message))
        response = await ws.recv()
        result = json.loads(response)
        
        # Analyze timing
        stats = result['stats']
        detection_ms = stats['detection_time_ms']
        freepath_ms = stats['freepath_time_ms']
        parallel_ms = stats['parallel_total_ms']
        
        sequential_time = detection_ms + freepath_ms
        speedup = sequential_time / parallel_ms
        
        print("⚡ PARALLEL PROCESSING STATS:")
        print(f"  Object detection:  {detection_ms:7.2f}ms")
        print(f"  Freepath detection: {freepath_ms:7.2f}ms")
        print(f"  ─────────────────────────────")
        print(f"  Sequential (sum):  {sequential_time:7.2f}ms")
        print(f"  Parallel (actual): {parallel_ms:7.2f}ms")
        print(f"  ─────────────────────────────")
        print(f"  Speedup: {speedup:.2f}x ({(speedup-1)*100:.1f}% faster)")

asyncio.run(test_parallel_stats())
```

**Expected Output:**
```
⚡ PARALLEL PROCESSING STATS:
  Object detection:   503.24ms
  Freepath detection: 148.67ms
  ─────────────────────────────
  Sequential (sum):   651.91ms
  Parallel (actual):  508.45ms
  ─────────────────────────────
  Speedup: 1.28x (28.2% faster)
```

---

## 🎥 Test 3: Frame Sequence (10 frames)

### Batch Processing
```python
async def test_frame_sequence():
    uri = "ws://localhost:8000/ws/navigation-phosphene"
    
    async with websockets.connect(uri) as ws:
        times = []
        
        for i in range(10):
            # Load frame
            frame_path = f"testing_sequence/7/Color/frame_{i:04d}.png"
            with open(frame_path, "rb") as f:
                rgb_b64 = base64.b64encode(f.read()).decode()
            
            # Send and receive
            message = {"rgb": rgb_b64, "depth": rgb_b64, "frame_id": i, "debug": False}
            await ws.send(json.dumps(message))
            
            response = await ws.recv()
            result = json.loads(response)
            
            proc_time = result['processing_time_ms']
            times.append(proc_time)
            
            print(f"Frame {i}: {proc_time:.2f}ms")
        
        # Statistics
        import statistics
        avg = statistics.mean(times)
        std = statistics.stdev(times)
        fps = 1000 / avg
        
        print("\n📊 SEQUENCE STATS:")
        print(f"  Average: {avg:.2f}ms")
        print(f"  Std Dev: {std:.2f}ms")
        print(f"  Min:     {min(times):.2f}ms")
        print(f"  Max:     {max(times):.2f}ms")
        print(f"  FPS:     {fps:.2f}")

asyncio.run(test_frame_sequence())
```

**Expected Output:**
```
Frame 0: 512.34ms
Frame 1: 498.23ms
Frame 2: 505.67ms
...
Frame 9: 502.11ms

📊 SEQUENCE STATS:
  Average: 503.45ms
  Std Dev: 5.67ms
  Min:     495.12ms
  Max:     515.89ms
  FPS:     1.99
```

---

## 🔍 Test 4: Debug Mode Output Verification

### Check Debug Files
```python
async def test_debug_mode():
    uri = "ws://localhost:8000/ws/navigation-phosphene"
    
    async with websockets.connect(uri) as ws:
        # Load frame
        with open("testing_sequence/7/Color/frame_0000.png", "rb") as f:
            rgb_b64 = base64.b64encode(f.read()).decode()
        
        message = {
            "rgb": rgb_b64,
            "depth": rgb_b64,
            "frame_id": 999,  # Use unique ID
            "debug": True
        }
        
        await ws.send(json.dumps(message))
        response = await ws.recv()
        result = json.loads(response)
        
        print("✅ Response received")
        
        # Check for debug files
        import os
        debug_dir = "api_output/debug_output"
        
        expected_files = [
            f"frame_0999_rgb.png"
        ]
        
        for file in expected_files:
            path = os.path.join(debug_dir, file)
            if os.path.exists(path):
                print(f"✅ Found: {file}")
            else:
                print(f"❌ Missing: {file}")

asyncio.run(test_debug_mode())
```

---

## 🐍 All-in-One Test Script

Save as `test_parallel.py`:
```python
import asyncio
import websockets
import json
import base64
import os
import statistics
from typing import Dict, Any

async def run_all_tests():
    """Run comprehensive test suite"""
    
    print("="*60)
    print("PARALLEL PROCESSING TEST SUITE")
    print("="*60)
    
    uri = "ws://localhost:8000/ws/navigation-phosphene"
    
    # Load test image
    test_image_path = "testing_sequence/7/Color/frame_0000.png"
    if not os.path.exists(test_image_path):
        print(f"❌ Test image not found: {test_image_path}")
        return
    
    with open(test_image_path, "rb") as f:
        rgb_b64 = base64.b64encode(f.read()).decode()
    
    try:
        async with websockets.connect(uri) as ws:
            # Test 1: Basic connection
            print("\n📡 Test 1: Basic Connection")
            message = {"rgb": rgb_b64, "depth": rgb_b64, "frame_id": 0, "debug": False}
            await ws.send(json.dumps(message))
            response = await ws.recv()
            result = json.loads(response)
            print(f"✅ Connected - Processing time: {result['processing_time_ms']:.2f}ms")
            
            # Test 2: Parallel stats
            print("\n⚡ Test 2: Parallel Processing Stats")
            stats = result['stats']
            detection_ms = stats['detection_time_ms']
            freepath_ms = stats['freepath_time_ms']
            parallel_ms = stats['parallel_total_ms']
            sequential = detection_ms + freepath_ms
            speedup = sequential / parallel_ms
            
            print(f"  Object:     {detection_ms:7.2f}ms")
            print(f"  Freepath:   {freepath_ms:7.2f}ms")
            print(f"  Sequential: {sequential:7.2f}ms")
            print(f"  Parallel:   {parallel_ms:7.2f}ms")
            print(f"  Speedup:    {speedup:.2f}x ({(speedup-1)*100:.1f}% faster)")
            
            # Test 3: Multiple frames
            print("\n🎥 Test 3: 5-Frame Sequence")
            times = []
            for i in range(5):
                message = {"rgb": rgb_b64, "depth": rgb_b64, "frame_id": i, "debug": False}
                await ws.send(json.dumps(message))
                response = await ws.recv()
                result = json.loads(response)
                proc_time = result['processing_time_ms']
                times.append(proc_time)
                print(f"  Frame {i}: {proc_time:.2f}ms")
            
            avg = statistics.mean(times)
            fps = 1000 / avg
            print(f"  Average: {avg:.2f}ms ({fps:.2f} FPS)")
            
            # Test 4: Debug mode
            print("\n🔍 Test 4: Debug Mode")
            message = {"rgb": rgb_b64, "depth": rgb_b64, "frame_id": 999, "debug": True}
            await ws.send(json.dumps(message))
            response = await ws.recv()
            result = json.loads(response)
            
            debug_file = "api_output/debug_output/frame_0999_rgb.png"
            if os.path.exists(debug_file):
                print(f"✅ Debug file created: {debug_file}")
            else:
                print(f"⚠️  Debug file not found")
            
            print("\n" + "="*60)
            print("✅ ALL TESTS COMPLETED")
            print("="*60)
            
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run_all_tests())
```

### Run Tests
```bash
python test_parallel.py
```

---

## 📊 Performance Benchmarks

### Expected Results (GTX 1650, PyTorch)

| Metric | Before Parallel | After Parallel | Target (10fps) |
|--------|-----------------|----------------|----------------|
| Object Detection | 500ms | 500ms | 50ms |
| Freepath Detection | 150ms | 150ms | 30ms |
| **Total Time** | **650ms** | **500ms** | **100ms** |
| **FPS** | **1.5** | **2.0** | **10** |
| **Speedup** | 1.0x | 1.3x | 6.5x needed |

### Next Steps to Reach 10fps
1. ✅ Parallel processing: 650ms → 500ms (1.3x)
2. ⏳ TensorRT FP16: 500ms → 200ms (2.5x)
3. ⏳ INT8 Quantization: 200ms → 100ms (2x)
4. 🎯 **Target achieved: 10fps**

---

## 🛠️ Troubleshooting

### Issue: "RuntimeError: Navigation detector models not loaded"
```bash
# Check model paths in config/navigation_config.json
# Verify files exist:
ls object_path_detection/models/best_yolo.pt
ls object_path_detection/models/final_deeplabv3_footpath.pth
```

### Issue: "Connection refused"
```bash
# Check if server is running
# Check port 8000 is available
netstat -an | findstr 8000
```

### Issue: Slow performance
```bash
# Check GPU is being used
python -c "import torch; print(torch.cuda.is_available())"
python -c "import torch; print(torch.cuda.get_device_name(0))"
```

### Issue: Out of memory
```bash
# Reduce batch size or image resolution
# Check GPU memory:
nvidia-smi
```

---

## 📝 Test Checklist

Before deploying to production:

- [ ] Basic WebSocket connection works
- [ ] Parallel processing shows speedup (>20%)
- [ ] Multiple frames processed successfully
- [ ] Debug mode saves files correctly
- [ ] Error handling works (bad input, corrupted image)
- [ ] GPU utilization is high (>80%)
- [ ] Memory usage is stable (no leaks)
- [ ] Stats are accurate (timing, detections, freepath)
- [ ] No race conditions or crashes
- [ ] Performance consistent across frames

---

**Quick Start Version**: 1.0  
**Last Updated**: 2024  
**Prerequisites**: Python 3.8+, PyTorch, CUDA, FastAPI
