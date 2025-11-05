#!/usr/bin/env python3
"""
Real-Time Camera Navigation Translator

Processes live camera feed and displays translated phosphene vision in real-time.
Works with webcam, IP camera, or video files.
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import numpy as np
from PIL import Image, ImageTk
import cv2
import os
import json
import time
import threading
from queue import Queue
from translator import Translator
from datetime import datetime
from realtime_detector import create_detector


class RealtimeCameraGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Real-Time Navigation Translator")
        self.root.geometry("1800x900")
        
        # Initialize paths
        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.output_dir = os.path.join(self.script_dir, "realtime_output")
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Default paths for translator
        self.shapes_path = os.path.join(self.script_dir, "dummy_data/canonical_shapes.json")
        self.params_path = os.path.join(self.script_dir, "dummy_data/selection_params.json")
        
        # Load detector configuration
        self.detector_config_path = os.path.join(self.script_dir, "detector_config.json")
        self.detector_config = self.load_detector_config()
        
        # Camera state
        self.camera = None
        self.is_running = False
        self.camera_thread = None
        self.process_thread = None
        
        # Frame queues for threading
        self.camera_queue = Queue(maxsize=2)  # Small queue to keep latency low
        self.display_queue = Queue(maxsize=2)
        
        # Detection system
        self.detector = None
        self.detector_type = tk.StringVar(value="mock")  # "mock", "yolo", "fasterrcnn"
        self.initialize_detector()
        
        # Performance metrics
        self.fps_camera = 0
        self.fps_processing = 0
        self.last_fps_update = time.time()
        self.frame_count = 0
        
        # Threshold parameters
        self.t_min = tk.DoubleVar(value=0.3)
        self.k_min = tk.IntVar(value=1)
        self.k_max = tk.IntVar(value=5)
        
        # Current frame data
        self.current_objects = []
        
        # Translator instance (reuse instead of creating new one each frame)
        self.translator = None
        self.temp_json_path = os.path.join(self.output_dir, "temp_detection.json")
        
        # Recording
        self.is_recording = False
        self.video_writer = None
        self.recorded_frames = 0
        
        # Initialize GUI
        self.setup_gui()
    
    def setup_gui(self):
        """Setup the GUI layout"""
        # Main container
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configure grid weights
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=2)
        main_frame.columnconfigure(1, weight=2)
        main_frame.columnconfigure(2, weight=1)
        main_frame.rowconfigure(0, weight=0)  # Info panel
        main_frame.rowconfigure(1, weight=1)  # Image displays
        main_frame.rowconfigure(2, weight=0)  # Threshold controls
        main_frame.rowconfigure(3, weight=0)  # Camera controls
        
        # Info panel
        self.setup_info_panel(main_frame)
        
        # Image display frames
        self.setup_image_frames(main_frame)
        
        # Object scoring panel
        self.setup_scoring_panel(main_frame)
        
        # Threshold controls
        self.setup_threshold_controls(main_frame)
        
        # Camera control panel
        self.setup_camera_controls(main_frame)
    
    def setup_info_panel(self, parent):
        """Setup info panel showing system status"""
        info_frame = ttk.LabelFrame(parent, text="System Status", padding="10")
        info_frame.grid(row=0, column=0, columnspan=3, padx=5, pady=5, sticky=(tk.W, tk.E))
        
        self.status_label = ttk.Label(info_frame, text="Camera: Disconnected", font=("Arial", 10))
        self.status_label.pack(side=tk.LEFT, padx=10)
        
        self.fps_label = ttk.Label(info_frame, text="FPS: 0.0 | Processing: 0.0", font=("Arial", 10))
        self.fps_label.pack(side=tk.LEFT, padx=20)
        
        self.latency_label = ttk.Label(info_frame, text="Latency: N/A", font=("Arial", 10))
        self.latency_label.pack(side=tk.LEFT, padx=20)
        
        self.recording_label = ttk.Label(info_frame, text="● REC", font=("Arial", 10, "bold"), foreground="red")
        self.recording_label.pack(side=tk.RIGHT, padx=10)
        self.recording_label.pack_forget()  # Hide initially
    
    def setup_image_frames(self, parent):
        """Setup image display areas"""
        # Camera Feed Frame
        camera_frame = ttk.LabelFrame(parent, text="Camera Feed", padding="5")
        camera_frame.grid(row=1, column=0, padx=5, pady=5, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        self.camera_label = ttk.Label(camera_frame, text="No camera connected")
        self.camera_label.pack(expand=True, fill=tk.BOTH)
        
        # Translated Output Frame
        output_frame = ttk.LabelFrame(parent, text="Phosphene Vision Output", padding="5")
        output_frame.grid(row=1, column=1, padx=5, pady=5, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        self.output_label = ttk.Label(output_frame, text="Processing will start when camera is active")
        self.output_label.pack(expand=True, fill=tk.BOTH)
    
    def setup_scoring_panel(self, parent):
        """Setup object scoring display panel"""
        scoring_frame = ttk.LabelFrame(parent, text="Detected Objects", padding="5")
        scoring_frame.grid(row=1, column=2, padx=5, pady=5, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Scrollable text widget
        scroll_frame = ttk.Frame(scoring_frame)
        scroll_frame.pack(fill=tk.BOTH, expand=True)
        
        scrollbar = ttk.Scrollbar(scroll_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.scoring_text = tk.Text(
            scroll_frame,
            width=30,
            height=20,
            wrap=tk.WORD,
            yscrollcommand=scrollbar.set,
            font=("Courier", 9)
        )
        self.scoring_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.scoring_text.yview)
        
        self.scoring_text.config(state=tk.DISABLED)
    
    def setup_threshold_controls(self, parent):
        """Setup threshold slider controls"""
        threshold_frame = ttk.LabelFrame(parent, text="Selection Thresholds", padding="10")
        threshold_frame.grid(row=2, column=0, columnspan=3, padx=5, pady=5, sticky=(tk.W, tk.E))
        
        # T_min slider
        tmin_frame = ttk.Frame(threshold_frame)
        tmin_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(tmin_frame, text="T_min (Min Score):").pack(side=tk.LEFT, padx=5)
        self.tmin_label = ttk.Label(tmin_frame, text="0.30", width=6)
        self.tmin_label.pack(side=tk.RIGHT, padx=5)
        
        ttk.Scale(
            tmin_frame,
            from_=0.0,
            to=1.0,
            variable=self.t_min,
            orient=tk.HORIZONTAL,
            command=self.on_threshold_change
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # K_min and K_max in same row
        k_frame = ttk.Frame(threshold_frame)
        k_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # K_min
        kmin_subframe = ttk.Frame(k_frame)
        kmin_subframe.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        ttk.Label(kmin_subframe, text="K_min:").pack(side=tk.LEFT, padx=5)
        self.kmin_label = ttk.Label(kmin_subframe, text="1", width=4)
        self.kmin_label.pack(side=tk.RIGHT, padx=5)
        
        ttk.Scale(
            kmin_subframe,
            from_=0,
            to=10,
            variable=self.k_min,
            orient=tk.HORIZONTAL,
            command=self.on_threshold_change
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # K_max
        kmax_subframe = ttk.Frame(k_frame)
        kmax_subframe.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        ttk.Label(kmax_subframe, text="K_max:").pack(side=tk.LEFT, padx=5)
        self.kmax_label = ttk.Label(kmax_subframe, text="5", width=4)
        self.kmax_label.pack(side=tk.RIGHT, padx=5)
        
        ttk.Scale(
            kmax_subframe,
            from_=1,
            to=15,
            variable=self.k_max,
            orient=tk.HORIZONTAL,
            command=self.on_threshold_change
        ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
    
    def setup_camera_controls(self, parent):
        """Setup camera control panel"""
        control_frame = ttk.LabelFrame(parent, text="Camera Controls", padding="10")
        control_frame.grid(row=3, column=0, columnspan=3, padx=5, pady=5, sticky=(tk.W, tk.E))
        
        # Left side - Camera source
        source_frame = ttk.Frame(control_frame)
        source_frame.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        ttk.Label(source_frame, text="Camera Source:").pack(side=tk.LEFT, padx=5)
        
        self.camera_source = tk.StringVar(value="0")
        self.source_entry = ttk.Entry(source_frame, textvariable=self.camera_source, width=30)
        self.source_entry.pack(side=tk.LEFT, padx=5)
        
        ttk.Button(source_frame, text="Browse Video", command=self.browse_video).pack(side=tk.LEFT, padx=2)
        
        # Middle - Detector selection
        detector_frame = ttk.Frame(control_frame)
        detector_frame.pack(side=tk.LEFT, padx=20)
        
        ttk.Label(detector_frame, text="Detector:").pack(side=tk.LEFT, padx=5)
        
        detector_combo = ttk.Combobox(
            detector_frame,
            textvariable=self.detector_type,
            values=["mock", "yolo", "fasterrcnn"],
            state="readonly",
            width=12
        )
        detector_combo.pack(side=tk.LEFT, padx=5)
        
        # Right side - Control buttons
        button_frame = ttk.Frame(control_frame)
        button_frame.pack(side=tk.RIGHT)
        
        self.start_button = ttk.Button(button_frame, text="▶ Start Camera", command=self.start_camera, width=15)
        self.start_button.pack(side=tk.LEFT, padx=2)
        
        self.stop_button = ttk.Button(button_frame, text="⏹ Stop Camera", command=self.stop_camera, width=15, state=tk.DISABLED)
        self.stop_button.pack(side=tk.LEFT, padx=2)
        
        self.record_button = ttk.Button(button_frame, text="⏺ Record", command=self.toggle_recording, width=12, state=tk.DISABLED)
        self.record_button.pack(side=tk.LEFT, padx=2)
        
        self.snapshot_button = ttk.Button(button_frame, text="📷 Snapshot", command=self.take_snapshot, width=12, state=tk.DISABLED)
        self.snapshot_button.pack(side=tk.LEFT, padx=2)
    
    def browse_video(self):
        """Browse for a video file"""
        file_path = filedialog.askopenfilename(
            title="Select Video File",
            filetypes=[("Video files", "*.mp4 *.avi *.mov *.mkv"), ("All files", "*.*")]
        )
        if file_path:
            self.camera_source.set(file_path)
    
    def start_camera(self):
        """Start the camera feed and processing"""
        if self.is_running:
            return
        
        try:
            # Try to open camera
            source = self.camera_source.get()
            
            # Check if it's a number (webcam index)
            try:
                source = int(source)
            except ValueError:
                pass  # It's a file path or URL
            
            self.camera = cv2.VideoCapture(source)
            
            if not self.camera.isOpened():
                messagebox.showerror("Error", f"Failed to open camera source: {source}")
                return
            
            # Set camera properties for better performance
            self.camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize latency
            
            self.is_running = True
            self.frame_count = 0
            self.last_fps_update = time.time()
            
            # Start threads
            self.camera_thread = threading.Thread(target=self.camera_loop, daemon=True)
            self.camera_thread.start()
            
            self.process_thread = threading.Thread(target=self.processing_loop, daemon=True)
            self.process_thread.start()
            
            # Update UI
            self.start_button.configure(state=tk.DISABLED)
            self.stop_button.configure(state=tk.NORMAL)
            self.record_button.configure(state=tk.NORMAL)
            self.snapshot_button.configure(state=tk.NORMAL)
            self.status_label.configure(text=f"Camera: Connected ({source})", foreground="green")
            
            # Start display update loop
            self.update_display()
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to start camera: {e}")
            print(f"Camera start error: {e}")
            import traceback
            traceback.print_exc()
    
    def stop_camera(self):
        """Stop the camera feed and processing"""
        self.is_running = False
        
        # Stop recording if active
        if self.is_recording:
            self.toggle_recording()
        
        # Wait for threads to finish
        if self.camera_thread:
            self.camera_thread.join(timeout=2.0)
        if self.process_thread:
            self.process_thread.join(timeout=2.0)
        
        # Release camera
        if self.camera:
            self.camera.release()
            self.camera = None
        
        # Clear queues
        while not self.camera_queue.empty():
            self.camera_queue.get()
        while not self.display_queue.empty():
            self.display_queue.get()
        
        # Update UI
        self.start_button.configure(state=tk.NORMAL)
        self.stop_button.configure(state=tk.DISABLED)
        self.record_button.configure(state=tk.DISABLED)
        self.snapshot_button.configure(state=tk.DISABLED)
        self.status_label.configure(text="Camera: Disconnected", foreground="black")
        self.camera_label.configure(image="", text="Camera stopped")
        self.output_label.configure(image="", text="Processing stopped")
    
    def camera_loop(self):
        """Camera capture loop running in separate thread"""
        while self.is_running and self.camera:
            ret, frame = self.camera.read()
            
            if not ret:
                print("Failed to read from camera")
                break
            
            # Put frame in queue (drop old frames to minimize latency)
            if self.camera_queue.full():
                try:
                    self.camera_queue.get_nowait()  # Remove old frame
                except:
                    pass
            
            try:
                self.camera_queue.put(frame, block=False)
            except:
                pass  # Queue full, skip this frame
            
            # Small sleep to prevent CPU overload
            time.sleep(0.001)
    
    def processing_loop(self):
        """Frame processing loop running in separate thread"""
        while self.is_running:
            try:
                # Get frame from camera queue
                frame = self.camera_queue.get(timeout=1.0)
                
                process_start = time.time()
                
                # Run detection and translation
                translated_frame, objects = self.process_frame(frame)
                
                process_time = time.time() - process_start
                processing_fps = 1.0 / process_time if process_time > 0 else 0
                
                # Put result in display queue
                if self.display_queue.full():
                    try:
                        self.display_queue.get_nowait()
                    except:
                        pass
                
                self.display_queue.put((frame, translated_frame, objects, processing_fps), block=False)
                
            except Exception as e:
                if self.is_running:
                    print(f"Processing error: {e}")
    
    def process_frame(self, frame):
        """Process a single frame through detection and translation"""
        h, w = frame.shape[:2]
        
        # Run detector on frame
        detections = self.mock_detect_objects(frame)
        
        # Create detection data in format expected by translator
        detection_data = {
            "frame_id": f"frame_{self.frame_count}",
            "file_path": "realtime_camera",
            "metadata": {
                "image_width": w,
                "image_height": h,
                "camera_intrinsics": None
            },
            "free_path": None,  # Can add path planning here if available
            "obstacles": detections
        }
        
        # Save temporary detection JSON
        with open(self.temp_json_path, 'w') as f:
            json.dump(detection_data, f)
        
        # Initialize translator once on first frame
        if self.translator is None:
            self.translator = Translator(
                self.temp_json_path,
                self.shapes_path,
                self.params_path,
                None,
                self.output_dir
            )
        else:
            # Reuse translator, just update the bundle with new detections
            with open(self.temp_json_path, 'r') as f:
                self.translator.bundle = json.load(f)
            
            # Re-detect input size from new frame
            self.translator.input_width, self.translator.input_height = self.translator._detect_input_image_size()
            self.translator.canvas_size = (self.translator.input_width, self.translator.input_height)
        
        # Update translator parameters with current threshold values
        self.translator.params['T_min'] = self.t_min.get()
        self.translator.params['K_min'] = self.k_min.get()
        self.translator.params['K_max'] = self.k_max.get()
        
        # Generate output
        output_filename = f"realtime_frame_{self.frame_count:06d}.png"
        output_path = self.translator.run(output_filename)
        
        # Load translated image
        translated_frame = cv2.imread(output_path)
        
        # Get object scores
        objects = self.get_object_scores(self.translator)
        
        self.frame_count += 1
        
        return translated_frame, objects
    
    def load_detector_config(self):
        """Load detector configuration from JSON file"""
        try:
            if os.path.exists(self.detector_config_path):
                with open(self.detector_config_path, 'r') as f:
                    config = json.load(f)
                print(f"✓ Loaded detector config from {self.detector_config_path}")
                return config
            else:
                print(f"⚠ Config file not found: {self.detector_config_path}")
                # Return default config
                return {
                    "detector_type": "mock",
                    "yolo": {
                        "weights_path": "",
                        "config_path": "",
                        "classes_path": "",
                        "conf_threshold": 0.5
                    },
                    "fasterrcnn": {
                        "model_path": "",
                        "conf_threshold": 0.5
                    }
                }
        except Exception as e:
            print(f"Error loading detector config: {e}")
            return {"detector_type": "mock"}
    
    def initialize_detector(self):
        """Initialize the object detector using config file"""
        try:
            detector_type = self.detector_config.get("detector_type", "mock")
            
            if detector_type == "yolo":
                yolo_config = self.detector_config.get("yolo", {})
                self.detector = create_detector(
                    "yolo",
                    model_path=yolo_config.get("model_path", "yolov8n.pt"),
                    conf_threshold=yolo_config.get("conf_threshold", 0.5)
                )
            elif detector_type == "fasterrcnn":
                frcnn_config = self.detector_config.get("fasterrcnn", {})
                self.detector = create_detector(
                    "fasterrcnn",
                    model_path=frcnn_config.get("model_path"),
                    conf_threshold=frcnn_config.get("conf_threshold", 0.5)
                )
            else:
                # Default to mock
                self.detector = create_detector("mock")
            
            if self.detector.is_loaded:
                print(f"✓ Detector initialized: {detector_type}")
            else:
                print(f"⚠ Detector failed to load: {detector_type}")
                # Fall back to mock detector
                self.detector = create_detector('mock')
        except Exception as e:
            print(f"Error initializing detector: {e}")
            # Fall back to mock detector
            self.detector = create_detector('mock')
    
    def mock_detect_objects(self, frame):
        """Detect objects using the configured detector"""
        if self.detector and self.detector.is_loaded:
            return self.detector.detect(frame)
        return []
    
    def get_object_scores(self, translator):
        """Extract object scores from translator"""
        objects_with_scores = []
        
        try:
            obstacles_key = "obstacles" if "obstacles" in translator.bundle else "obstacle_list"
            
            for obj in translator.bundle.get(obstacles_key, []):
                obj_copy = obj.copy()
                
                bbox = obj_copy.get("bbox", None)
                if bbox and len(bbox) == 4:
                    x, y, w, h = bbox
                    obj_copy["bbox_px"] = [int(x), int(y), int(x + w), int(y + h)]
                    obj_copy["centroid_px"] = [int(x + w/2), int(y + h/2)]
                else:
                    if "centroid_px" not in obj_copy:
                        obj_copy["centroid_px"] = [translator.input_width // 2, translator.input_height // 2]
                
                score = translator.score_object(obj_copy)
                obj_copy["score"] = score
                objects_with_scores.append(obj_copy)
            
            objects_with_scores.sort(key=lambda x: x["score"], reverse=True)
            
        except Exception as e:
            print(f"Error getting object scores: {e}")
        
        return objects_with_scores
    
    def update_display(self):
        """Update GUI display with latest processed frames"""
        if not self.is_running:
            return
        
        try:
            # Get latest processed frame
            if not self.display_queue.empty():
                camera_frame, translated_frame, objects, proc_fps = self.display_queue.get_nowait()
                
                # Update FPS counters
                current_time = time.time()
                if current_time - self.last_fps_update >= 1.0:
                    self.fps_camera = self.frame_count / (current_time - self.last_fps_update)
                    self.frame_count = 0
                    self.last_fps_update = current_time
                    
                    # Update FPS display
                    self.fps_label.configure(
                        text=f"Camera FPS: {self.fps_camera:.1f} | Processing: {proc_fps:.1f}"
                    )
                
                # Calculate and display latency
                latency_ms = (1000.0 / proc_fps) if proc_fps > 0 else 0
                self.latency_label.configure(text=f"Latency: {latency_ms:.0f}ms")
                
                # Display camera frame
                camera_rgb = cv2.cvtColor(camera_frame, cv2.COLOR_BGR2RGB)
                camera_img = Image.fromarray(camera_rgb)
                camera_display = self.resize_image_for_display(camera_img, 700, 700)
                self.camera_photo = ImageTk.PhotoImage(camera_display)
                self.camera_label.configure(image=self.camera_photo, text="")
                
                # Display translated frame
                if translated_frame is not None:
                    translated_rgb = cv2.cvtColor(translated_frame, cv2.COLOR_BGR2RGB)
                    translated_img = Image.fromarray(translated_rgb)
                    translated_display = self.resize_image_for_display(translated_img, 700, 700)
                    self.output_photo = ImageTk.PhotoImage(translated_display)
                    self.output_label.configure(image=self.output_photo, text="")
                
                # Update object scores
                self.current_objects = objects
                self.update_scoring_display()
                
                # Record frame if recording is active
                if self.is_recording and self.video_writer:
                    self.video_writer.write(translated_frame)
                    self.recorded_frames += 1
                
        except Exception as e:
            print(f"Display update error: {e}")
        
        # Schedule next update
        self.root.after(30, self.update_display)  # ~30 FPS display update
    
    def resize_image_for_display(self, img, max_width, max_height):
        """Resize image while maintaining aspect ratio"""
        original_width, original_height = img.size
        
        scale_w = max_width / original_width
        scale_h = max_height / original_height
        scale = min(scale_w, scale_h)
        
        new_width = int(original_width * scale)
        new_height = int(original_height * scale)
        
        return img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    def update_scoring_display(self):
        """Update the scoring text display"""
        self.scoring_text.config(state=tk.NORMAL)
        self.scoring_text.delete(1.0, tk.END)
        
        if not self.current_objects:
            self.scoring_text.insert(tk.END, "No objects detected\n\n")
            self.scoring_text.insert(tk.END, "Waiting for detections...")
        else:
            self.scoring_text.insert(tk.END, "Real-Time Objects\n")
            self.scoring_text.insert(tk.END, "=" * 35 + "\n\n")
            
            t_min = self.t_min.get()
            k_min = int(self.k_min.get())
            k_max = int(self.k_max.get())
            
            selected_objs = [o for o in self.current_objects if o["score"] > t_min]
            if len(selected_objs) > k_max:
                selected_objs = selected_objs[:k_max]
            if len(selected_objs) < k_min and len(self.current_objects) >= k_min:
                selected_objs = self.current_objects[:k_min]
            
            selected_ids = {id(obj) for obj in selected_objs}
            
            for i, obj in enumerate(self.current_objects[:10]):  # Show top 10
                class_name = obj.get("class", "unknown")
                score = obj.get("score", 0.0)
                distance = obj.get("distance_m", obj.get("depth", "N/A"))
                
                is_selected = id(obj) in selected_ids
                prefix = "✓ " if is_selected else "  "
                
                self.scoring_text.insert(tk.END, f"{prefix}{i+1}. {class_name}\n")
                self.scoring_text.insert(tk.END, f"   Score: {score:.3f}\n")
                
                if isinstance(distance, (int, float)):
                    self.scoring_text.insert(tk.END, f"   Dist: {distance:.1f}m\n")
                
                self.scoring_text.insert(tk.END, "\n")
            
            if len(self.current_objects) > 10:
                self.scoring_text.insert(tk.END, f"... and {len(self.current_objects) - 10} more\n\n")
            
            self.scoring_text.insert(tk.END, "=" * 35 + "\n")
            self.scoring_text.insert(tk.END, f"Selected: {len(selected_objs)}\n")
        
        self.scoring_text.config(state=tk.DISABLED)
    
    def on_threshold_change(self, value=None):
        """Handle threshold slider changes"""
        self.tmin_label.configure(text=f"{self.t_min.get():.2f}")
        self.kmin_label.configure(text=f"{int(self.k_min.get())}")
        self.kmax_label.configure(text=f"{int(self.k_max.get())}")
    
    def toggle_recording(self):
        """Start/stop recording the translated output"""
        if not self.is_recording:
            # Start recording
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = os.path.join(self.output_dir, f"recording_{timestamp}.mp4")
            
            # Get frame size from current output (or use default)
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            self.video_writer = cv2.VideoWriter(output_file, fourcc, 10.0, (1280, 720))
            
            self.is_recording = True
            self.recorded_frames = 0
            self.record_button.configure(text="⏹ Stop Recording")
            self.recording_label.pack(side=tk.RIGHT, padx=10)
            
            print(f"Started recording to: {output_file}")
        else:
            # Stop recording
            if self.video_writer:
                self.video_writer.release()
                self.video_writer = None
            
            self.is_recording = False
            self.record_button.configure(text="⏺ Record")
            self.recording_label.pack_forget()
            
            messagebox.showinfo("Recording Saved", f"Saved {self.recorded_frames} frames")
            print(f"Stopped recording. Saved {self.recorded_frames} frames")
    
    def take_snapshot(self):
        """Save current frame as snapshot"""
        if not self.is_running:
            return
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        snapshot_file = os.path.join(self.output_dir, f"snapshot_{timestamp}.png")
        
        # Save the current output image
        if hasattr(self, 'output_photo'):
            try:
                # Get the actual output file from the last translation
                import shutil
                last_output = os.path.join(self.output_dir, f"realtime_frame_{self.frame_count-1:06d}.png")
                if os.path.exists(last_output):
                    shutil.copy(last_output, snapshot_file)
                    messagebox.showinfo("Snapshot Saved", f"Saved to:\n{snapshot_file}")
                    print(f"Snapshot saved: {snapshot_file}")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to save snapshot: {e}")


def main():
    """Main function to run the GUI"""
    root = tk.Tk()
    app = RealtimeCameraGUI(root)
    
    # Handle window close
    def on_closing():
        if app.is_running:
            app.stop_camera()
        root.destroy()
    
    root.protocol("WM_DELETE_WINDOW", on_closing)
    root.mainloop()


if __name__ == "__main__":
    main()
