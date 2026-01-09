'''
This is the re-implmenetation of Axon Map in pytorch
'''

from pulse2percept.implants import PRIMA, ProsthesisSystem
from pulse2percept.stimuli import Stimulus
from pulse2percept.models import AxonMapSpatial, Model, ScoarboardSpatial
import torch.nn as nn
import torch 
import pulse2percept as p2p
import numpy as np

 
class TorchAxonMapSpatial(AxonMapSpatial):
    """
    PyTorch reimplementation of _predict_spatial in AxonMapSpatial (same as Cython Implementation), 
    fully differentiable w.r.t stim (encoder output), simulator constants frozen.
    """

    def _predict_spatial(self, earray, stim):
        dtype = torch.float32
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        if not torch.is_tensor(stim):
            raise TypeError("stim must be a torch.Tensor")

        if stim.device is not device or stim.dtype is not dtype:
            stim = stim.to(dtype=dtype, device=device)

        if stim.dim() != 2:
            raise ValueError("stim must have shape (n_el, n_time)") 

        # -------------------------
        # 1) Electrode positions (constants, frozen)
        # -------------------------
        xel_np = np.array([e.x for e in earray.electrode_objects], dtype=np.float32)
        yel_np = np.array([e.y for e in earray.electrode_objects], dtype=np.float32)

        # frozen constants -> requires_grad=False
        xel_t = torch.tensor(xel_np, dtype=dtype, device=device, requires_grad=False)
        yel_t = torch.tensor(yel_np, dtype=dtype, device=device, requires_grad=False)

        # -------------------------
        # 2) Axon segments (constants, frozen)
        # -------------------------
        ax = self.axon_contrib  #pre-calculated from model.build()
        if isinstance(ax, np.ndarray):
            ax_np = ax.astype(np.float32)
        else:
            ax_np = np.asarray(ax, dtype=np.float32)

        if ax_np.ndim == 3 and ax_np.shape[2] == 3:
            padded = ax_np
            mask_np = ~np.isnan(padded[..., 0])
        elif ax_np.ndim == 2 and ax_np.shape[1] == 3 and hasattr(self, "axon_idx_start") and hasattr(self, "axon_idx_end"):
            concat = ax_np
            idx_start = np.asarray(self.axon_idx_start, dtype=np.int64)
            idx_end = np.asarray(self.axon_idx_end, dtype=np.int64)
            n_space = len(idx_start)
            lengths = idx_end - idx_start
            max_len = int(lengths.max())
            padded = np.full((n_space, max_len, 3), np.nan, dtype=np.float32)
            mask_np = np.zeros((n_space, max_len), dtype=bool)
            for i in range(n_space):
                s = idx_start[i]; e = idx_end[i]
                if e > s:
                    block = concat[s:e]
                    L = block.shape[0]
                    padded[i, :L, :] = block
                    mask_np[i, :L] = True
        else:
            raise RuntimeError("Unexpected format for self.axon_contrib")

        segs_t = torch.tensor(padded, dtype=dtype, device=device, requires_grad=False)
        mask_t = torch.tensor(mask_np, dtype=torch.bool, device=device, requires_grad=False)

        seg_x = segs_t[..., 0]
        seg_y = segs_t[..., 1]
        seg_sens = torch.where(mask_t, segs_t[..., 2], torch.zeros_like(segs_t[..., 2]))

        # -------------------------
        # 3) Distance computation (constants) -> requires_grad=False
        # -------------------------
        seg_xy = torch.stack((seg_x, seg_y), dim=-1)  # (n_space, L, 2)
        el_xy = torch.stack((xel_t, yel_t), dim=1)    # (n_el, 2)
        # mask invalid segments BEFORE distance computation
        valid_xy = mask_t.unsqueeze(-1)  # shape (n_space, L, 1)
        
        # Replace invalid coordinates with 0 (their contribution becomes 0 anyway)
        seg_xy_safe = torch.where(valid_xy, seg_xy, torch.zeros_like(seg_xy))
        
        diff = seg_xy_safe.unsqueeze(2) - el_xy.unsqueeze(0).unsqueeze(0)
        r2 = (diff * diff).sum(dim=-1)
        rho_val = float(self.rho.item()) if torch.is_tensor(self.rho) else float(self.rho)
        denom = 2.0 * (rho_val ** 2)
        
        # Compute Gaussian only on valid segments, zero on invalid ones
        gauss = torch.where(valid_xy, torch.exp(-r2 / denom), torch.zeros_like(r2))

        A = gauss * seg_sens.unsqueeze(-1)

        # -------------------------
        # 6) Multiply by stim (encoder output, trainable)
        # -------------------------
        sgm_bright = torch.einsum('sln,nt->slt', A, stim)

        # mask invalid segments
        mask_float = mask_t.to(dtype).unsqueeze(-1)
        sgm_bright = sgm_bright * mask_float

        # -------------------------
        # 7) Pick max per segment
        # -------------------------
        sgm_abs = sgm_bright.abs()
        max_abs, idx = sgm_abs.max(dim=1)
        idx_exp = idx.unsqueeze(1)
        bright = sgm_bright.gather(dim=1, index=idx_exp).squeeze(1)

        # -------------------------
        # 8) Threshold (constants)
        # -------------------------
        thresh_val = float(self.thresh_percept.item()) if torch.is_tensor(self.thresh_percept) else float(self.thresh_percept)
        bright = bright * (bright.abs() >= thresh_val).to(dtype)

        return bright  # shape: (n_space, n_time), gradients flow only to stim


class TorchAxonMapModel(Model):
    '''
    same implementation as AxonMapModel
    '''
    
    """Axon map model of [Beyeler2019]_ (standalone model)

    Implements the axon map model described in [Beyeler2019]_, where percepts
    are elongated along nerve fiber bundle trajectories of the retina.

    .. note: :

        Use this class if you want a standalone model.
        Use: py: class: `~pulse2percept.models.AxonMapSpatial` if you want
        to combine the spatial model with a temporal model.

    Parameters
    ----------
    axlambda : double, optional
        Exponential decay constant along the axon(microns).
    rho : double, optional
        Exponential decay constant away from the axon(microns).
    eye : {'RE', LE'}, optional
        Eye for which to generate the axon map.
    xrange : (x_min, x_max), optional
        A tuple indicating the range of x values to simulate (in degrees of
        visual angle). In a right eye, negative x values correspond to the
        temporal retina, and positive x values to the nasal retina. In a left
        eye, the opposite is true.
    yrange : (y_min, y_max), optional
        A tuple indicating the range of y values to simulate (in degrees of
        visual angle). Negative y values correspond to the superior retina,
        and positive y values to the inferior retina.
    xystep : int or double or tuple, optional
        Step size for the range of (x,y) values to simulate (in degrees of
        visual angle). For example, to create a grid with x values [0, 0.5, 1]
        use ``xrange=(0, 1)`` and ``xystep=0.5``.
    grid_type : {'rectangular', 'hexagonal'}, optional
        Whether to simulate points on a rectangular or hexagonal grid
    vfmap : :py:class:`~pulse2percept.topography.VisualFieldMap`, optional
        An instance of a :py:class:`~pulse2percept.topography.VisualFieldMap`
        object that provides retinotopic mappings.
        By default, :py:class:`~pulse2percept.topography.Watson2014Map` is
        used.
    n_gray : int, optional
        The number of gray levels to use. If an integer is given, k-means
        clustering is used to compress the color space of the percept into
        ``n_gray`` bins. If None, no compression is performed.
    noise : float or int, optional
        Adds salt-and-pepper noise to each percept frame. An integer will be
        interpreted as the number of pixels to subject to noise in each frame.
        A float between 0 and 1 will be interpreted as a ratio of pixels to
        subject to noise in each frame.
    loc_od, loc_od : (x,y), optional
        Location of the optic disc in degrees of visual angle. Note that the
        optic disc in a left eye will be corrected to have a negative x
        coordinate.
    n_axons : int, optional
        Number of axons to generate.
    axons_range : (min, max), optional
        The range of angles(in degrees) at which axons exit the optic disc.
        This corresponds to the range of $\\phi_0$ values used in
        [Jansonius2009]_.
    n_ax_segments : int, optional
        Number of segments an axon is made of.
    ax_segments_range : (min, max), optional
        Lower and upper bounds for the radial position values(polar coords)
        for each axon.
    min_ax_sensitivity : float, optional
        Axon segments whose contribution to brightness is smaller than this
        value will be pruned to improve computational efficiency. Set to a
        value between 0 and 1. If engine is jax, all other axons will be padded
        to the length enforced by this constraint.
    engine : string, optional
        Engine to use for computation. Options are 'serial', 'cython', and 'jax'.
        Defaults to 'cython'
    axon_pickle : str, optional
        File name in which to store precomputed axon maps.
    ignore_pickle : bool, optional
        A flag whether to ignore the pickle file in future calls to
        ``model.build()``.
    n_threads : int, optional
        Number of CPU threads to use during parallelization using OpenMP. 
        Defaults to max number of user CPU cores.

    .. important ::
        If you change important model parameters outside the constructor (e.g.,
        by directly setting ``model.axlambda = 100``), you will have to call
        ``model.build()`` again for your changes to take effect.

    Notes
    -----
    *  The axon map is not very accurate when the upper bound of
       `ax_segments_range` is greater than 90 deg.
    """

    def __init__(self, **params):
        super(TorchAxonMapModel, self).__init__(spatial=TorchAxonMapSpatial(),
                                           temporal=None,
                                           **params)

    def predict_percept(self, implant, t_percept=None):
        # Need to add an additional check before running the base method:
        if isinstance(implant, ProsthesisSystem):
            if implant.eye != self.spatial.eye:
                raise ValueError(f"The implant is in {implant.eye} but the model was "
                                 f"built for {self.spatial.eye}.")
        return super(TorchAxonMapModel, self).predict_percept(implant,
                                                         t_percept=t_percept)


class P2PDifferentiableSimulator(nn.Module):

    def __init__(self, n_electrodes=378, implant_z=300, xrange=(-5, 5), yrange=(-5, 5)):
        super(P2PDifferentiableSimulator, self).__init__()

        self.n_electrodes = n_electrodes

        # Initialize implant (constants)
        self.implant = PRIMA(x=0, y=0, z=implant_z)

        # TorchAxonMapModel with frozen spatial constants
        self.model = TorchAxonMapSpatial(xrange=xrange, yrange=yrange)
        self.model.build()

    def forward(self, amplitudes: torch.Tensor):
        if not torch.is_tensor(amplitudes):
            raise TypeError("amplitudes must be a torch.Tensor")
        
        batch_size, n_el = amplitudes.shape
        if n_el != self.n_electrodes:
            raise ValueError(f"Expected {self.n_electrodes} electrodes, got {n_el}")

        # Container for batch percepts
        percepts_list = []
        H, W = 41, 41  # desired percept shape

        for b in range(batch_size):
            # Convert each sample to (n_el, n_time=1)
            stim = amplitudes[b].unsqueeze(1)  # shape: (n_el, 1)
            percept = self.model._predict_spatial(self.implant.earray, stim) 
            
            # Compute percept via differentiable AxonMap
            percept_2d = percept.reshape(H, W)  # remove time dim and reshape
            percepts_list.append(percept_2d)

        # Stack into tensor (batch_size, n_space, n_time)
        percepts = torch.stack(percepts_list, dim=0).unsqueeze(1)
        # print(percepts.shape)
        percepts_min = percepts.amin(dim=(1, 2, 3), keepdim=True)
        percepts_max = percepts.amax(dim=(1, 2, 3), keepdim=True)
        percepts = (percepts - percepts_min) / (percepts_max - percepts_min + 1e-8)
        return percepts


class TorchScoreboardSpatial(ScoreboardSpatial):
    """
    PyTorch reimplementation of the Scoreboard Model.
    Replaces 'fast_scoreboard' Cython logic with differentiable PyTorch operations.
    """

    def _predict_spatial(self, earray, stim):
        # Standard setup (same as your AxonMap implementation)
        dtype = torch.float32
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        if not torch.is_tensor(stim):
            raise TypeError("stim must be a torch.Tensor")

        if stim.device != device or stim.dtype != dtype:
            stim = stim.to(dtype=dtype, device=device)

        if stim.dim() != 2:
            raise ValueError("stim must have shape (n_el, n_time)") 

        # -------------------------
        # 1) Grid positions (constants, frozen)
        # -------------------------
        # Unlike 'fast_scoreboard' where grid is passed in, 
        # in the class structure we get it from 'self.grid'
        # We flatten them to 1D arrays to match the logic of 'n_space'
        xgrid_np = self.grid.x.ravel()
        ygrid_np = self.grid.y.ravel()

        xgrid = torch.tensor(xgrid_np, dtype=dtype, device=device, requires_grad=False)
        ygrid = torch.tensor(ygrid_np, dtype=dtype, device=device, requires_grad=False)

        # -------------------------
        # 2) Electrode positions (constants, frozen)
        # -------------------------
        # Approx: 280 microns = 1 degree visual angle
        microns_per_degree = 280.0 
        xel_np = np.array([e.x for e in earray.electrode_objects], dtype=np.float32) / microns_per_degree
        yel_np = np.array([e.y for e in earray.electrode_objects], dtype=np.float32) / microns_per_degree

        xel = torch.tensor(xel_np, dtype=dtype, device=device, requires_grad=False)
        yel = torch.tensor(yel_np, dtype=dtype, device=device, requires_grad=False)

        # -------------------------
        # 3) Calculate Gaussian Weights (The Core Logic)
        # -------------------------
        # We use broadcasting to calculate the distance from every pixel to every electrode at once.
        # xgrid shape: (N_space, 1)
        # xel shape:   (1, N_el)
        # Result shape: (N_space, N_el)
        dx = xgrid.unsqueeze(1) - xel.unsqueeze(0)
        dy = ygrid.unsqueeze(1) - yel.unsqueeze(0)
        dist2 = dx**2 + dy**2

        # Get rho (spread parameter)
        rho_val = float(self.rho) / microns_per_degree
        denom = 2.0 * (rho_val ** 2)

        # Create the weight matrix (This replaces the Gaussian calculation in the loop)
        # Shape: (N_space, N_el)
        weights = torch.exp(-dist2 / denom)

        # -------------------------
        # 4) Compute Percept (Matrix Multiplication)
        # -------------------------
        # This replaces the nested loops: "px_bright = px_bright + amp * gauss"
        # weights: (N_space, N_el)
        # stim:    (N_el, N_time)
        # percept: (N_space, N_time)
        percept = torch.matmul(weights, stim)

        # -------------------------
        # 5) Thresholding
        # -------------------------
        thresh_val = float(self.thresh_percept)
        percept = percept * (percept.abs() >= thresh_val).to(dtype)

        return percept


class TorchScoreboardModel(Model):
    """
    Wrapper class to make it compatible with your Simulator setup
    """
    def __init__(self, **params):
        super(TorchScoreboardModel, self).__init__(
            spatial=TorchScoreboardSpatial(),
            temporal=None,
            **params
        )


class P2PDifferentiableSimulatorScoreboard(nn.Module):

    def __init__(self, n_electrodes=378, implant_z=300, xrange=(-3.5, 3.5), yrange=(-3.5, 3.5)):
        super(P2PDifferentiableSimulatorScoreboard, self).__init__()

        self.n_electrodes = n_electrodes

        # Initialize implant (constants)
        self.implant = PRIMA(x=0, y=0, z=implant_z)

        # Initialize the model and build it (this is done in numpy, no need to torch)
        self.model = TorchScoreboardModel(xrange=xrange, yrange=yrange, rho=50)
        self.model.build()

    def forward(self, amplitudes: torch.Tensor):
        if not torch.is_tensor(amplitudes):
            raise TypeError("amplitudes must be a torch.Tensor")
        
        batch_size, n_el = amplitudes.shape
        if n_el != self.n_electrodes:
            raise ValueError(f"Expected {self.n_electrodes} electrodes, got {n_el}")

        # Container for batch percepts
        percepts_list = []
        H, W = 29, 29  # desired percept shape

        for b in range(batch_size):
            # Convert each sample to (n_el, n_time=1)
            stim = amplitudes[b].unsqueeze(1)  # shape: (n_el, 1)
            percept = self.model._predict_spatial(self.implant.earray, stim) 
            
            # Compute percept via differentiable AxonMap
            percept_2d = percept.reshape(H, W)  # remove time dim and reshape
            percepts_list.append(percept_2d)

        # Stack into tensor (batch_size, n_space, n_time)
        percepts = torch.stack(percepts_list, dim=0).unsqueeze(1)
        # print(percepts.shape)
        percepts_min = percepts.amin(dim=(1, 2, 3), keepdim=True)
        percepts_max = percepts.amax(dim=(1, 2, 3), keepdim=True)
        percepts = (percepts - percepts_min) / (percepts_max - percepts_min + 1e-8)
        return percepts