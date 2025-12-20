# ------------------------------------------------------------
#  PLOT IMAGE + PREDICTED MASK PAIRS (SIDE-BY-SIDE)
# ------------------------------------------------------------
import os
from glob import glob
from pathlib import Path
import matplotlib.pyplot as plt
from PIL import Image
import numpy as np
from math import ceil

# ------------------------------------------------------------
#  USER SETTINGS – CHANGE THESE
# ------------------------------------------------------------
IMAGES_DIR      = r"pipeline1\data\sequences\7\Color"        # original images
MASKS_DIR       = r"pipeline1\outputs\footpath_png_masks"                  # predicted masks (from inference)
IMG_EXT         = ".png"
MASK_EXT        = "_pred.png"                                     # e.g., img001_pred.png
OUTPUT_PDF      = r"pipeline1\outputs\footpath_image_pairs\image_mask_pairs.pdf"
OUTPUT_PNG      = r"pipeline1\outputs\footpath_image_pairs\image_mask_pairs.png"
COLS            = 3                                               # images per row
# ------------------------------------------------------------

# Create output directory
os.makedirs(os.path.dirname(OUTPUT_PDF), exist_ok=True)

# Find all images
image_paths = sorted(glob(os.path.join(IMAGES_DIR, f"*{IMG_EXT}")))
if not image_paths:
    raise FileNotFoundError(f"No images found in {IMAGES_DIR}")

print(f"Found {len(image_paths)} images.")

# Match masks: assume mask name = image_stem + MASK_EXT
pairs = []
for img_path in image_paths:
    stem = Path(img_path).stem
    mask_path = os.path.join(MASKS_DIR, f"{stem}{MASK_EXT}")
    if not os.path.exists(mask_path):
        print(f"Warning: Missing mask for {img_path}")
        continue
    pairs.append((img_path, mask_path))

if not pairs:
    raise FileNotFoundError(f"No image-mask pairs found. Check MASK_EXT = '{MASK_EXT}'")

print(f"Found {len(pairs)} valid image-mask pairs.")

# ------------------------------------------------------------
#  Plotting
# ------------------------------------------------------------
n_pairs = len(pairs)
rows = ceil(n_pairs / COLS)
fig, axes = plt.subplots(rows, COLS * 2, figsize=(4 * COLS, 3 * rows))
if rows == 1 and COLS == 1:
    axes = np.array([[axes[0], axes[1]]])
elif rows == 1:
    axes = axes.reshape(1, -1)
elif COLS == 1:
    axes = axes.reshape(-1, 2)

# Flatten axes for easier indexing
axes_flat = axes.reshape(-1)

for idx, (img_path, mask_path) in enumerate(pairs):
    # Load image
    img = Image.open(img_path).convert("RGB")
    img_np = np.array(img)

    # Load mask (grayscale)
    mask = Image.open(mask_path).convert("L")
    mask_np = np.array(mask)

    # Resize mask to match image if needed
    if img_np.shape[:2] != mask_np.shape[:2]:
        mask = mask.resize(img.size, Image.NEAREST)
        mask_np = np.array(mask)

    # Plot image
    ax_img = axes_flat[idx * 2]
    ax_img.imshow(img_np)
    ax_img.set_title(f"Image: {Path(img_path).name}", fontsize=10)
    ax_img.axis("off")

    # Plot mask
    ax_mask = axes_flat[idx * 2 + 1]
    ax_mask.imshow(mask_np, cmap="gray")
    ax_mask.set_title(f"Mask: {Path(mask_path).name}", fontsize=10)
    ax_mask.axis("off")

    if idx == 6:
        break

# Hide unused subplots
for ax in axes_flat[n_pairs * 2:]:
    ax.axis("off")

plt.tight_layout()

# Save
plt.savefig(OUTPUT_PDF, dpi=150, bbox_inches='tight')
plt.savefig(OUTPUT_PNG, dpi=150, bbox_inches='tight')
plt.close()

print(f"Plot saved:")
print(f"   PDF: {OUTPUT_PDF}")
print(f"   PNG: {OUTPUT_PNG}")