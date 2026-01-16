import "aframe";

interface YoloDatasetGeneratorData {
  enabled: boolean;
  targetClass: string;
  captureInterval: number;
  autoDownload: boolean;
  logToConsole: boolean;
  occlusionCheckLayers: string;
  classMapping: string; // JSON string: {"Box": 0, "Sphere": 1, "Car": 2}
  minVisiblePixels: number;
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
      targetClass: { type: "string", default: "detectable" }, // Class name to target
      captureInterval: { type: "number", default: 60 }, // Capture every N frames (60 = ~1 per second at 60fps)
      autoDownload: { type: "boolean", default: true }, // Auto-download files
      logToConsole: { type: "boolean", default: true }, // Also log to console
      occlusionCheckLayers: { type: "string", default: "collidable" }, // Classes to check for occlusion
      classMapping: {
        type: "string",
        default: '{"Box": 0, "Sphere": 1, "Cylinder": 2, "Car": 3, "Light": 4}',
      }, // Entity name -> YOLO class ID
      minVisiblePixels: { type: "number", default: 10 }, // Min pixels to consider visible
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

      // Raycaster for occlusion checking
      this.raycaster = new AFRAME.THREE.Raycaster();

      // Parse class mapping
      try {
        this.classMap = JSON.parse(this.data.classMapping);
      } catch (e) {
        console.error("❌ Invalid classMapping JSON, using defaults");
        this.classMap = { Box: 0, Sphere: 1, Cylinder: 2, Car: 3, Light: 4 };
      }

      console.log("📊 YOLO Class Mapping:", this.classMap);
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

      const canvas = this.renderer.domElement;
      const width = canvas.width;
      const height = canvas.height;

      // Find all entities with target class
      const targetEntities = this.scene.querySelectorAll(`.${this.data.targetClass}`);

      if (targetEntities.length === 0) {
        console.warn(`⚠️ No entities found with class "${this.data.targetClass}"`);
        return;
      }

      const yoloAnnotations: string[] = [];
      let validDetections = 0;

      targetEntities.forEach((entity: any) => {
        const object3D = entity.object3D;
        if (!object3D) return;

        // Get entity name for class ID lookup
        const entityName = entity.getAttribute("data-entity-name") || entity.id || "Unknown";

        // Check if entity name is in class map
        const classId = this.classMap[entityName];
        if (classId === undefined) {
          console.warn(`⚠️ Entity "${entityName}" not in class mapping, skipping`);
          return;
        }

        // 1. Check if occluded
        if (this.isOccluded(object3D, this.camera)) {
          console.log(`🚫 Object "${entityName}" is occluded, skipping`);
          return;
        }

        // 2. Get 2D bounding box
        const bbox = this.getScreenBoundingBox(object3D, this.camera);

        if (!bbox || !bbox.visible) {
          console.log(`👁️ Object "${entityName}" not visible in frame, skipping`);
          return;
        }

        // Check minimum size
        const bboxWidth = bbox.x_max - bbox.x_min;
        const bboxHeight = bbox.y_max - bbox.y_min;
        const area = bboxWidth * bboxHeight;

        if (area < this.data.minVisiblePixels) {
          console.log(`📏 Object "${entityName}" too small (${area.toFixed(0)}px²), skipping`);
          return;
        }

        // 3. Convert to YOLO format
        const yoloLine = this.convertToYolo(bbox, width, height, classId);
        yoloAnnotations.push(yoloLine);
        validDetections++;

        console.log(`✅ Detected "${entityName}" [class ${classId}]: ${yoloLine}`);
      });

      if (validDetections === 0) {
        console.log("📭 No valid detections in this frame");
        return;
      }

      // Output results
      const annotationText = yoloAnnotations.join("\n");
      const timestamp = Date.now();
      const frameId = this.captureCount.toString().padStart(4, "0");

      if (this.data.logToConsole) {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`📸 Frame ${frameId} (${validDetections} detections):`);
        console.log(annotationText);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      }

      if (this.data.autoDownload) {
        // Download annotation file
        this.downloadTextFile(annotationText, `frame_${frameId}.txt`);

        // Capture screenshot
        this.captureScreenshot(`frame_${frameId}.jpg`);
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
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },

    /**
     * Capture screenshot from WebGL renderer
     */
    captureScreenshot: function (this: YoloDatasetGenerator, filename: string) {
      try {
        const canvas = this.renderer.domElement;
        canvas.toBlob((blob: Blob | null) => {
          if (!blob) {
            console.error("❌ Failed to create screenshot blob");
            return;
          }

          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, "image/jpeg");
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
