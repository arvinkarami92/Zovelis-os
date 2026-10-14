#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate every Zovelis OS brand asset from code.

The outputs are committed to the repository, so building the ISO never needs
this script. Re-run it only when the artwork changes:

    python3 branding/generate.py --svgrender /path/to/svgrender

Requirements (developer machine only): Python 3, Pillow, NumPy, SciPy,
fontTools, the Inter font (fonts-inter) and the `svgrender` helper from
branding/tools (built against Qt 6 with Qt SVG, the same renderer Plasma uses).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
SRC = ROOT / "src"
ARTWORK = REPO / "packages" / "zovelis-artwork"
OUT_SHARE = ARTWORK / "usr" / "share"

# ---------------------------------------------------------------------------
# Brand palette (see docs/BRANDING.md). Contrast ratios are checked in tests.
# ---------------------------------------------------------------------------
TEAL_300 = (0x5F, 0xD8, 0xDB)
TEAL_400 = (0x1E, 0xC8, 0xC8)
TEAL_600 = (0x0E, 0x8F, 0xA6)
TEAL_700 = (0x0D, 0x7C, 0x86)
BLUE_800 = (0x0B, 0x4F, 0x86)
NAVY_900 = (0x0B, 0x1B, 0x2B)
NAVY_950 = (0x07, 0x17, 0x26)
INK = "#0B1B2B"

WALLPAPER_SIZES = [(1920, 1080), (1920, 1200), (2560, 1440), (2560, 1600), (3840, 2160)]

INTER_CANDIDATES = [
    "/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf",
    "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf",
    "/usr/share/fonts/truetype/inter/Inter-SemiBold.ttf",
]


def log(msg: str) -> None:
    print(f"[generate] {msg}", flush=True)


# ---------------------------------------------------------------------------
# SVG helpers
# ---------------------------------------------------------------------------
class SvgRenderer:
    def __init__(self, binary: str):
        self.binary = binary
        env = dict(os.environ)
        env.setdefault("QT_QPA_PLATFORM", "offscreen")
        env.setdefault("LC_ALL", "C.UTF-8")
        self.env = env

    def render(self, svg: Path, png: Path, width: int, height: int | None = None) -> None:
        png.parent.mkdir(parents=True, exist_ok=True)
        cmd = [self.binary, str(svg), str(png), str(width)]
        if height:
            cmd.append(str(height))
        subprocess.run(cmd, check=True, env=self.env, stderr=subprocess.DEVNULL)


def wordmark_path(text: str, font_path: str, size: float, tracking: float = -0.012):
    """Return (svg path data, width, height, baseline) for `text` set in Inter."""
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.ttLib import TTFont

    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    scale = size / upm
    ascender = font["hhea"].ascent
    cap_height = getattr(font["OS/2"], "sCapHeight", 0) or int(upm * 0.727)
    hmtx = font["hmtx"]
    kern_pairs = _gpos_pair_kerning(font)

    pen = SVGPathPen(glyph_set)
    x = 0.0
    prev = None
    for ch in text:
        gname = cmap[ord(ch)]
        if prev is not None:
            x += kern_pairs.get((prev, gname), 0)
        # Flip y (font units go up, SVG goes down) and place on the baseline.
        tpen = TransformPen(pen, (scale, 0, 0, -scale, x * scale, ascender * scale))
        glyph_set[gname].draw(tpen)
        x += hmtx[gname][0] + tracking * upm
        prev = gname
    width = x * scale - tracking * upm * scale
    height = ascender * scale + abs(font["hhea"].descent) * scale
    return pen.getCommands(), width, height, ascender * scale, cap_height * scale


def _gpos_pair_kerning(font) -> dict:
    """Extract simple pair kerning (format 1 pairs) from GPOS, best effort."""
    pairs: dict = {}
    if "GPOS" not in font:
        return pairs
    gpos = font["GPOS"].table
    for lookup in gpos.LookupList.Lookup:
        for sub in lookup.SubTable:
            st = sub.ExtSubTable if lookup.LookupType == 9 else sub
            if getattr(st, "LookupType", lookup.LookupType) != 2 or st.Format != 1:
                continue
            coverage = st.Coverage.glyphs
            for i, first in enumerate(coverage):
                for rec in st.PairSet[i].PairValueRecord:
                    v = getattr(rec.Value1, "XAdvance", 0) if rec.Value1 else 0
                    if v:
                        pairs[(first, rec.SecondGlyph)] = v
    return pairs


def find_inter() -> str:
    for candidate in INTER_CANDIDATES:
        if os.path.exists(candidate):
            return candidate
    sys.exit("Inter font not found (install fonts-inter)")


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def make_wordmarks(font: str) -> dict:
    d, w, h, baseline, cap = wordmark_path("Zovelis", font, 100)
    pad = 2
    vb_w = math.ceil(w + 2 * pad)
    vb_h = math.ceil(h)
    out = {}
    for name, color in (("zovelis-wordmark", INK), ("zovelis-wordmark-light", "#FFFFFF")):
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{vb_w}" height="{vb_h}" '
            f'viewBox="0 0 {vb_w} {vb_h}">\n'
            f'  <path fill="{color}" transform="translate({pad} 0)" d="{d}"/>\n</svg>\n'
        )
        path = SRC / f"{name}.svg"
        write(path, svg)
        out[name] = path
    # Horizontal lockup: mark + wordmark, wordmark cap height = 46% of mark.
    mark_svg = (SRC / "zovelis-mark.svg").read_text()
    mark_inner = mark_svg.split(">", 1)[1].rsplit("</svg>", 1)[0]
    mark_size = 256
    wm_scale = (mark_size * 0.46) / cap
    gap = mark_size * 0.16
    wm_w = w * wm_scale
    total_w = math.ceil(mark_size + gap + wm_w + 8)
    # Vertically centre the cap height on the mark.
    wm_y = mark_size / 2 - (baseline - cap / 2) * wm_scale
    for name, color in (("zovelis-logo-horizontal", INK), ("zovelis-logo-horizontal-light", "#FFFFFF")):
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="{mark_size}" '
            f'viewBox="0 0 {total_w} {mark_size}">\n'
            f'  <g>{mark_inner}</g>\n'
            f'  <path fill="{color}" transform="translate({mark_size + gap:.2f} {wm_y:.2f}) '
            f'scale({wm_scale:.5f})" d="{d}"/>\n</svg>\n'
        )
        path = SRC / f"{name}.svg"
        write(path, svg)
        out[name] = path
    # Vertical lockup (mark above wordmark) for splash screens.
    v_wm_scale = (mark_size * 0.26) / cap
    v_w = max(mark_size, math.ceil(w * v_wm_scale)) + 48
    v_gap = mark_size * 0.18
    v_h = math.ceil(mark_size + v_gap + h * v_wm_scale)
    mark_x = (v_w - mark_size) / 2
    wm_x = (v_w - w * v_wm_scale) / 2
    for name, color in (("zovelis-logo-vertical", INK), ("zovelis-logo-vertical-light", "#FFFFFF")):
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{v_w}" height="{v_h}" '
            f'viewBox="0 0 {v_w} {v_h}">\n'
            f'  <g transform="translate({mark_x:.2f} 0)">{mark_inner}</g>\n'
            f'  <path fill="{color}" transform="translate({wm_x:.2f} {mark_size + v_gap:.2f}) '
            f'scale({v_wm_scale:.5f})" d="{d}"/>\n</svg>\n'
        )
        path = SRC / f"{name}.svg"
        write(path, svg)
        out[name] = path
    return out


# ---------------------------------------------------------------------------
# Wallpapers
# ---------------------------------------------------------------------------
def _lerp(a, b, t):
    return a + (b - a) * t


def _vertical_gradient(h, w, top, bottom):
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    top = np.array(top, dtype=np.float32)[None, None, :]
    bottom = np.array(bottom, dtype=np.float32)[None, None, :]
    return np.broadcast_to(_lerp(top, bottom, t), (h, w, 3)).copy()


def _radial(h, w, cx, cy, radius):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - cx * w) / (radius * w)) ** 2 + ((yy - cy * h) / (radius * w)) ** 2)
    return np.clip(1.0 - d, 0.0, 1.0) ** 2


def _ribbon_masks(h, w, specs, blur):
    """Soft-edged bands between two wavy curves. Returns list of (mask, edge)."""
    xx = np.linspace(0.0, 1.0, w, dtype=np.float32)
    yy = np.arange(h, dtype=np.float32)[:, None]
    results = []
    for spec in specs:
        def curve(offset, s=spec):
            # A diagonal sweep plus a couple of slow waves.
            y = s["y"] + offset + s.get("slope", 0.0) * (xx - 0.5)
            for amp, freq, phase in s["waves"]:
                y = y + amp * np.sin(2 * math.pi * (freq * xx + phase))
            return (y * h)[None, :]
        top = curve(0.0)
        bottom = curve(spec["thickness"])
        band = ((yy >= top) & (yy <= bottom)).astype(np.float32)
        mask = gaussian_filter(band, sigma=blur * spec.get("softness", 1.0))
        # A crisp crest line plus a wider glow just along the upper edge give a
        # "glass ribbon" look.
        dist2 = (yy - top) ** 2
        crest = np.exp(-dist2 / (2 * (0.0022 * h) ** 2))
        glow = 0.35 * np.exp(-dist2 / (2 * (0.012 * h) ** 2))
        edge = (crest + glow).astype(np.float32)
        edge *= 0.25 + 0.75 * np.clip(np.sin(math.pi * xx[None, :]), 0.0, 1.0) ** 0.6
        results.append((mask, edge))
    return results


RIBBONS = [
    {"y": 0.50, "slope": -0.16, "thickness": 0.14,
     "waves": [(0.075, 0.62, 0.05), (0.020, 1.6, 0.40)], "softness": 0.9},
    {"y": 0.60, "slope": -0.10, "thickness": 0.20,
     "waves": [(0.065, 0.48, 0.30), (0.022, 1.25, 0.10)], "softness": 1.2},
    {"y": 0.71, "slope": -0.05, "thickness": 0.45,
     "waves": [(0.050, 0.40, 0.58), (0.016, 1.10, 0.70)], "softness": 1.6},
]


def render_wallpaper(variant: str, w: int, h: int) -> Image.Image:
    rng = np.random.default_rng(20261013)
    if variant == "light":
        img = _vertical_gradient(h, w, (247, 251, 252), (218, 238, 243))
        glow = _radial(h, w, 0.20, 0.10, 0.80)[..., None]
        img = _lerp(img, np.array([255, 255, 255], np.float32), glow * 0.9)
        colors = [((40, 205, 205), 0.46), ((16, 160, 180), 0.50), ((10, 112, 152), 0.58)]
        edge_color, edge_alpha = np.array([255, 255, 255], np.float32), 0.75
    else:
        img = _vertical_gradient(h, w, (5, 16, 28), (9, 30, 48))
        glow = _radial(h, w, 0.80, 0.85, 0.90)[..., None]
        img = _lerp(img, np.array([14, 143, 166], np.float32), glow * 0.30)
        colors = [((30, 200, 200), 0.28), ((14, 143, 166), 0.36), ((11, 79, 134), 0.50)]
        edge_color, edge_alpha = np.array([150, 245, 245], np.float32), 0.65

    blur = h * 0.012
    for (mask, edge), (color, alpha) in zip(_ribbon_masks(h, w, RIBBONS, blur), colors):
        # Horizontal colour drift inside each ribbon.
        drift = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :, None]
        c0 = np.array(color, np.float32)[None, None, :]
        c1 = np.array((13, 95, 150) if variant == "light" else TEAL_400, np.float32)[None, None, :]
        ribbon_color = _lerp(c0, c1, drift * 0.55)
        a = (mask * alpha)[..., None]
        img = _lerp(img, ribbon_color, a)
        e = (edge * mask * edge_alpha)[..., None]
        img = _lerp(img, edge_color[None, None, :], e)

    # Gentle vignette and dithering noise to avoid banding in 8-bit output.
    vignette = _radial(h, w, 0.5, 0.45, 1.25)[..., None]
    shade = 0.96 if variant == "light" else 0.82
    img = img * (shade + (1 - shade) * vignette)
    img += rng.normal(0.0, 0.9, size=img.shape).astype(np.float32)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


def make_wallpapers() -> None:
    base = OUT_SHARE / "wallpapers" / "Zovelis"
    for variant, folder in (("light", "images"), ("dark", "images_dark")):
        # Render the largest of each aspect ratio once, then downscale.
        masters = {
            16 / 9: render_wallpaper(variant, 3840, 2160),
            16 / 10: render_wallpaper(variant, 2560, 1600),
        }
        for w, h in WALLPAPER_SIZES:
            master = masters[min(masters, key=lambda r: abs(r - w / h))]
            img = master if master.size == (w, h) else master.resize((w, h), Image.LANCZOS)
            target = base / "contents" / folder / f"{w}x{h}.jpg"
            target.parent.mkdir(parents=True, exist_ok=True)
            img.save(target, "JPEG", quality=92, subsampling=0, optimize=True, progressive=True)
            log(f"wallpaper {variant} {w}x{h}")
        if variant == "light":
            masters[16 / 9].resize((440, 247), Image.LANCZOS).save(
                base / "contents" / "screenshot.jpg", "JPEG", quality=90)
    metadata = {
        "KPlugin": {
            "Authors": [{"Name": "Zovelis OS Developers"}],
            "Id": "Zovelis",
            "License": "CC-BY-SA-4.0",
            "Name": "Zovelis",
        }
    }
    write(base / "metadata.json", json.dumps(metadata, indent=4) + "\n")


# ---------------------------------------------------------------------------
# Raster logos, icons, Plymouth, GRUB, ISOLINUX, SDDM
# ---------------------------------------------------------------------------
def make_icons(r: SvgRenderer, svgs: dict) -> None:
    icons = OUT_SHARE / "icons" / "hicolor"
    mark = SRC / "zovelis-mark.svg"
    # Scalable icons are the source of truth; PNGs help apps that need rasters.
    for name in ("zovelis", "start-here-zovelis", "zovelis-welcome", "zovelis-installer"):
        dst = icons / "scalable" / "apps" / f"{name}.svg"
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(mark if name != "zovelis-installer" else SRC / "zovelis-installer.svg", dst)
    for size in (16, 22, 24, 32, 48, 64, 128, 256, 512):
        for name in ("zovelis", "start-here-zovelis", "zovelis-welcome"):
            r.render(mark, icons / f"{size}x{size}" / "apps" / f"{name}.png", size)
        r.render(SRC / "zovelis-installer.svg", icons / f"{size}x{size}" / "apps" / "zovelis-installer.png", size)
    # Logos for other components (kinfocenter, Calamares, SDDM, docs).
    logos = OUT_SHARE / "zovelis" / "logos"
    logos.mkdir(parents=True, exist_ok=True)
    for name, path in svgs.items():
        shutil.copyfile(path, logos / f"{name}.svg")
    shutil.copyfile(mark, logos / "zovelis-mark.svg")
    r.render(mark, logos / "zovelis-mark-256.png", 256)
    r.render(svgs["zovelis-logo-horizontal"], logos / "zovelis-logo-horizontal-512.png", 512)
    r.render(svgs["zovelis-logo-horizontal-light"], logos / "zovelis-logo-horizontal-light-512.png", 512)
    # Square pixmap used by tools that want /usr/share/pixmaps (e.g. os-release LOGO fallbacks).
    r.render(mark, OUT_SHARE / "pixmaps" / "zovelis.png", 128)


def make_plymouth(r: SvgRenderer, svgs: dict) -> None:
    theme = OUT_SHARE / "plymouth" / "themes" / "zovelis"
    theme.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    try:
        r.render(svgs["zovelis-logo-vertical-light"], tmp / "wm.png", 200)
        Image.open(tmp / "wm.png").save(theme / "watermark.png", optimize=True)
    finally:
        shutil.rmtree(tmp)
    # Spinner: 36 frames of a rotating arc with a fading tail.
    size, ss = 40, 4
    frames = 36
    for i in range(frames):
        big = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
        d = ImageDraw.Draw(big)
        inset = 5 * ss
        box = (inset, inset, size * ss - inset, size * ss - inset)
        d.ellipse(box, outline=(255, 255, 255, 40), width=3 * ss)
        start = i * (360 / frames)
        segments = 24
        for s in range(segments):
            a0 = start + s * (100 / segments)
            alpha = int(255 * ((s + 1) / segments) ** 1.5)
            d.arc(box, a0, a0 + 100 / segments + 1, fill=(*TEAL_300, alpha), width=3 * ss)
        big.resize((size, size), Image.LANCZOS).save(theme / f"throbber-{i + 1:04d}.png", optimize=True)
    # Password prompt pieces.
    entry = Image.new("RGBA", (300 * ss, 40 * ss), (0, 0, 0, 0))
    ImageDraw.Draw(entry).rounded_rectangle(
        (ss, ss, 300 * ss - ss, 40 * ss - ss), radius=8 * ss,
        fill=(255, 255, 255, 235), outline=(*TEAL_300, 255), width=2 * ss)
    entry.resize((300, 40), Image.LANCZOS).save(theme / "entry.png", optimize=True)
    bullet = Image.new("RGBA", (12 * ss, 12 * ss), (0, 0, 0, 0))
    ImageDraw.Draw(bullet).ellipse((2 * ss, 2 * ss, 10 * ss, 10 * ss), fill=(*NAVY_900, 255))
    bullet.resize((12, 12), Image.LANCZOS).save(theme / "bullet.png", optimize=True)
    lock = Image.new("RGBA", (28 * ss, 32 * ss), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lock)
    ld.rounded_rectangle((4 * ss, 13 * ss, 24 * ss, 30 * ss), radius=3 * ss, fill=(255, 255, 255, 255))
    ld.arc((7 * ss, 2 * ss, 21 * ss, 24 * ss), 180, 360, fill=(255, 255, 255, 255), width=3 * ss)
    ld.line((7 * ss + ss, 13 * ss, 7 * ss + ss, 10 * ss), fill=(255, 255, 255, 255), width=3 * ss)
    ld.line((21 * ss - ss, 13 * ss, 21 * ss - ss, 10 * ss), fill=(255, 255, 255, 255), width=3 * ss)
    lock.resize((28, 32), Image.LANCZOS).save(theme / "lock.png", optimize=True)
    write(theme / "zovelis.plymouth", PLYMOUTH_THEME)


PLYMOUTH_THEME = """[Plymouth Theme]
Name=Zovelis OS
Description=Boot splash for Zovelis OS: logo with a calm spinner.
ModuleName=two-step

[two-step]
Font=Noto Sans 12
TitleFont=Noto Sans Light 24
ImageDir=/usr/share/plymouth/themes/zovelis
DialogHorizontalAlignment=.5
DialogVerticalAlignment=.62
TitleHorizontalAlignment=.5
TitleVerticalAlignment=.382
HorizontalAlignment=.5
VerticalAlignment=.72
WatermarkHorizontalAlignment=.5
WatermarkVerticalAlignment=.42
Transition=none
TransitionDuration=0.0
BackgroundStartColor=0x071726
BackgroundEndColor=0x071726
ProgressBarBackgroundColor=0x1b3a4f
ProgressBarForegroundColor=0x5fd8db
MessageBelowAnimation=true

[boot-up]
UseEndAnimation=false

[shutdown]
UseEndAnimation=false

[reboot]
UseEndAnimation=false

[updates]
SuppressMessages=true
ProgressBarShowPercentComplete=true
UseProgressBar=true
Title=Installing updates…
SubTitle=Please keep your computer switched on.

[system-upgrade]
SuppressMessages=true
ProgressBarShowPercentComplete=true
UseProgressBar=true
Title=Upgrading Zovelis OS…
SubTitle=Please keep your computer switched on.

[firmware-upgrade]
SuppressMessages=true
ProgressBarShowPercentComplete=true
UseProgressBar=true
Title=Updating firmware…
SubTitle=Please keep your computer switched on.
"""


def make_boot_backgrounds(r: SvgRenderer, svgs: dict) -> None:
    """Backgrounds for GRUB (installed system and ISO) and ISOLINUX."""
    tmp = Path(tempfile.mkdtemp())
    try:
        r.render(svgs["zovelis-logo-horizontal-light"], tmp / "logo.png", 360)
        logo = Image.open(tmp / "logo.png").convert("RGBA")
        for (w, h), target in (
            ((1920, 1080), REPO / "packages" / "zovelis-artwork" / "usr" / "share" / "grub" / "themes" / "zovelis" / "background.png"),
            ((1920, 1080), REPO / "live" / "branding" / "grub-background.png"),
            ((640, 480), REPO / "live" / "branding" / "isolinux-splash.png"),
        ):
            bg = render_wallpaper("dark", w, h).convert("RGBA")
            # Darken so menu text stays readable on every part of the image.
            overlay = Image.new("RGBA", (w, h), (4, 14, 24, 120))
            bg = Image.alpha_composite(bg, overlay)
            scale = (w / 1920) * (1.0 if w >= 1280 else 1.6)
            lg = logo.resize((int(logo.width * scale), int(logo.height * scale)), Image.LANCZOS)
            y = int(h * 0.09)
            bg.alpha_composite(lg, ((w - lg.width) // 2, y))
            target.parent.mkdir(parents=True, exist_ok=True)
            bg.convert("RGB").save(target, optimize=True)
            log(f"boot background {target.relative_to(REPO)}")
    finally:
        shutil.rmtree(tmp)


def make_installer_icon() -> None:
    """Installer icon: the mark with a small download badge."""
    mark = (SRC / "zovelis-mark.svg").read_text()
    inner = mark.split(">", 1)[1].rsplit("</svg>", 1)[0]
    badge = (
        '<circle cx="198" cy="198" r="50" fill="#FFFFFF"/>'
        '<circle cx="198" cy="198" r="42" fill="#0B4F86"/>'
        '<path fill="#FFFFFF" d="M190 170 H206 V198 H220 L198 224 L176 198 H190 Z"/>'
    )
    write(SRC / "zovelis-installer.svg",
          '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">'
          f"<g transform=\"translate(0 0) scale(0.92)\">{inner}</g>{badge}</svg>\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--svgrender", required=True, help="path to the svgrender helper (branding/tools)")
    parser.add_argument("--skip-wallpapers", action="store_true")
    args = parser.parse_args()
    renderer = SvgRenderer(args.svgrender)
    svgs = make_wordmarks(find_inter())
    make_installer_icon()
    make_icons(renderer, svgs)
    make_plymouth(renderer, svgs)
    make_boot_backgrounds(renderer, svgs)
    if not args.skip_wallpapers:
        make_wallpapers()
    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
