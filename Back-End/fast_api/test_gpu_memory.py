"""
GPU Memory Diagnostic Tool

Tests memory usage of dual-encoder system to identify leaks.
Run this BEFORE starting the full server.
"""

import torch
import numpy as np
import time
import sys
import os

# Add paths
sys.path.insert(0, os.path.dirname(__file__))

def format_bytes(bytes_val):
    """Convert bytes to human-readable format"""
    gb = bytes_val / (1024**3)
    return f"{gb:.3f} GB"

def get_gpu_stats():
    """Get current GPU memory statistics"""
    if not torch.cuda.is_available():
        return None
    
    return {
        "allocated": torch.cuda.memory_allocated(),
        "reserved": torch.cuda.memory_reserved(),
        "max_allocated": torch.cuda.max_memory_allocated()
    }

def print_gpu_stats(iteration, label=""):
    """Print GPU memory stats"""
    stats = get_gpu_stats()
    if stats:
        print(f"\n{'='*60}")
        print(f"[{iteration:03d}] {label}")
        print(f"{'='*60}")
        print(f"Allocated:     {format_bytes(stats['allocated'])}")
        print(f"Reserved:      {format_bytes(stats['reserved'])}")
        print(f"Max Allocated: {format_bytes(stats['max_allocated'])}")
        print(f"Free:          {format_bytes(torch.cuda.get_device_properties(0).total_memory - stats['reserved'])}")
        print(f"{'='*60}")
    else:
        print("❌ CUDA not available")

def test_encoder_memory_leak():
    """Test if encoders leak memory over repeated inference"""
    print("\n🔬 TEST 1: Encoder Memory Leak Detection")
    print("="*60)
    
    from translation.Pipeline2Integration import Pipeline2Integration
    
    print("Loading Pipeline2Integration...")
    pipeline = Pipeline2Integration()
    print_gpu_stats(0, "After Loading Both Encoders")
    
    # Simulate repeated inference
    print("\n🔄 Running 200 inference iterations...")
    for i in range(1, 201):
        # Alternate between edge and phosphene encoders
        use_edge = (i % 2 == 0)
        
        if use_edge:
            dummy_input = np.random.rand(128, 128).astype(np.float32)
        else:
            dummy_input = np.random.rand(349, 373).astype(np.float32)
        
        # Run inference
        _ = pipeline.input2phosphenes(dummy_input, use_edge_encoder=use_edge)
        
        # Monitor every 20 frames
        if i % 20 == 0:
            print(f"\n[Frame {i:03d}] Encoder: {'Edge' if use_edge else 'Phosphene'}")
            stats = get_gpu_stats()
            print(f"  Allocated: {format_bytes(stats['allocated'])}")
            print(f"  Reserved:  {format_bytes(stats['reserved'])}")
            
            # Check for memory growth
            if i == 20:
                baseline_allocated = stats['allocated']
                baseline_reserved = stats['reserved']
            elif i > 20:
                growth_allocated = stats['allocated'] - baseline_allocated
                growth_reserved = stats['reserved'] - baseline_reserved
                print(f"  📈 Growth from frame 20:")
                print(f"     Allocated: +{format_bytes(growth_allocated)}")
                print(f"     Reserved:  +{format_bytes(growth_reserved)}")
                
                if growth_allocated > 100 * 1024**2:  # 100MB growth
                    print("  ⚠️  WARNING: Significant memory growth detected!")
    
    print_gpu_stats(200, "After 200 Iterations")
    
    # Manual cleanup
    print("\n🧹 Testing manual cleanup...")
    torch.cuda.empty_cache()
    print_gpu_stats(201, "After torch.cuda.empty_cache()")
    
    del pipeline
    torch.cuda.empty_cache()
    print_gpu_stats(202, "After deleting pipeline + empty_cache()")

def test_service_memory_leak():
    """Test if NavigationDetectorService leaks memory"""
    print("\n\n🔬 TEST 2: NavigationDetectorService Memory Leak")
    print("="*60)
    
    from services.navigation_detector_service import NavigationDetectorService
    
    print("Loading NavigationDetectorService...")
    service = NavigationDetectorService()
    print_gpu_stats(0, "After Loading Service")
    
    # Create dummy frames
    dummy_rgb = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
    
    print("\n🔄 Running 100 full pipeline iterations...")
    stages = ["passthrough", "edge_mode", "phosphene"]
    
    for i in range(1, 101):
        stage = stages[i % len(stages)]
        
        # Run full pipeline
        result = service.process_full_pipeline(
            rgb=dummy_rgb,
            frame_id=i,
            depth=None if stage in ["passthrough", "edge_mode"] else dummy_rgb[:,:,0],
            stop_at=stage,
            debug_mode=False  # No disk I/O
        )
        
        if i % 10 == 0:
            print(f"\n[Frame {i:03d}] Stage: {stage}")
            stats = get_gpu_stats()
            print(f"  Allocated: {format_bytes(stats['allocated'])}")
            print(f"  Reserved:  {format_bytes(stats['reserved'])}")
            
            if i == 10:
                baseline = stats['allocated']
            elif i > 10:
                growth = stats['allocated'] - baseline
                print(f"  📈 Growth: +{format_bytes(growth)}")
                if growth > 200 * 1024**2:  # 200MB
                    print("  ⚠️  WARNING: Memory leak detected!")
    
    print_gpu_stats(100, "After 100 Full Pipeline Iterations")

def test_peak_memory_usage():
    """Test peak memory usage with all components loaded"""
    print("\n\n🔬 TEST 3: Peak Memory Usage")
    print("="*60)
    
    torch.cuda.reset_peak_memory_stats()
    
    from services.navigation_detector_service import NavigationDetectorService
    
    service = NavigationDetectorService()
    print_gpu_stats(0, "All Models Loaded")
    
    # Stress test
    dummy_rgb = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
    dummy_depth = dummy_rgb[:,:,0]
    
    print("\n🔥 Running stress test (all stages sequentially)...")
    for stage in ["passthrough", "edge_mode", "detector", "translator", "pre_phosphene", "phosphene"]:
        depth = None if stage in ["passthrough", "edge_mode"] else dummy_depth
        _ = service.process_full_pipeline(dummy_rgb, 0, depth, stage, False)
        print(f"  ✓ {stage}")
    
    stats = get_gpu_stats()
    print(f"\n📊 Peak Memory Usage:")
    print(f"  Max Allocated: {format_bytes(stats['max_allocated'])}")
    print(f"  Total VRAM:    {format_bytes(torch.cuda.get_device_properties(0).total_memory)}")
    print(f"  Utilization:   {(stats['max_allocated'] / torch.cuda.get_device_properties(0).total_memory * 100):.1f}%")
    
    # Calculate headroom
    total_vram = torch.cuda.get_device_properties(0).total_memory
    headroom = total_vram - stats['max_allocated']
    print(f"  Headroom:      {format_bytes(headroom)}")
    
    if headroom < 500 * 1024**2:  # Less than 500MB
        print("\n⚠️  WARNING: Low VRAM headroom! Risk of OOM crashes.")

if __name__ == "__main__":
    print("\n" + "="*60)
    print("🔬 GPU MEMORY DIAGNOSTIC TOOL")
    print("="*60)
    print(f"GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None'}")
    print(f"Total VRAM: {format_bytes(torch.cuda.get_device_properties(0).total_memory) if torch.cuda.is_available() else 'N/A'}")
    print("="*60)
    
    try:
        # Test 1: Encoder leak
        test_encoder_memory_leak()
        
        # Clear GPU before next test
        torch.cuda.empty_cache()
        time.sleep(2)
        
        # Test 2: Service leak
        test_service_memory_leak()
        
        # Clear GPU before next test
        torch.cuda.empty_cache()
        time.sleep(2)
        
        # Test 3: Peak usage
        test_peak_memory_usage()
        
        print("\n" + "="*60)
        print("✅ DIAGNOSTIC COMPLETE")
        print("="*60)
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
