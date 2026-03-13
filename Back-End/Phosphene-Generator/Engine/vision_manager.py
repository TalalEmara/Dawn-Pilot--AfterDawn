import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Tuple
import numpy as np
import torch

from .object_detector import ObjectDetector
from .freepath_detector import FreepathDetector

class VisionManager:
    """
    Manager for Layer 3 (The AI Engine).
    
    Responsibilities:
    1. Upload the RGB frame to the GPU EXACTLY ONCE.
    2. Route the shared GPU tensor to both models.
    3. Execute models in parallel to prevent CPU blocking.
    """

    def __init__(self, yolo_path: str, deeplab_path: str, class_map_path: str = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"VisionManager initialized on device: {self.device}")
        self.object_detector = ObjectDetector(
            model_path=yolo_path, 
            class_map_path=class_map_path, 
            device=self.device
        )
        self.freepath_detector = FreepathDetector(
            model_path=deeplab_path, 
            device=self.device
        )


        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="vision_ai")

    def _prepare_shared_tensor(self, rgb_numpy: np.ndarray) -> np.ndarray:
        """
        No longer converts to a torch tensor manually here because YOLO handles resizing 
        and padding better using raw numpy arrays. Freepath detector natively adapts it.
        """
        return rgb_numpy

    def _run_parallel_inference(self, shared_gpu_tensor: np.ndarray) -> Tuple[List[Dict], List[List[int]]]:
        """Runs the forward passes at the exact same time in the thread pool."""
       
        future_yolo = self.executor.submit(
            self.object_detector.detect, shared_gpu_tensor
        )
        
        # freepath detector expects a torch tensor, YOLO expects raw numpy or properly aligned tensor.
        future_freepath = self.executor.submit(
            self.freepath_detector.detect, torch.from_numpy(shared_gpu_tensor)
        )
        
        detections = future_yolo.result()
        centerline = future_freepath.result()
        
        return detections, centerline

    async def process_frame(self, rgb_numpy: np.ndarray) -> Tuple[List[Dict], List[List[int]]]:
        """
        Main entry point for the FastAPI event loop.
        """
       
        shared_gpu_tensor = self._prepare_shared_tensor(rgb_numpy)
    
        detections, centerline = await asyncio.to_thread(
            self._run_parallel_inference, 
            shared_gpu_tensor
        )
        
        return detections, centerline