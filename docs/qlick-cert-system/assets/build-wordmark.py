"""
Build Qlick wordmark assets — CLEAN version (no yellow dot overlay).

Reads the path from assets/qlick-q-icon.svg and inlines it into:
  - qlick-wordmark-compact.svg  (Q icon monogram + "lick" text)
  - qlick-wordmark.svg         (Q icon monogram + "lick" text)

Both assets render "Qlick" with the font's NATURAL tittle — no overlay.
The wordmark reads as "Q + lick" where the `i` looks like a normal letter.
"""

from pathlib import Path

OUTDIR = Path(r"C:\Users\User\Documents\Click\docs\qlick-cert-system\assets")
BRAND_PURPLE = "#A855F7"
BRAND_PURPLE_DARK = "#7E22CE"
BRAND_SPARK = "#FBBF24"

# Read the q icon SVG (already-clean original), keep just the <path>
qicon_svg = (OUTDIR / "qlick-q-icon.svg").read_text(encoding="utf-8")
# Extract the path d= attribute
import re
path_match = re.search(r'<path d="([^"]+)"/>', qicon_svg)
path_d = path_match.group(1) if path_match else ""
print(f"[setup] Extracted Q icon path: {len(path_d)} chars")

# ====================================================================
# 1. COMPACT wordmark — Q icon (as inline SVG) + "lick" text
# ====================================================================
# Same geometry as before: Q icon at x=0 width=38 height=55 y=-2,
# text "lick" at x=44 y=48, font-size 32, brand purple gradient fill.
wordmark_compact_svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 60" width="130" height="60">
  <title>Qlick wordmark compact</title>
  <desc>Q icon monogram + "lick" text. Clean wordmark — font's natural tittle of "i" renders as part of the word.</desc>

  <defs>
    <linearGradient id="qg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{BRAND_PURPLE}"/>
      <stop offset="100%" stop-color="{BRAND_PURPLE_DARK}"/>
    </linearGradient>
  </defs>

  <!-- Q monogram -->
  <svg x="0" y="-2" width="38" height="55" viewBox="0 0 519 743" fill="#A855F7" fill-rule="evenodd">
    <path d="{path_d}"/>
  </svg>

  <!-- "lick" text — natural tittle stays as part of the word -->
  <text x="44" y="48" font-family="'Plus Jakarta Sans', 'Inter', sans-serif" font-size="32" font-weight="800" fill="url(#qg)" letter-spacing="-1">lick</text>
</svg>
'''
(OUTDIR / "qlick-wordmark-compact.svg").write_text(wordmark_compact_svg, encoding="utf-8")
print(f"[1/2] Built compact wordmark SVG (clean, no overlay) — {(OUTDIR / 'qlick-wordmark-compact.svg').stat().st_size / 1024:.1f} KB")

# ====================================================================
# 2. LARGE wordmark — Q icon (full size) + "lick" text
# ====================================================================
wordmark_large_svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 130" width="380" height="130" font-family="'Plus Jakarta Sans', 'Inter', sans-serif">
  <title>Qlick wordmark</title>
  <desc>Q icon (full size, with antenna) + "lick" text. Clean — no yellow-dot overlay.</desc>

  <!-- Q monogram, full size -->
  <svg x="0" y="-12" width="97.79" height="140" viewBox="0 0 519 743" fill="#A855F7" fill-rule="evenodd">
    <path d="{path_d}"/>
  </svg>

  <text x="108" y="92" font-size="92" font-weight="800" fill="#A855F7" letter-spacing="-3">l</text>
  <text x="135" y="92" font-size="92" font-weight="800" fill="#A855F7" letter-spacing="-3">i</text>
  <text x="178" y="92" font-size="92" font-weight="800" fill="#A855F7" letter-spacing="-3">c</text>
  <text x="232" y="92" font-size="92" font-weight="800" fill="#A855F7" letter-spacing="-3">k</text>
</svg>
'''
(OUTDIR / "qlick-wordmark.svg").write_text(wordmark_large_svg, encoding="utf-8")
print(f"[2/2] Built large wordmark SVG (clean, no overlay) — {(OUTDIR / 'qlick-wordmark.svg').stat().st_size / 1024:.1f} KB")
