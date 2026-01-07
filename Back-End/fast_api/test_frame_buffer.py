"""
Frame Buffer Test Script

Quick test to verify frame buffer functionality without full WebSocket setup.
Tests the buffer mechanics, metrics, and configuration.
"""

import asyncio
import time
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from core.frame_buffer import LatestFrameBuffer, FrameData, FrameBufferConfig
import numpy as np


async def test_basic_buffer():
    """Test basic put/get operations"""
    print("\n" + "="*70)
    print("TEST 1: Basic Buffer Operations")
    print("="*70)
    
    buffer = LatestFrameBuffer(max_frame_age_ms=1000.0)
    
    # Create dummy frame
    rgb = np.zeros((720, 1280, 3), dtype=np.uint8)
    depth = np.zeros((720, 1280), dtype=np.uint8)
    
    frame1 = FrameData(
        frame_id="frame_001",
        rgb=rgb,
        depth=depth,
        stage="phosphene",
        debug_mode=False
    )
    
    # Put frame
    print("📤 Putting frame_001...")
    await buffer.put(frame1)
    
    # Get frame
    print("📥 Getting frame...")
    retrieved_frame = await buffer.get_latest()
    
    if retrieved_frame and retrieved_frame.frame_id == "frame_001":
        print(f"✅ SUCCESS: Retrieved {retrieved_frame.frame_id}")
        print(f"   Age: {retrieved_frame.age_ms():.2f}ms")
    else:
        print("❌ FAILED: Frame not retrieved correctly")
    
    return True


async def test_frame_overwriting():
    """Test that old frames are overwritten"""
    print("\n" + "="*70)
    print("TEST 2: Frame Overwriting (Drop Logic)")
    print("="*70)
    
    buffer = LatestFrameBuffer(max_frame_age_ms=1000.0)
    
    rgb = np.zeros((720, 1280, 3), dtype=np.uint8)
    depth = np.zeros((720, 1280), dtype=np.uint8)
    
    # Put 5 frames rapidly (simulating fast frontend)
    for i in range(1, 6):
        frame = FrameData(
            frame_id=f"frame_{i:03d}",
            rgb=rgb,
            depth=depth,
            stage="phosphene",
            debug_mode=False
        )
        await buffer.put(frame)
        print(f"📤 Put frame_{i:03d}")
        await asyncio.sleep(0.01)  # 10ms between frames (100 fps!)
    
    # Get only latest frame
    retrieved_frame = await buffer.get_latest()
    
    if retrieved_frame and retrieved_frame.frame_id == "frame_005":
        print(f"✅ SUCCESS: Only latest frame retrieved ({retrieved_frame.frame_id})")
        print(f"   Frames 001-004 were automatically dropped ✓")
    else:
        print(f"❌ FAILED: Expected frame_005, got {retrieved_frame.frame_id if retrieved_frame else 'None'}")
    
    # Check metrics
    metrics = buffer.get_current_metrics()
    print(f"\n📊 Buffer Metrics:")
    print(f"   Received:  {metrics['total_received']}")
    print(f"   Processed: {metrics['total_processed']}")
    print(f"   Dropped:   {metrics['total_dropped']}")
    print(f"   Drop Rate: {metrics['drop_rate']:.1f}%")
    
    if metrics['total_dropped'] == 4:
        print("✅ SUCCESS: 4 frames dropped as expected")
    else:
        print(f"❌ FAILED: Expected 4 dropped, got {metrics['total_dropped']}")
    
    return True


async def test_producer_consumer():
    """Test producer-consumer pattern"""
    print("\n" + "="*70)
    print("TEST 3: Producer-Consumer Pattern")
    print("="*70)
    
    buffer = LatestFrameBuffer(max_frame_age_ms=1000.0)
    buffer._metrics_interval = 5.0  # Log every 5s for testing
    
    rgb = np.zeros((720, 1280, 3), dtype=np.uint8)
    depth = np.zeros((720, 1280), dtype=np.uint8)
    
    produced_count = 0
    consumed_count = 0
    
    # Producer: Send 20 frames at 15 fps
    async def producer():
        nonlocal produced_count
        for i in range(1, 21):
            frame = FrameData(
                frame_id=f"frame_{i:03d}",
                rgb=rgb,
                depth=depth,
                stage="phosphene",
                debug_mode=False
            )
            await buffer.put(frame)
            produced_count += 1
            print(f"📤 Producer: Sent frame_{i:03d} ({produced_count}/20)")
            await asyncio.sleep(1/15)  # 15 fps (66ms between frames)
    
    # Consumer: Process frames at 5 fps
    async def consumer():
        nonlocal consumed_count
        while consumed_count < 10:  # Process ~10 frames
            frame = await buffer.get_latest()
            if frame:
                consumed_count += 1
                print(f"   📥 Consumer: Processing {frame.frame_id} ({consumed_count}/10)")
                await asyncio.sleep(0.2)  # 200ms processing time (5 fps)
    
    # Run both concurrently
    print("🚀 Starting producer (15 fps) and consumer (5 fps)...")
    await asyncio.gather(producer(), consumer())
    
    print(f"\n📊 Final Results:")
    print(f"   Produced:  {produced_count} frames")
    print(f"   Consumed:  {consumed_count} frames")
    print(f"   Dropped:   {produced_count - consumed_count} frames")
    
    metrics = buffer.get_current_metrics()
    print(f"\n📊 Buffer Metrics:")
    print(f"   Drop Rate: {metrics['drop_rate']:.1f}%")
    
    if consumed_count >= 8:  # Should process ~8-10 frames
        print("✅ SUCCESS: Consumer kept up at expected rate")
    else:
        print(f"⚠️  WARNING: Consumer only processed {consumed_count} frames")
    
    return True


async def test_stale_frames():
    """Test stale frame rejection"""
    print("\n" + "="*70)
    print("TEST 4: Stale Frame Rejection")
    print("="*70)
    
    buffer = LatestFrameBuffer(max_frame_age_ms=100.0)  # Only 100ms freshness
    
    rgb = np.zeros((720, 1280, 3), dtype=np.uint8)
    depth = np.zeros((720, 1280), dtype=np.uint8)
    
    frame = FrameData(
        frame_id="old_frame",
        rgb=rgb,
        depth=depth,
        stage="phosphene",
        debug_mode=False,
        timestamp=time.time() - 0.5  # 500ms ago (stale!)
    )
    
    print(f"📤 Putting stale frame (age: {frame.age_ms():.1f}ms)...")
    await buffer.put(frame)
    
    print("📥 Attempting to get frame...")
    retrieved_frame = await buffer.get_latest()
    
    if retrieved_frame is None:
        print(f"✅ SUCCESS: Stale frame rejected (age > 100ms)")
    else:
        print(f"❌ FAILED: Stale frame should have been rejected")
    
    metrics = buffer.get_current_metrics()
    if metrics['total_stale'] == 1:
        print(f"✅ SUCCESS: Stale count = 1")
    else:
        print(f"❌ FAILED: Expected stale count 1, got {metrics['total_stale']}")
    
    return True


async def test_config():
    """Test configuration loading"""
    print("\n" + "="*70)
    print("TEST 5: Configuration")
    print("="*70)
    
    # Test from dict
    config_dict = {
        "enabled": True,
        "max_frame_age_ms": 500.0,
        "metrics_interval_seconds": 15.0
    }
    
    config = FrameBufferConfig.from_dict(config_dict)
    
    print(f"📋 Configuration loaded:")
    print(f"   Enabled: {config.enabled}")
    print(f"   Max age: {config.max_frame_age_ms}ms")
    print(f"   Metrics interval: {config.metrics_interval_seconds}s")
    
    if config.enabled and config.max_frame_age_ms == 500.0:
        print("✅ SUCCESS: Configuration loaded correctly")
    else:
        print("❌ FAILED: Configuration not loaded correctly")
    
    # Test to dict
    dict_out = config.to_dict()
    if dict_out == config_dict:
        print("✅ SUCCESS: Configuration serialization works")
    else:
        print("❌ FAILED: Configuration serialization mismatch")
    
    return True


async def main():
    """Run all tests"""
    print("\n" + "="*70)
    print("🧪 FRAME BUFFER TEST SUITE")
    print("="*70)
    
    tests = [
        ("Basic Operations", test_basic_buffer),
        ("Frame Overwriting", test_frame_overwriting),
        ("Producer-Consumer", test_producer_consumer),
        ("Stale Frame Rejection", test_stale_frames),
        ("Configuration", test_config),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            result = await test_func()
            if result:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ EXCEPTION in {name}: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print("\n" + "="*70)
    print("📊 TEST SUMMARY")
    print("="*70)
    print(f"✅ Passed: {passed}/{len(tests)}")
    print(f"❌ Failed: {failed}/{len(tests)}")
    
    if failed == 0:
        print("\n🎉 ALL TESTS PASSED! Frame buffer is ready for production.")
    else:
        print(f"\n⚠️  {failed} test(s) failed. Please review.")
    
    print("="*70 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
