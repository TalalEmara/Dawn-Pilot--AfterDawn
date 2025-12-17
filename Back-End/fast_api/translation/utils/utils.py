import torch.nn as nn

def convlayer(n_input, n_output, k_size=3, stride=1, padding=1, resample_out=None):
    layer = [
        nn.Conv2d(n_input, n_output, kernel_size=k_size, stride=stride, padding=padding, bias=False),
        nn.BatchNorm2d(n_output),
        nn.LeakyReLU(inplace=True),
        resample_out]
    if resample_out is None:
        layer.pop()
    return layer

class ResidualBlock(nn.Module):
    def __init__(self, n_channels, stride=1, resample_out=None):
        super(ResidualBlock, self).__init__()
        self.conv1 = nn.Conv2d(n_channels, n_channels,kernel_size=3, stride=1,padding=1)
        self.bn1 = nn.BatchNorm2d(n_channels)
        self.relu = nn.LeakyReLU(inplace=True)
        self.conv2 = nn.Conv2d(n_channels, n_channels,kernel_size=3, stride=1,padding=1)
        self.bn2 = nn.BatchNorm2d(n_channels)
        self.resample_out = resample_out

    def forward(self, x):
        residual = x
        out = self.conv1(x)
        out = self.bn1(out)
        out = self.relu(out)
        out = self.conv2(out)
        out = self.bn2(out)
        out += residual
        out = self.relu(out)
        if self.resample_out:
            out = self.resample_out(out)
        return out
    
class E2E_Encoder(nn.Module):
    """
    Simple non-generic encoder class that receives 128x128 input and outputs 32x32 feature map as stimulation protocol
    """
    def __init__(self, in_channels=3, out_channels=1, n_electrodes=378, out_scaling=200, out_activation='sigmoid'):
        super(E2E_Encoder, self).__init__()
        self.output_scaling = out_scaling
        self.out_activation = {'tanh': nn.Tanh(), ## NOTE: simulator expects only positive stimulation values 
                               'sigmoid': nn.Sigmoid(),
                               'relu': nn.ReLU(),
                               'softmax':nn.Softmax(dim=1)}[out_activation]

        # Model
        self.model = nn.Sequential(*convlayer(in_channels,8,3,1,1),
                                   *convlayer(8,16,3,1,1,resample_out=nn.MaxPool2d(2)),
                                   *convlayer(16,32,3,1,1,resample_out=nn.MaxPool2d(2)),
                                   ResidualBlock(32, resample_out=None),
                                   ResidualBlock(32, resample_out=None),
                                   ResidualBlock(32, resample_out=None),
                                   ResidualBlock(32, resample_out=None),
                                   *convlayer(32,16,3,1,1),
                                   nn.Conv2d(16,1,3,1,1),
                                   nn.Flatten(),
                                   nn.Linear(864,n_electrodes),
                                   self.out_activation)

    def forward(self, x):
        self.out = self.model(x)
        print(f"Encoder output shape: {self.out.shape}")
        stimulation = self.out*self.output_scaling #scaling improves numerical stability
        return stimulation



class E2E_Simple_Encoder(nn.Module):
    def __init__(self, in_channels=1, n_electrodes=378, output_scaling=1, out_activation='sigmoid'):
        super(E2E_Simple_Encoder, self).__init__()

        self.out_activation = {
            'tanh': nn.Tanh(),
            'sigmoid': nn.Sigmoid(),
            'relu': nn.ReLU(),
            'softmax': nn.Softmax(dim=1)
        }[out_activation]

        self.output_scaling= output_scaling

        
        self.model = nn.Sequential(*convlayer(in_channels,8,3,1,1), 
                                   *convlayer(8,16,3,1,1), 
                                   *convlayer(16,32,3,1,1), 
                                   ResidualBlock(32, resample_out=None), 
                                   ResidualBlock(32, resample_out=None), 
                                   nn.MaxPool2d(2), 
                                   *convlayer(32,16,3,1,1), 
                                   nn.MaxPool2d(2), 
                                   nn.Conv2d(16,1,3,1,1), 
                                   nn.Flatten(), 
                                   nn.LazyLinear(n_electrodes), 
                                   self.out_activation)

    def forward(self, x):
        self.out = self.model(x)
        stimulation = self.out * self.output_scaling
        return stimulation
