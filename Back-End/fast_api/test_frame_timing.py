"""
Frame Timing Diagnostic Tool

Measures frame processing time for each mode to identify bottlenecks.
"""

import time
import numpy as np
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from services.navigation_detector_service import NavigationDetectorService

def test_frame_timing():
    """Test processing time for each pipeline stage"""
    print("\n" + "="*60)
    print("⏱️  FRAME TIMING DIAGNOSTIC")
    print("="*60)
    
    service = NavigationDetectorService()
    
    # Create dummy frames (typical camera resolution)
    dummy_rgb = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
    dummy_depth = dummy_rgb[:,:,0]
    
    stages = [
        ("passthrough", None),
        ("edge_mode", None),
        ("detector", dummy_depth),
        ("translator", dummy_depth),
        ("pre_phosphene", dummy_depth),
        ("phosphene", dummy_depth)
    ]
    
    results = []
    
    print("\n🔄 Running 10 iterations per stage...\n")
    
    for stage_name, depth in stages:
        times = []
        
        # Warmup
        service.process_full_pipeline(dummy_rgb, 0, depth, stage_name, False)
        
        # Measure
        for i in range(10):
            start = time.time()
            result = service.process_full_pipeline(
                rgb=dummy_rgb,
                frame_id=i,
                depth=depth,
                stop_at=stage_name,
                debug_mode=False
            )
            elapsed = (time.time() - start) * 1000  # ms
            times.append(elapsed)
        
        avg_time = np.mean(times)
        min_time = np.min(times)
        max_time = np.max(times)
        std_time = np.std(times)
        fps = 1000 / avg_time if avg_time > 0 else 0
        
        results.append({
            "stage": stage_name,
            "avg_ms": avg_time,
            "min_ms": min_time,
            "max_ms": max_time,
            "std_ms": std_time,
            "fps": fps
        })
        
        print(f"{'='*60}")
        print(f"Stage: {stage_name.upper()}")
        print(f"{'='*60}")
        print(f"  Avg Time: {avg_time:6.2f} ms  ({fps:.1f} FPS)")
        print(f"  Min Time: {min_time:6.2f} ms")
        print(f"  Max Time: {max_time:6.2f} ms")
        print(f"  Std Dev:  {std_time:6.2f} ms")
        
        if avg_time > 100:
            print(f"  ⚠️  Slower than 10 FPS!")
        elif avg_time > 33:
            print(f"  ⚠️  Slower than 30 FPS")
        else:
            print(f"  ✅ Fast enough for real-time")
    
    print("\n" + "="*60)
    print("📊 SUMMARY")
    print("="*60)
    print(f"{'Stage':<15} {'Avg (ms)':<10} {'FPS':<8} {'Status'}")
    print("-"*60)
    for r in results:
        status = "✅" if r['avg_ms'] < 50 else "⚠️" if r['avg_ms'] < 100 else "❌"
        print(f"{r['stage']:<15} {r['avg_ms']:<10.1f} {r['fps']:<8.1f} {status}")
    
    # Identify fastest and slowest
    fastest = min(results, key=lambda x: x['avg_ms'])
    slowest = max(results, key=lambda x: x['avg_ms'])
    
    print("\n" + "="*60)
    print(f"🏆 Fastest: {fastest['stage']} ({fastest['avg_ms']:.1f}ms)")
    print(f"🐌 Slowest: {slowest['stage']} ({slowest['avg_ms']:.1f}ms)")
    print(f"📈 Slowdown ratio: {slowest['avg_ms'] / fastest['avg_ms']:.1f}x")
    print("="*60)

if __name__ == "__main__":
    test_frame_timing()
