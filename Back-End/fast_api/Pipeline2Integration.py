#Integration of pipeline 2
from utils.utils import E2E_Simple_Encoder
from utils.Differentiable_p2p import P2PDifferentiableSimulator
import torch


class Pipeline2Integration:
    def __init__(self):
        checkpoint = torch.load('utils\SavedCheckPoints\ckpt_epoch_6.pth', map_location=torch.device('cpu'))
        encoder_weights = checkpoint['encoder_state_dict']
        self.encoder = E2E_Simple_Encoder(in_channels=1)
        self.encoder.load_state_dict(encoder_weights)
        self.simulator = P2PDifferentiableSimulator()

    
    def input2phosphenes(self, input_image):
        """
        input_image: numpy array of 128x128
        returns: torch tensor of shape (H, W)
        """
        img_t = torch.from_numpy(input_image).float()  #output (H, W)
        img_t = img_t.unsqueeze(0).unsqueeze(0) #output (1,1,H, W)
        stimulation_amplitudes= self.encoder(img_t) #(B, amplitudes)
        phosphene_image = self.simulator(stimulation_amplitudes) #(1,1,H,W)
        return phosphene_image.detach().cpu().numpy().squeeze(0).squeeze(0)  #(H,W)

