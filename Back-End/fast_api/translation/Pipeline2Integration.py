#Integration of pipeline 2
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
        checkpoint_path = os.path.join(current_dir, 'utils', 'SavedCheckPoints', 'scoreboardencoder.pth')
        
        # checkpoint = torch.load(checkpoint_path, map_location=self.device)
        # encoder_weights = checkpoint['encoder_state_dict']
        self.encoder = E2E_Simple_Encoder(in_channels=1).to(self.device)

        # self.encoder.load_state_dict(encoder_weights)
        checkpoint = torch.load(checkpoint_path, map_location=self.device, weights_only=True)
        self.encoder.load_state_dict(checkpoint)
        self.encoder.eval()  # Set to evaluation mode
        self.simulator = P2PDifferentiableSimulatorScoreboard().to(self.device)

    
    def input2phosphenes(self, input_image):
        """
        input_image: numpy array of variable dimensions
        returns: torch tensor of shape (H, W)
        """
        # convert the input image to ndarray if it is not already
        if not isinstance(input_image, np.ndarray):
            input_image = np.array(input_image)

        # resize input image to (image size = 349, 373)
        input_image = np.resize(input_image, (349, 373))
        
        with torch.no_grad():  # Disable gradient computation for inference
            img_t = torch.from_numpy(input_image).float().to(self.device)  #output (H, W)
            img_t = img_t.unsqueeze(0).unsqueeze(0) #output (1,1,H, W)
            stimulation_amplitudes= self.encoder(img_t) #(B, amplitudes)
            phosphene_image = self.simulator(stimulation_amplitudes) #(1,1,H,W)
            return phosphene_image.detach().cpu().numpy().squeeze(0).squeeze(0)  #(H,W)
