import "aframe";

// Import class mapping from backend
// This will be loaded dynamically from the JSON file
const YOLO_CLASS_MAPPING = {
    "0": "Person",
    "1": "Crossway",
    "2": "Plotted Plant",
    "3": "Pole",
    "4": "Garbage",
    "5": "Bus station",
    "6": "Car",
    "7": "Tree"
};

// Detectable models from modelsDeclare.ts (exclude Light and environmental objects)
const DETECTABLE_MODELS = [
  "Car",
  "Tree",
  "TreeTrunk",
  "Pole",
  "Plotted Plant",
  "PlottedPlant",
  "Man",
  "Person",
  "Bus Stop",
  "BusStop",
  "Garbage"
];

// --- Performance Variables (Reusable to prevent lag) ---
const _vA = new AFRAME.THREE.Vector3();
const _vB = new AFRAME.THREE.Vector3();

interface YoloDatasetGeneratorData {
  enabled: boolean;
  captureInterval: number;
  autoDownload: boolean;
  logToConsole: boolean;
  occlusionCheckLayers: string;
  minVisiblePixels: number;
  outputFormat: string; // 'yolo' or 'json'
}

interface YoloDatasetGenerator {
  data: YoloDatasetGeneratorData;
  el: any;
  camera: any;
  scene: any;
  renderer: any;
  frameCount: number;
  captureCount: number;
  raycaster: THREE.Raycaster;
  classMap: Record<string, number>;
  reverseClassMap: Record<number, string>;
  captureQueue: Array<{ filename: string; blob: Blob; type: string }>;
  downloadInterval: number | null;

  captureFrame: () => void;
  getScreenBoundingBox: (
    object3D: any,
    camera: any
  ) => { x_min: number; y_min: number; x_max: number; y_max: number; visible: boolean } | null;
  convertToYolo: (
    bbox: { x_min: number; y_min: number; x_max: number; y_max: number },
    width: number,
    height: number,
    classId: number
  ) => string;
  isOccluded: (targetObject: any, camera: any) => boolean;
  downloadTextFile: (content: string, filename: string) => void;
  captureScreenshot: (filename: string) => void;
}

if (typeof AFRAME !== "undefined" && !AFRAME.components["yolo-dataset-generator"]) {
  AFRAME.registerComponent("yolo-dataset-generator", {
    schema: {
      enabled: { type: "boolean", default: true },
      captureInterval: { type: "number", default: 60 }, // Capture every N frames (60 = ~1/sec at 60fps)
      autoDownload: { type: "boolean", default: true }, // Auto-download files
      logToConsole: { type: "boolean", default: false }, // Log to console
      minVisiblePixels: { type: "number", default: 400 }, // Min bbox area - ignore tiny distant objects
      paddingPixels: { type: "number", default: 5 }, // Safety buffer around objects
      outputFormat: { type: "string", default: "yolo" }, // 'yolo', 'json', or 'both'
    },

    init: function (this: YoloDatasetGenerator) {
      console.log("🚀 Precision YOLO Generator Started (with Padding)");

      // Get scene and camera
      this.scene = this.el.sceneEl;
      this.camera = this.scene.camera;
      this.renderer = this.scene.renderer;

      // Frame counters
      this.frameCount = 0;
      this.captureCount = 0;

      // Raycaster for occlusion checking
      this.raycaster = new AFRAME.THREE.Raycaster();

      // Build class mappings from YOLO_CLASS_MAPPING
      // Store in lowercase for easier matching
      this.classMap = {};
      this.reverseClassMap = {};
      
      Object.entries(YOLO_CLASS_MAPPING).forEach(([classId, className]) => {
        const id = parseInt(classId);
        this.classMap[className.toLowerCase()] = id;
        this.reverseClassMap[id] = className;
        
        // Handle name variations (e.g., "Bus Stop" vs "BusStop")
        const normalized = className.replace(/\s+/g, "").toLowerCase();
        this.classMap[normalized] = id;
      });

      console.log("📊 YOLO Class Mapping (backend):", this.classMap);
      console.log("🎯 Detectable Models:", DETECTABLE_MODELS);
    },

    tick: function (this: YoloDatasetGenerator) {
      if (!this.data.enabled) return;

      // Wait for scene to fully load before capturing
      if (!this.scene.hasLoaded) return;

      this.frameCount++;

      // Capture every N frames - use requestAnimationFrame for better performance
      if (this.frameCount % this.data.captureInterval === 0) {
        requestAnimationFrame(() => this.captureFrame());
      }
    },

    captureFrame: function (this: YoloDatasetGenerator) {
      if (!this.camera) return;

      const yoloAnnotations: string[] = [];
      const jsonDetections: any[] = [];
      const width = this.renderer.domElement.width;
      const height = this.renderer.domElement.height;
      const camPos = this.camera.position;
      let detectionId = 1;

      // 1. Gather all potential occluders (Everything that can block a view)
      const occluders: any[] = [];
      this.scene.object3D.traverse((node: any) => {
        if (node.isMesh && node.visible) occluders.push(node);
      });

      // 2. Find detectable entity candidates
      let candidates = Array.from(this.scene.querySelectorAll("[ecs-entity]"));
      if (candidates.length === 0) {
        candidates = Array.from(this.scene.querySelectorAll("[gltf-model]"));
      }

      const validCandidates = candidates.filter((el: any) => el.object3D && el.object3D.visible);

      validCandidates.forEach((el: any) => {
        // --- A. Identification ---
        const rawName = el.getAttribute("data-entity-name") || 
                        el.getAttribute("ecs-entity") || 
                        el.id || 
                        "Unknown";
        const name = rawName.toLowerCase();
        
        // Skip depth-ignore or unknown entities
        if (el.classList.contains("depth-ignore") || name === "unknown") return;

        // Check if detectable
        if (!DETECTABLE_MODELS.some(m => name.includes(m.toLowerCase()))) return;
        
        // Get class ID
        const cleanName = name.replace(/\s+/g, "");
        const classId = this.classMap[name] ?? this.classMap[cleanName];
        if (classId === undefined) {
          if (this.data.logToConsole) {
            console.warn(`⚠️ Entity "${rawName}" not in YOLO class mapping`);
          }
          return;
        }

        const obj3D = el.object3D;

        // --- B. Precise Vertex Sampling with Padding ---
        const screenBox = this.getPreciseScreenBox(obj3D, width, height);

        if (!screenBox) return; // Off-screen or invalid
        if (screenBox.area < this.data.minVisiblePixels) return; // Too small

        // --- C. Occlusion Check ---
        // Raycast to the center of mass of the visible vertices
        if (this.isOccluded(screenBox.worldCenter, obj3D, occluders, camPos)) {
          if (this.data.logToConsole) {
            console.log(`🚫 Object "${rawName}" is occluded`);
          }
          return;
        }

        // --- D. Generate YOLO Data ---
        const yoloStr = this.formatYolo(screenBox, width, height, classId);
        yoloAnnotations.push(yoloStr);

        // Create JSON detection entry (compatible with existing format)
        const jsonDetection = {
          id: detectionId++,
          class: this.reverseClassMap[classId],
          shape: null,
          bbox: [
            Math.round(screenBox.minX),
            Math.round(screenBox.minY),
            Math.round(screenBox.maxX - screenBox.minX),
            Math.round(screenBox.maxY - screenBox.minY)
          ],
          distance_m: camPos.distanceTo(screenBox.worldCenter),
          mask_path: null,
          velocity: null,
          hazard: null
        };
        jsonDetections.push(jsonDetection);

        if (this.data.logToConsole) {
          console.log(`✅ Detected "${rawName}" [class ${classId}]: ${yoloStr}`);
        }
      });

      // --- Save Data ---
      if (yoloAnnotations.length === 0) {
        if (this.data.logToConsole) {
          console.log("📭 No valid detections in this frame");
        }
        return;
      }

      const frameId = this.captureCount.toString().padStart(4, "0");
      console.log(`📸 Captured ${yoloAnnotations.length} objects in frame ${frameId}`);

      if (this.data.logToConsole) {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        yoloAnnotations.forEach(line => console.log(line));
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      }

      if (this.data.autoDownload) {
        const format = this.data.outputFormat;

        // Download YOLO format (.txt)
        if (format === "yolo" || format === "both") {
          this.saveData(yoloAnnotations.join("\n"), frameId, "txt");
        }

        // Download JSON format (compatible with existing backend)
        if (format === "json" || format === "both") {
          const jsonOutput = {
            frame_id: `frame_${frameId}`,
            file_path: `frame_${frameId}.jpg`,
            timestamp: Date.now(),
            camera_intrinsics: { fx: null, fy: null, cx: null, cy: null },
            obstacles: jsonDetections
          };
          this.saveData(JSON.stringify(jsonOutput, null, 2), frameId, "json");
        }

        // Always capture screenshot
        this.captureScreenshot(frameId);
      }

      this.captureCount++;
    },

    /**
     * Scans mesh vertices to find tightest possible 2D box.
     * Uses striding + padding for speed and accuracy.
     */
    getPreciseScreenBox: function(this: YoloDatasetGenerator, rootObj: any, w: number, h: number) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let validPoints = 0;
      
      const worldCenterAccumulator = new AFRAME.THREE.Vector3(0, 0, 0);

      rootObj.traverse((child: any) => {
        if (!child.isMesh || !child.geometry) return;

        const posAttr = child.geometry.attributes.position;
        if (!posAttr) return;

        const count = posAttr.count;
        // Optimization: Sample every 64th vertex (High performance, Good accuracy)
        const stride = Math.max(1, Math.floor(count / 64));

        child.updateMatrixWorld();

        for (let i = 0; i < count; i += stride) {
          _vA.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
          _vA.applyMatrix4(child.matrixWorld);
          
          worldCenterAccumulator.add(_vA); // Track center
          
          _vA.project(this.camera);

          if (_vA.z > 1) continue; // Behind camera

          const x = (_vA.x * 0.5 + 0.5) * w;
          const y = (-(_vA.y * 0.5) + 0.5) * h;

          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          validPoints++;
        }
      });

      if (validPoints < 4) return null;

      // --- APPLY SAFETY PADDING ---
      const pad = this.data.paddingPixels;
      minX -= pad;
      maxX += pad;
      minY -= pad;
      maxY += pad;

      // --- CLAMP TO SCREEN ---
      minX = Math.max(0, minX);
      minY = Math.max(0, minY);
      maxX = Math.min(w, maxX);
      maxY = Math.min(h, maxY);

      const area = (maxX - minX) * (maxY - minY);
      if (area <= 0) return null;

      worldCenterAccumulator.divideScalar(validPoints);

      return { 
        minX, minY, maxX, maxY, area, 
        worldCenter: worldCenterAccumulator 
      };
    },

    /**
     * Convert pixel bounding box to YOLO format
     * YOLO format: class_id x_center y_center width height (all normalized 0-1)
     */
    formatYolo: function(this: YoloDatasetGenerator, box: any, w: number, h: number, classId: number) {
      const cx = ((box.minX + box.maxX) / 2) / w;
      const cy = ((box.minY + box.maxY) / 2) / h;
      const bw = (box.maxX - box.minX) / w;
      const bh = (box.maxY - box.minY) / h;
      return `${classId} ${cx.toFixed(6)} ${cy.toFixed(6)} ${bw.toFixed(6)} ${bh.toFixed(6)}`;
    },

    /**
     * Check if object is occluded by raycasting from camera to object center
     * Prevents self-occlusion by checking if blocker is part of the target object
     */
    isOccluded: function(this: YoloDatasetGenerator, targetPoint: any, targetObj: any, occluders: any[], camPos: any) {
      _vB.subVectors(targetPoint, camPos).normalize();
      const dist = camPos.distanceTo(targetPoint);

      // Skip occlusion check for very close objects (< 2 meters)
      if (dist < 2) return false;

      this.raycaster.set(camPos, _vB);
      this.raycaster.far = dist - 0.2;

      const hits = this.raycaster.intersectObjects(occluders, false);

      if (hits.length === 0) return false;

      // Check if blocker is part of the target object itself (prevent self-occlusion)
      for (let i = 0; i < hits.length; i++) {
        let blocker = hits[i].object;
        let isSelf = false;
        
        // Walk up the parent chain to check if this hit is part of the target
        while (blocker) {
          if (blocker.uuid === targetObj.uuid) {
            isSelf = true;
            break;
          }
          blocker = blocker.parent;
        }
        
        if (!isSelf) return true; // Occluded by something else
      }

      return false; // All hits were self-occlusion
    },

    /**
     * Save data to file (text or JSON)
     */
    saveData: function(this: YoloDatasetGenerator, text: string, id: string, extension: string) {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `frame_${id}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
    },

    /**
     * Capture screenshot from WebGL renderer
     */
    captureScreenshot: function(this: YoloDatasetGenerator, frameId: string) {
      try {
        // Force a render to ensure canvas is up-to-date
        this.renderer.render(this.scene.object3D, this.camera);
        
        this.renderer.domElement.toBlob((imgBlob: Blob | null) => {
          if (!imgBlob) {
            console.error("❌ Failed to create screenshot blob");
            return;
          }
          const imgUrl = URL.createObjectURL(imgBlob);
          const b = document.createElement('a');
          b.href = imgUrl;
          b.download = `frame_${frameId}.jpg`;
          b.click();
          URL.revokeObjectURL(imgUrl);
        }, 'image/jpeg', 0.95);
      } catch (error) {
        console.error("❌ Screenshot capture failed:", error);
      }
    },

    remove: function (this: YoloDatasetGenerator) {
      console.log("🎯 YOLO Dataset Generator removed");
    },
  });
}

export {};
