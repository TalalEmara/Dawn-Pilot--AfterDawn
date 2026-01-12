#Integration of pipeline 2
import cv2
from .utils.utils import E2E_Simple_Encoder
from .utils.Differentiable_p2p import P2PDifferentiableSimulator, P2PDifferentiableSimulatorScoreboard
import torch
import numpy as np
import os


class Pipeline2Integration:
    def __init__(self):
        # Use CUDA if available for faster processing
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"Pipeline2 using device: {self.device}")
        
        # Get the directory where this file is located
        current_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Load PHOSPHENE encoder (existing, for full prosthetic vision)
        phosphene_checkpoint_path = os.path.join(current_dir, 'utils', 'SavedCheckPoints', 'scoreboardencoder.pth')
        self.encoder_phosphene = E2E_Simple_Encoder(in_channels=1).to(self.device)
        phosphene_checkpoint = torch.load(phosphene_checkpoint_path, map_location=self.device, weights_only=True)
        self.encoder_phosphene.load_state_dict(phosphene_checkpoint)
        self.encoder_phosphene.eval()  # Set to evaluation mode
        print("✓ Phosphene encoder loaded successfully")
        
        # Load EDGE encoder (new, for low-res edge detection mode)
        edge_checkpoint_path = os.path.join(current_dir, 'utils', 'SavedCheckPoints', 'CNNencoder_model_nonSmart.pth')
        self.encoder_edge = E2E_Simple_Encoder(in_channels=1).to(self.device)
        edge_checkpoint = torch.load(edge_checkpoint_path, map_location=self.device, weights_only=True)
        self.encoder_edge.load_state_dict(edge_checkpoint)
        self.encoder_edge.eval()  # Set to evaluation mode
        print("✓ Edge encoder loaded successfully")
        
        # Shared simulator (used by both encoders)
        self.simulator = P2PDifferentiableSimulatorScoreboard().to(self.device)
        print("✓ Simulator loaded successfully")

    
    def input2phosphenes(self, input_image, use_edge_encoder=False):
        """
        Convert input image to phosphene representation using selected encoder
        
        Args:
            input_image: numpy array (assumes already normalized to [0, 1] as float32)
            use_edge_encoder: True for edge mode (128x128), False for phosphene mode (373x349)
            
        Returns:
            torch tensor of shape (H, W) - phosphene output
        """
        # convert the input image to ndarray if it is not already
        if not isinstance(input_image, np.ndarray):
            input_image = np.array(input_image)

        # Select encoder and target size based on mode
        if use_edge_encoder:
            target_size = (128, 128)  # Edge encoder expects 128x128
            encoder = self.encoder_edge
        else:
            target_size = (373, 349)  # Phosphene encoder expects 373x349
            encoder = self.encoder_phosphene
        
        # Resize input image to encoder's expected size
        cv_resize_image = cv2.resize(input_image, target_size, interpolation=cv2.INTER_NEAREST)
        input_image_resized = cv_resize_image.astype(np.float32)  # Ensure float32
        
        with torch.no_grad():  # Disable gradient computation for inference
            img_t = torch.from_numpy(input_image_resized).float().to(self.device)  # (H, W)
            img_t = img_t.unsqueeze(0).unsqueeze(0)  # (1, 1, H, W)
            stimulation_amplitudes = encoder(img_t)  # (B, amplitudes)
            phosphene_image = self.simulator(stimulation_amplitudes)  # (1, 1, H, W)
            return phosphene_image.detach().cpu().numpy().squeeze(0).squeeze(0)  # (H, W)
