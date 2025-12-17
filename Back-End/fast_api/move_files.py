"""
File Reorganization Script

Moves existing files to their new organized locations.
Run this script from the fast_api directory to complete the reorganization.

Usage:
    python move_files.py [--dry-run]

Options:
    --dry-run    Show what would be moved without actually moving files
"""

import os
import shutil
import sys
from pathlib import Path


def move_file(src, dst, dry_run=False):
    """Move a file from src to dst, creating directories as needed"""
    src_path = Path(src)
    dst_path = Path(dst)
    
    if not src_path.exists():
        print(f"⚠️  SKIP: {src} (file not found)")
        return False
    
    if dst_path.exists():
        print(f"⚠️  SKIP: {dst} (already exists)")
        return False
    
    if dry_run:
        print(f"📋 WOULD MOVE: {src} → {dst}")
        return True
    
    # Create destination directory if needed
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        shutil.move(str(src_path), str(dst_path))
        print(f"✅ MOVED: {src} → {dst}")
        return True
    except Exception as e:
        print(f"❌ ERROR moving {src}: {e}")
        return False


def main():
    dry_run = "--dry-run" in sys.argv
    
    if dry_run:
        print("=" * 60)
        print("DRY RUN MODE - No files will be moved")
        print("=" * 60)
        print()
    
    # Define file movements
    movements = [
        # Detection module
        ("realtime_detector.py", "detection/realtime_detector.py"),
        ("mock_detector.py", "detection/mock_detector.py"),
        
        # Translation module
        ("translator.py", "translation/translator.py"),
        ("Pipeline2Integration.py", "translation/Pipeline2Integration.py"),
        
        # Config
        ("detector_config.json", "config/detector_config.json"),
        
        # Documentation
        ("API_README.md", "docs/API_README.md"),
        ("DEPTH_ENDPOINT_REFERENCE.md", "docs/DEPTH_ENDPOINT_REFERENCE.md"),
        ("express_integration_example.ts", "docs/express_integration_example.ts"),
        ("postman_phosphene_collection.json", "docs/postman_phosphene_collection.json"),
        
        # Tests
        ("test_api.py", "tests/test_api.py"),
        ("test_detector_config.py", "tests/test_detector_config.py"),
        ("test_image.py", "tests/test_image.py"),
        
        # Scripts
        ("start_api.bat", "scripts/start_api.bat"),
        ("start_api.sh", "scripts/start_api.sh"),
        ("realtime_camera_gui.py", "scripts/realtime_camera_gui.py"),
    ]
    
    # Directory movements
    dir_movements = [
        ("utils", "translation/utils"),
    ]
    
    print("Moving files...")
    print()
    
    success_count = 0
    skip_count = 0
    error_count = 0
    
    # Move individual files
    for src, dst in movements:
        result = move_file(src, dst, dry_run)
        if result:
            success_count += 1
        elif Path(src).exists():
            error_count += 1
        else:
            skip_count += 1
    
    # Move directories
    for src, dst in dir_movements:
        src_path = Path(src)
        dst_path = Path(dst)
        
        if not src_path.exists():
            print(f"⚠️  SKIP: {src}/ (directory not found)")
            skip_count += 1
            continue
        
        if dst_path.exists():
            print(f"⚠️  SKIP: {dst}/ (already exists)")
            skip_count += 1
            continue
        
        if dry_run:
            print(f"📋 WOULD MOVE DIR: {src}/ → {dst}/")
            success_count += 1
            continue
        
        try:
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src_path), str(dst_path))
            print(f"✅ MOVED DIR: {src}/ → {dst}/")
            success_count += 1
        except Exception as e:
            print(f"❌ ERROR moving directory {src}: {e}")
            error_count += 1
    
    # Summary
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"✅ Moved: {success_count}")
    print(f"⚠️  Skipped: {skip_count}")
    print(f"❌ Errors: {error_count}")
    print()
    
    if dry_run:
        print("This was a DRY RUN. Run without --dry-run to actually move files.")
    else:
        print("✅ File reorganization complete!")
        print()
        print("Next steps:")
        print("1. Update import statements in moved files")
        print("2. Update start scripts paths if needed")
        print("3. Test the API: python main.py")
        print("4. Check the API health: curl http://localhost:8000/api/health")
    
    print()


if __name__ == "__main__":
    # Check if we're in the right directory
    if not Path("phosphene_api.py").exists():
        print("❌ ERROR: This script must be run from the fast_api directory")
        print("   (The directory containing phosphene_api.py)")
        sys.exit(1)
    
    main()
