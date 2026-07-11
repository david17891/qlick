"""
Vectorize the Qlick Q logo (purple Q with antenna).
Uses the same contour-based approach but tuned for clean shapes.
"""

import cv2
import numpy as np
from PIL import Image
from pathlib import Path

INPUT  = Path(r"C:\Users\User\Downloads\2d04c881-745d-4095-af13-02237718f4cf.png")
OUTDIR = Path(r"C:\Users\User\Documents\Click\docs\qlick-cert-system\assets")

img = Image.open(INPUT).convert("RGBA")
arr = np.array(img)
print(f"[1/5] Loaded: {arr.shape}")

# The logo is purple on white background. Detect purple pixels (any non-white, non-transparent).
# Alpha channel
alpha = arr[..., 3]
# RGB
rgb = arr[..., :3]

# Build a mask of "ink" pixels: opaque AND not white
is_white = np.all(rgb > 240, axis=-1)
ink_mask = (alpha > 128) & (~is_white)
print(f"[2/5] Ink pixels: {ink_mask.sum()} / {ink_mask.size}")

# Clean up small noise
kernel = np.ones((2, 2), np.uint8)
ink_u8 = (ink_mask.astype(np.uint8)) * 255
cleaned = cv2.morphologyEx(ink_u8, cv2.MORPH_OPEN, kernel, iterations=1)
cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel, iterations=1)

# Find external + internal contours (with hierarchy for the eye/slot)
contours, hierarchy = cv2.findContours(cleaned, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_TC89_KCOS)
print(f"[3/5] Contours found: {len(contours)}")

# Save the cleaned mask as transparent PNG for verification
rgba_out = np.zeros_like(arr)
rgba_out[..., 3] = cleaned
# Preserve the original purple color from the source
purple_mask = cleaned > 0
if purple_mask.any():
    # Sample median color of the purple pixels from original
    purple_pixels = arr[..., :3][(arr[..., 3] > 128) & (~is_white)]
    if len(purple_pixels) > 0:
        median_color = np.median(purple_pixels, axis=0).astype(np.uint8)
        print(f"      Median purple color: RGB{tuple(median_color)}")
        rgba_out[purple_mask, 0] = median_color[0]
        rgba_out[purple_mask, 1] = median_color[1]
        rgba_out[purple_mask, 2] = median_color[2]
    else:
        rgba_out[purple_mask, 0:3] = [168, 85, 247]  # fallback #A855F7
else:
    rgba_out[purple_mask, 0:3] = [168, 85, 247]

Image.fromarray(rgba_out, "RGBA").save(OUTDIR / "qlick-q-icon.png", optimize=True)
print(f"      Saved transparent PNG: {OUTDIR / 'qlick-q-icon.png'}")

# Crop to bounding box
ys, xs = np.where(cleaned > 0)
pad = 8
x0, y0 = max(xs.min() - pad, 0), max(ys.min() - pad, 0)
x1, y1 = min(xs.max() + pad, arr.shape[1]), min(ys.max() + pad, arr.shape[0])
cropped = cleaned[y0:y1, x0:x1]
h, w = cropped.shape
print(f"[4/5] Cropped to bbox: {w}x{h}")

# Re-detect contours on the cropped image (coords are now local to the cropped view)
contours, hierarchy = cv2.findContours(cropped, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_TC89_KCOS)

# Build SVG paths. Each contour becomes a path; use fill-rule="evenodd" so inner holes (the Q eye) show through.
svg_paths = []
total_nodes = 0
for contour in contours:
    epsilon = 0.5  # px — tighter for the logo
    smoothed = cv2.approxPolyDP(contour, epsilon, closed=True)
    if len(smoothed) < 3:
        continue
    pts = smoothed.reshape(-1, 2)
    d = f"M{pts[0,0]} {pts[0,1]}"
    for p in pts[1:]:
        d += f"L{p[0]} {p[1]}"
    d += "Z"
    svg_paths.append(d)
    total_nodes += len(pts)

combined_d = " ".join(svg_paths)
svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" fill="#A855F7" fill-rule="evenodd">
  <title>Qlick Q logo</title>
  <desc>Vectorized Q icon with antenna. Cleaned of white background.</desc>
  <path d="{combined_d}"/>
</svg>
'''
(OUTDIR / "qlick-q-icon.svg").write_text(svg, encoding="utf-8")
size_kb = (OUTDIR / "qlick-q-icon.svg").stat().st_size / 1024
print(f"[5/5] Saved SVG: {OUTDIR / 'qlick-q-icon.svg'} ({size_kb:.1f} KB, {total_nodes} nodes)")

# Print summary
print(f"\n=== Q logo summary ===")
print(f"  Source:      {arr.shape[1]}x{arr.shape[0]} px (with transparent BG)")
print(f"  Cropped:     {w}x{h} px")
print(f"  Contours:    {len(contours)}")
print(f"  Path nodes:  {total_nodes}")