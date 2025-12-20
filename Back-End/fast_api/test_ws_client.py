"""
Navigation WebSocket Test Client

Loads RGB and Depth frames from local directory and sends them to the navigation WebSocket endpoint.
Maintains 10 FPS by timing frame processing and sleeping for remaining interval.
"""

import asyncio
import websockets
import json
import base64
import cv2
import time
import os
import sys
from pathlib import Path
from typing import List, Tuple


# Configuration
WEBSOCKET_URL = "ws://localhost:8000/ws/navigation"
TEST_DATA_PATH = r"D:\\Eng\\SBE\\gp\\Dawn-Pilot--AfterDawn\\testing_sequence\\7"
RGB_FOLDER = "Color"
DEPTH_FOLDER = "Depth"
TARGET_FPS = 10
FRAME_INTERVAL = 1.0 / TARGET_FPS  # 0.1 seconds (100ms)
SAVE_RESULTS = True  # Set to True to save results to test_output/


def load_frame_pairs(data_path: str) -> List[Tuple[str, str]]:
    """
    Load pairs of RGB and Depth image paths from the dataset directory
    
    Returns:
        List of tuples (rgb_path, depth_path)
    """
    rgb_dir = os.path.join(data_path, RGB_FOLDER)
    depth_dir = os.path.join(data_path, DEPTH_FOLDER)
    
    if not os.path.exists(rgb_dir):
        raise FileNotFoundError(f"RGB directory not found: {rgb_dir}")
    if not os.path.exists(depth_dir):
        raise FileNotFoundError(f"Depth directory not found: {depth_dir}")
    
    # Get sorted list of files
    rgb_files = sorted([f for f in os.listdir(rgb_dir) if f.endswith('.png')])
    depth_files = sorted([f for f in os.listdir(depth_dir) if f.endswith('.png')])
    
    if len(rgb_files) == 0:
        raise ValueError(f"No PNG files found in {rgb_dir}")
    if len(depth_files) == 0:
        raise ValueError(f"No PNG files found in {depth_dir}")
    
    # Pair up files
    frame_pairs = []
    for rgb_file, depth_file in zip(rgb_files, depth_files):
        rgb_path = os.path.join(rgb_dir, rgb_file)
        depth_path = os.path.join(depth_dir, depth_file)
        frame_pairs.append((rgb_path, depth_path))
    
    print(f"Found {len(frame_pairs)} frame pairs")
    return frame_pairs


def encode_image_to_base64(image_path: str) -> str:
    """
    Read image and encode to base64 PNG format
    
    Args:
        image_path: Path to image file
        
    Returns:
        Base64 encoded string
    """
    # Read image
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Failed to read image: {image_path}")
    
    # Encode to PNG
    success, encoded = cv2.imencode('.png', img)
    if not success:
        raise ValueError(f"Failed to encode image: {image_path}")
    
    # Convert to base64
    base64_str = base64.b64encode(encoded.tobytes()).decode('utf-8')
    return base64_str


async def process_frames(frame_pairs: List[Tuple[str, str]]):
    """
    Connect to WebSocket and process all frame pairs
    
    Maintains 10 FPS by timing each frame and sleeping for remaining interval
    """
    stats = {
        "total_frames": len(frame_pairs),
        "processed_frames": 0,
        "errors": 0,
        "total_processing_time": 0,
        "total_elapsed_time": 0,
        "start_time": time.time()
    }
    
    # Create output directory if saving results
    output_dir = None
    if SAVE_RESULTS:
        output_dir = "test_output"
        os.makedirs(output_dir, exist_ok=True)
        print(f"Saving results to: {output_dir}")
    
    try:
        async with websockets.connect(WEBSOCKET_URL) as websocket:
            print(f"✅ Connected to {WEBSOCKET_URL}")
            
            # Wait for connection confirmation
            response = await websocket.recv()
            msg = json.loads(response)
            if msg.get("type") == "connected":
                print(f"✅ Server ready: {msg.get('message')}")
            elif msg.get("type") == "error":
                print(f"❌ Server error: {msg.get('error')}")
                return
            
            # Process each frame pair
            for frame_id, (rgb_path, depth_path) in enumerate(frame_pairs):
                frame_start_time = time.time()
                
                try:
                    # Encode images
                    rgb_base64 = encode_image_to_base64(rgb_path)
                    depth_base64 = encode_image_to_base64(depth_path)
                    
                    # Send frame
                    message = {
                        "type": "frame",
                        "data": {
                            "frame_id": frame_id,
                            "rgb": rgb_base64,
                            "depth": depth_base64
                        }
                    }
                    
                    await websocket.send(json.dumps(message))
                    
                    # Receive result
                    response = await websocket.recv()
                    result = json.loads(response)
                    
                    if result.get("type") == "result":
                        data = result.get("data", {})
                        processing_time = data.get("processing_time_ms", 0)
                        num_detections = data.get("stats", {}).get("num_detections", 0)
                        
                        stats["processed_frames"] += 1
                        stats["total_processing_time"] += processing_time
                        
                        print(f"✅ Frame {frame_id} processed in {processing_time:.2f}ms")
                        print(f"   Detections: {num_detections}")
                        print(f"   Freepath points: {data.get('stats', {}).get('freepath_points', 0)}")
                        
                        # Decode and save output images
                        if SAVE_RESULTS and output_dir:
                            # Save JSON result
                            result_file = os.path.join(output_dir, f"frame_{frame_id:04d}_result.json")
                            with open(result_file, 'w') as f:
                                json.dump(data, f, indent=2)
                            
                            # Save freepath mask
                            if data.get("freepath_mask"):
                                freepath_bytes = base64.b64decode(data["freepath_mask"])
                                freepath_path = os.path.join(output_dir, f"frame_{frame_id:04d}_freepath.png")
                                with open(freepath_path, 'wb') as f:
                                    f.write(freepath_bytes)
                                print(f"   💾 Saved freepath: {freepath_path}")
                            
                            # Save occupancy map
                            if data.get("occupancy_map"):
                                occupancy_bytes = base64.b64decode(data["occupancy_map"])
                                occupancy_path = os.path.join(output_dir, f"frame_{frame_id:04d}_occupancy.png")
                                with open(occupancy_path, 'wb') as f:
                                    f.write(occupancy_bytes)
                                print(f"   💾 Saved occupancy: {occupancy_path}")
                        
                    elif result.get("type") == "error":
                        print(f"❌ Frame {frame_id:04d}: Error - {result.get('error')}")
                        stats["errors"] += 1
                    
                except Exception as e:
                    print(f"❌ Frame {frame_id:04d}: Exception - {e}")
                    stats["errors"] += 1
                
                # Calculate elapsed time and sleep for remaining interval
                frame_elapsed = time.time() - frame_start_time
                remaining = FRAME_INTERVAL - frame_elapsed
                
                if remaining > 0:
                    await asyncio.sleep(remaining)
                else:
                    print(f"⚠️  Frame {frame_id:04d}: Processing took {frame_elapsed*1000:.2f}ms (slower than {FRAME_INTERVAL*1000:.0f}ms target)")
            
            stats["total_elapsed_time"] = time.time() - stats["start_time"]
            
    except websockets.exceptions.ConnectionClosed:
        print("❌ WebSocket connection closed")
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
    
    # Print final statistics
    print("\n" + "="*60)
    print("FINAL STATISTICS")
    print("="*60)
    print(f"Total Frames:       {stats['total_frames']}")
    print(f"Processed Frames:   {stats['processed_frames']}")
    print(f"Errors:             {stats['errors']}")
    print(f"Total Elapsed Time: {stats['total_elapsed_time']:.2f}s")
    
    if stats['processed_frames'] > 0:
        avg_processing_time = stats['total_processing_time'] / stats['processed_frames']
        avg_fps = stats['processed_frames'] / stats['total_elapsed_time']
        print(f"Avg Processing Time: {avg_processing_time:.2f}ms")
        print(f"Average FPS:        {avg_fps:.2f}")
        print(f"Target FPS:         {TARGET_FPS}")
        
        if avg_processing_time < FRAME_INTERVAL * 1000:
            print(f"✅ Performance: GOOD (processing faster than {FRAME_INTERVAL*1000:.0f}ms)")
        else:
            print(f"⚠️  Performance: SLOW (processing slower than {FRAME_INTERVAL*1000:.0f}ms)")
    
    print("="*60)


def main():
    """Main entry point"""
    print("="*60)
    print("Navigation WebSocket Test Client")
    print("="*60)
    print(f"WebSocket URL: {WEBSOCKET_URL}")
    print(f"Test Data Path: {TEST_DATA_PATH}")
    print(f"Target FPS: {TARGET_FPS}")
    print(f"Frame Interval: {FRAME_INTERVAL*1000:.0f}ms")
    print("="*60)
    
    # Check test data path
    if not os.path.exists(TEST_DATA_PATH):
        print(f"❌ Test data path not found: {TEST_DATA_PATH}")
        print("Please create the directory and add Color/ and Depth/ folders with PNG images")
        sys.exit(1)
    
    # Load frame pairs
    try:
        frame_pairs = load_frame_pairs(TEST_DATA_PATH)
    except Exception as e:
        print(f"❌ Failed to load frame pairs: {e}")
        sys.exit(1)
    
    # Process frames
    asyncio.run(process_frames(frame_pairs))


if __name__ == "__main__":
    main()
