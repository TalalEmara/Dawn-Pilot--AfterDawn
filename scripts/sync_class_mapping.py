"""
YOLO Class Mapping Sync Tool
-----------------------------
Synchronizes class mapping between backend JSON file and frontend TypeScript component.

This tool:
1. Reads yolo_class_mapping.json from backend
2. Updates YoloDatasetGenerator.ts with the mapping
3. Ensures consistency between frontend and backend

Usage:
    python sync_class_mapping.py
"""

import json
import os
import re

# Paths
BACKEND_JSON = "../Back-End/fast_api/object_path_detection/yolo_class_mapping.json"
FRONTEND_TS = "../Front-End/Main-Main-App/DawnPilotFrontEnd/src/AFrameComponents/YoloDatasetGenerator.ts"

def load_json_mapping():
    """Load class mapping from backend JSON file"""
    with open(BACKEND_JSON, 'r') as f:
        mapping = json.load(f)
    print(f"📊 Loaded mapping from {BACKEND_JSON}")
    print(f"   Classes: {list(mapping.values())}")
    return mapping

def update_typescript_file(mapping):
    """Update TypeScript file with new mapping"""
    
    # Read current file
    with open(FRONTEND_TS, 'r') as f:
        content = f.read()
    
    # Format mapping for TypeScript
    ts_mapping = "const YOLO_CLASS_MAPPING = {\n"
    for class_id, class_name in mapping.items():
        ts_mapping += f'  "{class_id}": "{class_name}",\n'
    ts_mapping += "};"
    
    # Replace mapping in file
    pattern = r'const YOLO_CLASS_MAPPING = \{[^}]+\};'
    
    if re.search(pattern, content, re.DOTALL):
        new_content = re.sub(pattern, ts_mapping, content, flags=re.DOTALL)
        
        # Write back
        with open(FRONTEND_TS, 'w') as f:
            f.write(new_content)
        
        print(f"✅ Updated {FRONTEND_TS}")
        return True
    else:
        print(f"❌ Could not find YOLO_CLASS_MAPPING in {FRONTEND_TS}")
        return False

def main():
    print("🔄 Syncing YOLO class mapping...\n")
    
    # Check files exist
    if not os.path.exists(BACKEND_JSON):
        print(f"❌ Backend JSON not found: {BACKEND_JSON}")
        return
    
    if not os.path.exists(FRONTEND_TS):
        print(f"❌ Frontend TS not found: {FRONTEND_TS}")
        return
    
    # Load and update
    mapping = load_json_mapping()
    success = update_typescript_file(mapping)
    
    if success:
        print("\n✅ Class mapping synchronized!")
        print("📝 Don't forget to rebuild your frontend if running in dev mode")
    else:
        print("\n❌ Synchronization failed")

if __name__ == "__main__":
    main()


"""
Example Output:
--------------

🔄 Syncing YOLO class mapping...

📊 Loaded mapping from yolo_class_mapping.json
   Classes: ['Car', 'Pole', 'Bus station', 'Tree Trunk', 'Person', 'Potted Plant']
✅ Updated YoloDatasetGenerator.ts

✅ Class mapping synchronized!
📝 Don't forget to rebuild your frontend if running in dev mode
"""
