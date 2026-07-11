"""
Re-vectorize Paul's signature, EXCLUDING the stray scribble at top-left.

The scribble is in the first ~80-100px of the image (vertically), and is
near the top-left corner. It's morfoLOGICALLY connected to the main
signature body via a few stray pixels (the threshold + morphology merges
them into one blob), so we can't filter by connected components alone.

Strategy:
  1. Read original image
  2. Crop top aggressively (skip first 110 rows) to exclude the scribble
  3. Threshold + morphological cleanup on the remainder
  4. Find connected components; keep only the largest
  5. Tight-crop to that component
  6. Vectorize
"""

import cv2
import numpy as np
from PIL import Image
from pathlib import Path

INPUT  = Path(r"C:\Users\User\.mavis\uploads\1783487569869-image.png")
OUTDIR = Path(r"C:\Users\User\Documents\Click\docs\qlick-cert-system\assets")
OUTDIR.mkdir(parents=True, exist_ok=True)

img = Image.open(INPUT).convert("RGB")
arr = np.array(img)
H, W = arr.shape[:2]
print(f"[1/8] Loaded: {arr.shape}, size={img.size}")

# Step 1: aggressive top crop to drop the scribble region.
# The scribble sits in the first ~110 rows of the image.
TOP_SKIP = 110  # px to crop from top — covers the scribble + buffer
arr_cropped_top = arr[TOP_SKIP:, :, :]
print(f"[2/8] Top-cropped: dropped first {TOP_SKIP} rows. New shape: {arr_cropped_top.shape}")

gray = cv2.cvtColor(arr_cropped_top, cv2.COLOR_RGB2GRAY)

# Threshold
otsu_th, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
threshold = max(otsu_th - 15, 50)
_, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY_INV)
print(f"[3/8] Threshold: otsu={otsu_th:.0f}, applied={threshold}")

# Morphological cleanup
kernel = np.ones((2, 2), np.uint8)
cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel, iterations=1)
print(f"[4/8] Morphological cleanup: {cleaned.sum() // 255} ink pixels")

# Find connected components
num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(cleaned, connectivity=8)
components = []
for i in range(1, num_labels):
    area = stats[i, cv2.CC_STAT_AREA]
    x = stats[i, cv2.CC_STAT_LEFT]
    y = stats[i, cv2.CC_STAT_TOP]
    w = stats[i, cv2.CC_STAT_WIDTH]
    h = stats[i, cv2.CC_STAT_HEIGHT]
    components.append({"label": i, "area": area, "x": x, "y": y, "w": w, "h": h})
components.sort(key=lambda c: c["area"], reverse=True)
print(f"[5/8] {len(components)} components after top-crop")

# Filter: drop tiny noise (<300 px area = water droplets / paper grain).
# Real signature stroke segments are way larger.
MIN_AREA = 300
big_components = [c for c in components if c["area"] >= MIN_AREA]
print(f"      Components with area >= {MIN_AREA}: {len(big_components)}")
for c in big_components[:5]:
    print(f"        label={c['label']} area={c['area']} bbox=({c['x']},{c['y']},{c['w']}x{c['h']})")

# Recompose mask with the big components only
mask = np.zeros_like(cleaned)
for c in big_components:
    mask[labels == c["label"]] = 255

# Tight crop to combined bbox
if len(big_components) > 0:
    xs = [c["x"] for c in big_components]
    ys = [c["y"] for c in big_components]
    xe = [c["x"] + c["w"] for c in big_components]
    ye = [c["y"] + c["h"] for c in big_components]
    x0 = max(min(xs) - 20, 0)
    y0 = max(min(ys) - 20, 0)
    x1 = min(max(xe) + 20, mask.shape[1])
    y1 = min(max(ye) + 20, mask.shape[0])
else:
    raise SystemExit("No big components found — loosen MIN_AREA or threshold")

cropped = mask[y0:y1, x0:x1]
h, w = cropped.shape
print(f"[6/8] Cropped to signature bbox (after top-skip + small-noise filter): {w}x{h}")

# Save transparent PNG
rgba = np.zeros((h, w, 4), dtype=np.uint8)
rgba[..., 3] = cropped
rgba[..., 0:3] = 0
transparent_png = Image.fromarray(rgba, "RGBA")
transparent_png.save(OUTDIR / "paul-signature.png", optimize=True)
print(f"      Saved transparent PNG: {OUTDIR / 'paul-signature.png'}")

# Vectorize
contours, hierarchy = cv2.findContours(cropped, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_TC89_KCOS)
print(f"[7/8] Found {len(contours)} contours")

svg_paths = []
for i, contour in enumerate(contours):
    epsilon = 0.6
    smoothed = cv2.approxPolyDP(contour, epsilon, closed=True)
    if len(smoothed) < 3:
        continue
    pts = smoothed.reshape(-1, 2)
    d = f"M {pts[0,0]},{pts[0,1]} "
    for p in pts[1:]:
        d += f"L {p[0]},{p[1]} "
    d += "Z"
    svg_paths.append(d)

combined_d = " ".join(svg_paths)

svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  <title>Paul Velasquez signature</title>
  <desc>Vectorized ink signature. Cleaned of paper background, water droplets, and stray scribble at top.</desc>
  <path d="{combined_d}" fill="#0F172A" fill-rule="evenodd" stroke="none"/>
</svg>
'''
(OUTDIR / "paul-signature.svg").write_text(svg, encoding="utf-8")
size_kb = (OUTDIR / "paul-signature.svg").stat().st_size / 1024
print(f"[8/8] Saved vector SVG: {OUTDIR / 'paul-signature.svg'} ({size_kb:.1f} KB)")

print(f"\n=== Signature summary ===")
print(f"  Original:    {W}x{H} px")
print(f"  Top-cropped: {W}x{H - TOP_SKIP} px (skipped {TOP_SKIP} top rows)")
print(f"  Final:       {w}x{h} px (signature only)")
print(f"  Contours:    {len(contours)}")
print(f"  Aspect:      {w/h:.2f}:1 (width:height)")
