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
      occlusionCheckLayers: { type: "string", default: "collidable" }, // Occlusion check classes
      minVisiblePixels: { type: "number", default: 10 }, // Min bbox area
      outputFormat: { type: "string", default: "yolo" }, // 'yolo', 'json', or 'both'
    },

    init: function (this: YoloDatasetGenerator) {
      console.log("🎯 YOLO Dataset Generator initialized");

      // Get scene and camera
      this.scene = this.el.sceneEl;
      this.camera = this.scene.camera;
      this.renderer = this.scene.renderer;

      // Frame counters
      this.frameCount = 0;
      this.captureCount = 0;

      // Download queue to batch file downloads (reduces browser prompts)
      this.captureQueue = [];
      this.downloadInterval = null;

      // Start batch download processor (downloads one file every 200ms)
      this.downloadInterval = window.setInterval(() => {
        if (this.captureQueue.length > 0) {
          const item = this.captureQueue.shift()!;
          this.downloadFile(item.blob, item.filename);
        }
      }, 200);

      // Raycaster for occlusion checking
      this.raycaster = new AFRAME.THREE.Raycaster();

      // Build class mappings from YOLO_CLASS_MAPPING
      // classMap: "Car" -> 0, "Pole" -> 1, etc.
      // reverseClassMap: 0 -> "Car", 1 -> "Pole", etc.
      this.classMap = {};
      this.reverseClassMap = {};
      
      Object.entries(YOLO_CLASS_MAPPING).forEach(([classId, className]) => {
        const id = parseInt(classId);
        this.classMap[className] = id;
        this.reverseClassMap[id] = className;
        
        // Handle name variations (e.g., "Bus Stop" vs "BusStop")
        const normalized = className.replace(/\s+/g, "");
        this.classMap[normalized] = id;
      });

      console.log("📊 YOLO Class Mapping (backend):", this.classMap);
      console.log("🎯 Detectable Models:", DETECTABLE_MODELS);
    },

    tick: function (this: YoloDatasetGenerator) {
      if (!this.data.enabled) return;

      this.frameCount++;

      // Capture every N frames
      if (this.frameCount % this.data.captureInterval === 0) {
        this.captureFrame();
      }
    },

    captureFrame: function (this: YoloDatasetGenerator) {
      if (!this.camera || !this.renderer) {
        console.warn("⚠️ Camera or renderer not ready");
        return;
      }
      
      // Query entities - try multiple selectors for compatibility
      let allEntities = this.scene.querySelectorAll("[ecs-entity]");
      
      // Fallback: query for gltf-model entities if no ecs-entity found
      if (allEntities.length === 0) {
        allEntities = this.scene.querySelectorAll("[gltf-model]");
        console.log("🔄 Using fallback selector [gltf-model], found:", allEntities.length);
      }

      if (allEntities.length === 0) {
        console.warn("⚠️ No detectable entities found in scene");
        return;
      }

      const yoloAnnotations: string[] = [];
      const jsonDetections: any[] = [];
      let validDetections = 0;
      let detectionId = 1;

      allEntities.forEach((entity: any) => {
        const object3D = entity.object3D;
        if (!object3D) return;

        // Get entity name from multiple sources
        const entityName = entity.getAttribute("data-entity-name") || 
                          entity.getAttribute("ecs-entity") ||
                          entity.getAttribute("class") ||
                          entity.id ||
                          "Unknown";
        
        // Skip camera hitbox and depth-ignore elements
        if (entity.classList.contains("depth-ignore") || 
            entityName === "Unknown" ||
            !entityName) {
          return;
        }

        // Check if this entity type is detectable
        const isDetectable = DETECTABLE_MODELS.some(model => 
          entityName.toLowerCase().includes(model.toLowerCase()) ||
          model.toLowerCase().includes(entityName.toLowerCase())
        );

        if (!isDetectable) {
          return; // Skip non-detectable entities (Light, Box, Sphere, etc.)
        }

        // Get class ID from mapping
        const classId = this.classMap[entityName] || 
                       this.classMap[entityName.replace(/\s+/g, "")];
        
        if (classId === undefined) {
          console.warn(`⚠️ Entity "${entityName}" not in YOLO class mapping, skipping`);
          return;
        }

        // Check if occluded
        if (this.isOccluded(object3D, this.camera)) {
          console.log(`🚫 Object "${entityName}" is occluded, skipping`);
          return;
        }

        // Get 2D bounding box in screen space
        const bbox = this.getScreenBoundingBox(object3D, this.camera);
        if (!bbox || !bbox.visible) {
          return;
        }

        // Check minimum size
        const area = (bbox.x_max - bbox.x_min) * (bbox.y_max - bbox.y_min);
        if (area < this.data.minVisiblePixels) {
          console.log(`🚫 Object "${entityName}" too small (${area.toFixed(0)} pixels), skipping`);
          return;
        }

        // Convert to YOLO format
        const canvas = this.renderer.domElement;
        const yoloLine = this.convertToYolo(bbox, canvas.width, canvas.height, classId);
        yoloAnnotations.push(yoloLine);

        // Create JSON detection entry (compatible with existing format)
        const jsonDetection = {
          id: detectionId++,
          class: this.reverseClassMap[classId],
          shape: null,
          bbox: [
            Math.round(bbox.x_min),
            Math.round(bbox.y_min),
            Math.round(bbox.x_max - bbox.x_min),
            Math.round(bbox.y_max - bbox.y_min)
          ],
          distance_m: null,
          mask_path: null,
          velocity: null,
          hazard: null
        };
        jsonDetections.push(jsonDetection);

        validDetections++;

        console.log(`✅ Detected "${entityName}" [class ${classId}]: ${yoloLine}`);
      });

      if (validDetections === 0) {
        console.log("📭 No valid detections in this frame");
        return;
      }

      // Output results
      const frameId = this.captureCount.toString().padStart(4, "0");
      const timestamp = Date.now();

      if (this.data.logToConsole) {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`📸 Frame ${frameId} (${validDetections} detections):`);
        yoloAnnotations.forEach(line => console.log(line));
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      }

      if (this.data.autoDownload) {
        const format = this.data.outputFormat;

        // Always capture screenshot
        this.captureScreenshot(`frame_${frameId}.jpg`);

        // Download YOLO format (.txt)
        if (format === "yolo" || format === "both") {
          const annotationText = yoloAnnotations.join("\n");
          this.downloadTextFile(annotationText, `frame_${frameId}.txt`);
        }

        // Download JSON format (compatible with existing backend)
        if (format === "json" || format === "both") {
          const jsonOutput = {
            frame_id: `frame_${frameId}`,
            file_path: `frame_${frameId}.jpg`,
            timestamp: timestamp,
            camera_intrinsics: {
              fx: null,
              fy: null,
              cx: null,
              cy: null
            },
            obstacles: jsonDetections
          };
          this.downloadTextFile(
            JSON.stringify(jsonOutput, null, 2), 
            `frame_${frameId}.json`
          );
        }
      }

      this.captureCount++;
    },

    /**
     * Get 2D bounding box of a 3D object in screen space
     */
    getScreenBoundingBox: function (
      this: YoloDatasetGenerator,
      object3D: any,
      camera: any
    ) {
      const box3 = new AFRAME.THREE.Box3().setFromObject(object3D);

      if (box3.isEmpty()) {
        return null;
      }

      // Get 8 corners of the bounding box
      const corners = [
        new AFRAME.THREE.Vector3(box3.min.x, box3.min.y, box3.min.z),
        new AFRAME.THREE.Vector3(box3.min.x, box3.min.y, box3.max.z),
        new AFRAME.THREE.Vector3(box3.min.x, box3.max.y, box3.min.z),
        new AFRAME.THREE.Vector3(box3.min.x, box3.max.y, box3.max.z),
        new AFRAME.THREE.Vector3(box3.max.x, box3.min.y, box3.min.z),
        new AFRAME.THREE.Vector3(box3.max.x, box3.min.y, box3.max.z),
        new AFRAME.THREE.Vector3(box3.max.x, box3.max.y, box3.min.z),
        new AFRAME.THREE.Vector3(box3.max.x, box3.max.y, box3.max.z),
      ];

      const canvas = this.renderer.domElement;
      const width = canvas.width;
      const height = canvas.height;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let anyInFront = false;

      corners.forEach((corner) => {
        // Clone to avoid modifying original
        const projected = corner.clone().project(camera);

        // Check if behind camera (z > 1 means behind in NDC space)
        if (projected.z > 1) {
          return; // Skip this corner
        }

        anyInFront = true;

        // Convert from NDC (-1 to 1) to pixel coordinates (0 to width/height)
        const x = ((projected.x + 1) / 2) * width;
        const y = ((-projected.y + 1) / 2) * height; // Y is inverted in screen space

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });

      // If all corners are behind camera, object is not visible
      if (!anyInFront) {
        return null;
      }

      // Clamp to screen bounds
      minX = Math.max(0, Math.min(width, minX));
      minY = Math.max(0, Math.min(height, minY));
      maxX = Math.max(0, Math.min(width, maxX));
      maxY = Math.max(0, Math.min(height, maxY));

      // Check if bounding box is valid
      if (maxX <= minX || maxY <= minY) {
        return null;
      }

      return {
        x_min: minX,
        y_min: minY,
        x_max: maxX,
        y_max: maxY,
        visible: true,
      };
    },

    /**
     * Convert pixel bounding box to YOLO format
     * YOLO format: class_id x_center y_center width height (all normalized 0-1)
     */
    convertToYolo: function (
      this: YoloDatasetGenerator,
      bbox: { x_min: number; y_min: number; x_max: number; y_max: number },
      width: number,
      height: number,
      classId: number
    ) {
      const x_center = (bbox.x_min + bbox.x_max) / 2 / width;
      const y_center = (bbox.y_min + bbox.y_max) / 2 / height;
      const box_width = (bbox.x_max - bbox.x_min) / width;
      const box_height = (bbox.y_max - bbox.y_min) / height;

      // Clamp values to [0, 1]
      const clamp = (val: number) => Math.max(0, Math.min(1, val));

      return `${classId} ${clamp(x_center).toFixed(6)} ${clamp(y_center).toFixed(6)} ${clamp(box_width).toFixed(6)} ${clamp(box_height).toFixed(6)}`;
    },

    /**
     * Check if object is occluded by raycasting from camera to object center
     */
    isOccluded: function (this: YoloDatasetGenerator, targetObject: any, camera: any) {
      // Get object center in world space
      const objectCenter = new AFRAME.THREE.Vector3();
      const box = new AFRAME.THREE.Box3().setFromObject(targetObject);
      box.getCenter(objectCenter);

      // Calculate direction from camera to object
      const cameraPosition = camera.position.clone();
      const direction = objectCenter.clone().sub(cameraPosition).normalize();

      // Calculate distance to object
      const distanceToObject = cameraPosition.distanceTo(objectCenter);

      // Setup raycaster
      this.raycaster.set(cameraPosition, direction);
      this.raycaster.far = distanceToObject - 0.1; // Stop just before the object

      // Find all occluding objects
      const occludingElements = this.scene.querySelectorAll(`.${this.data.occlusionCheckLayers}`);
      const occludingObjects: any[] = [];

      occludingElements.forEach((el: any) => {
        if (el.object3D && el.object3D !== targetObject) {
          // Recursively add all meshes
          el.object3D.traverse((child: any) => {
            if (child.isMesh) {
              occludingObjects.push(child);
            }
          });
        }
      });

      // Perform raycast
      const intersections = this.raycaster.intersectObjects(occludingObjects, true);

      // If we hit something before reaching the object, it's occluded
      return intersections.length > 0;
    },

    /**
     * Download text file
     */
    downloadTextFile: function (this: YoloDatasetGenerator, content: string, filename: string) {
      const blob = new Blob([content], { type: "text/plain" });
      // Add to download queue instead of immediate download
      this.captureQueue.push({ filename, blob, type: 'text' });
    },

    /**
     * Download a file (used by queue processor)
     */
    downloadFile: function (this: YoloDatasetGenerator, blob: Blob, filename: string) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      // Cleanup after short delay
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    },

    /**
     * Capture screenshot from WebGL renderer
     */
    captureScreenshot: function (this: YoloDatasetGenerator, filename: string) {
      try {
        // Force a render to ensure canvas is up-to-date
        this.renderer.render(this.scene.object3D, this.camera);
        
        const canvas = this.renderer.domElement;
        
        // Use toBlob with quality setting for JPEG
        canvas.toBlob((blob: Blob | null) => {
          if (!blob) {
            console.error("❌ Failed to create screenshot blob");
            return;
          }

          // Add to download queue instead of immediate download
          this.captureQueue.push({ filename, blob, type: 'image' });
        }, "image/jpeg", 0.95);
      } catch (error) {
        console.error("❌ Screenshot capture failed:", error);
      }
    },

    remove: function (this: YoloDatasetGenerator) {
      if (this.downloadInterval) {
        clearInterval(this.downloadInterval);
      }
      console.log("🎯 YOLO Dataset Generator removed");
    },
  });
}

export {};
