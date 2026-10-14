# SPDX-License-Identifier: GPL-3.0-or-later
"""Illustrations of the Zovelis desktop, drawn from code.

They are used where a picture of the desktop is needed before (or without) a
real screenshot: the previews of the global themes in System Settings, the
login-screen preview and the installer slideshow. The drawings follow the
real layout (bottom taskbar, Zovelis menu button, pinned apps, tray, clock)
and use the real Zovelis colour schemes and wallpapers.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Colours taken from branding/generate_colors.py (Zovelis Light / Dark).
SCHEMES = {
    "light": {
        "window": (243, 245, 247), "view": (255, 255, 255), "header": (230, 235, 239),
        "text": (27, 38, 49), "secondary": (86, 98, 110), "border": (201, 209, 214),
        "selection": (10, 107, 116), "panel": (246, 248, 250, 236), "panel_text": (27, 38, 49),
        "sidebar": (236, 240, 243),
    },
    "dark": {
        "window": (22, 27, 34), "view": (15, 20, 25), "header": (28, 35, 43),
        "text": (232, 237, 242), "secondary": (154, 167, 179), "border": (52, 61, 72),
        "selection": (15, 115, 126), "panel": (16, 22, 29, 238), "panel_text": (232, 237, 242),
        "sidebar": (26, 32, 40),
    },
}

FONT_CANDIDATES = {
    "regular": ["/usr/share/fonts/opentype/inter/Inter-Regular.otf",
                "/usr/share/fonts/truetype/inter/Inter-Regular.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    "semibold": ["/usr/share/fonts/opentype/inter/Inter-SemiBold.otf",
                 "/usr/share/fonts/truetype/inter/Inter-SemiBold.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
}


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES[weight]:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _rounded(draw: ImageDraw.ImageDraw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def _shadow(base: Image.Image, box, radius, blur, opacity):
    """Soft drop shadow under a rectangle (drawn into `base`)."""
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((x0, y0 + blur // 2, x1, y1 + blur), radius=radius,
                                            fill=(0, 0, 0, int(255 * opacity)))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(layer)


def _app_icon(draw: ImageDraw.ImageDraw, kind: str, x: int, y: int, s: int):
    """Small generic app icons (not copies of any real product's icon)."""
    r = s // 5
    if kind == "files":
        _rounded(draw, (x, y + s * 0.18, x + s, y + s), r, (59, 151, 214))
        _rounded(draw, (x, y, x + s * 0.48, y + s * 0.34), r // 2, (47, 128, 189))
        _rounded(draw, (x, y + s * 0.30, x + s, y + s), r, (86, 176, 232))
    elif kind == "browser":
        draw.ellipse((x, y, x + s, y + s), fill=(240, 120, 54))
        draw.ellipse((x + s * 0.2, y + s * 0.2, x + s * 0.8, y + s * 0.8), fill=(255, 196, 92))
        draw.ellipse((x + s * 0.36, y + s * 0.36, x + s * 0.64, y + s * 0.64), fill=(240, 120, 54))
    elif kind == "store":
        _rounded(draw, (x, y + s * 0.22, x + s, y + s), r, (18, 165, 179))
        draw.arc((x + s * 0.28, y, x + s * 0.72, y + s * 0.5), 180, 360, fill=(18, 165, 179), width=max(2, s // 9))
        draw.ellipse((x + s * 0.42, y + s * 0.5, x + s * 0.58, y + s * 0.66), fill=(255, 255, 255))
    elif kind == "settings":
        draw.ellipse((x, y, x + s, y + s), fill=(120, 134, 148))
        draw.ellipse((x + s * 0.32, y + s * 0.32, x + s * 0.68, y + s * 0.68), fill=(230, 235, 239))
    elif kind == "terminal":
        _rounded(draw, (x, y, x + s, y + s), r, (40, 46, 56))
        draw.line((x + s * 0.22, y + s * 0.35, x + s * 0.42, y + s * 0.5, x + s * 0.22, y + s * 0.65),
                  fill=(95, 216, 219), width=max(2, s // 10))


def render_desktop(variant: str, wallpaper: Image.Image, mark: Image.Image,
                   size=(1920, 1080), window: bool = True) -> Image.Image:
    """A Zovelis desktop at `size`, with a file-manager window and the taskbar."""
    w, h = size
    c = SCHEMES[variant]
    img = wallpaper.convert("RGBA").resize(size, Image.LANCZOS)
    draw = ImageDraw.Draw(img)
    unit = h / 1080

    if window:
        wx0, wy0 = int(330 * unit * (w / h) / (1920 / 1080)), int(150 * unit)
        wx1, wy1 = wx0 + int(1180 * unit), wy0 + int(660 * unit)
        rad = int(10 * unit)
        _shadow(img, (wx0, wy0, wx1, wy1), rad, int(18 * unit), 0.35 if variant == "light" else 0.55)
        draw = ImageDraw.Draw(img)
        _rounded(draw, (wx0, wy0, wx1, wy1), rad, c["window"], outline=c["border"])
        # Title bar with window buttons.
        tb = int(40 * unit)
        draw.rounded_rectangle((wx0, wy0, wx1, wy0 + tb), radius=rad, fill=c["header"])
        draw.rectangle((wx0, wy0 + tb - rad, wx1, wy0 + tb), fill=c["header"])
        draw.text(((wx0 + wx1) // 2, wy0 + tb // 2), "Home — Files", fill=c["text"],
                  font=font("semibold", int(15 * unit)), anchor="mm")
        for i, col in enumerate(((120, 134, 148), (120, 134, 148), (214, 76, 76))):
            cx = wx1 - int((28 + i * 32) * unit)
            draw.ellipse((cx - 7 * unit, wy0 + tb / 2 - 7 * unit, cx + 7 * unit, wy0 + tb / 2 + 7 * unit), fill=col)
        # Sidebar.
        sb = wx0 + int(230 * unit)
        draw.rectangle((wx0 + 1, wy0 + tb, sb, wy1 - rad), fill=c["sidebar"])
        places = ["Home", "Desktop", "Documents", "Downloads", "Music", "Pictures", "Videos", "Trash"]
        for i, name in enumerate(places):
            y = wy0 + tb + int((22 + i * 40) * unit)
            if i == 0:
                _rounded(draw, (wx0 + 10 * unit, y - 6 * unit, sb - 10 * unit, y + 26 * unit), int(6 * unit), c["selection"])
            draw.rounded_rectangle((wx0 + 22 * unit, y + 2 * unit, wx0 + 40 * unit, y + 18 * unit),
                                   radius=int(3 * unit), fill=(59, 151, 214) if i != 7 else (120, 134, 148))
            draw.text((wx0 + 52 * unit, y + 10 * unit), name, anchor="lm", font=font("regular", int(15 * unit)),
                      fill=(255, 255, 255) if i == 0 else c["text"])
        # Content: a grid of folders.
        draw.rectangle((sb + 1, wy0 + tb, wx1 - 1, wy1 - rad), fill=c["view"])
        names = ["Desktop", "Documents", "Downloads", "Music", "Pictures", "Public", "Templates", "Videos"]
        for i, name in enumerate(names):
            col, row = i % 5, i // 5
            x = sb + int((40 + col * 175) * unit)
            y = wy0 + tb + int((40 + row * 170) * unit)
            _app_icon(draw, "files", x + int(30 * unit), y, int(86 * unit))
            draw.text((x + int(73 * unit), y + int(112 * unit)), name, anchor="mm",
                      font=font("regular", int(15 * unit)), fill=c["text"])

    # Floating taskbar.
    ph = int(46 * unit)
    margin = int(8 * unit)
    px0, py0, px1, py1 = margin, h - ph - margin, w - margin, h - margin
    panel = Image.new("RGBA", img.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    _shadow(img, (px0, py0, px1, py1), int(12 * unit), int(10 * unit), 0.25)
    pd.rounded_rectangle((px0, py0, px1, py1), radius=int(12 * unit), fill=c["panel"],
                         outline=c["border"] + (255,))
    img.alpha_composite(panel)
    draw = ImageDraw.Draw(img)
    icon = int(30 * unit)
    cy = (py0 + py1) // 2
    m = mark.resize((icon, icon), Image.LANCZOS)
    img.alpha_composite(m, (px0 + int(14 * unit), cy - icon // 2))
    for i, kind in enumerate(("files", "browser", "store", "settings", "terminal")):
        x = px0 + int((70 + i * 52) * unit)
        _app_icon(draw, kind, x, cy - icon // 2, icon)
        if i in (0, 1):  # running apps get an indicator line
            draw.rounded_rectangle((x + icon * 0.25, py1 - 5 * unit, x + icon * 0.75, py1 - 2 * unit),
                                   radius=int(2 * unit), fill=(18, 165, 179))
    # Tray: network, volume, battery glyphs, then clock and date.
    tx = px1 - int(250 * unit)
    for i in range(3):
        x = tx + int(i * 30 * unit)
        draw.rounded_rectangle((x, cy - 8 * unit, x + 16 * unit, cy + 8 * unit), radius=int(4 * unit),
                               outline=c["panel_text"], width=max(1, int(2 * unit)))
    draw.text((px1 - int(70 * unit), cy - int(9 * unit)), "10:24", anchor="mm",
              font=font("semibold", int(15 * unit)), fill=c["panel_text"])
    draw.text((px1 - int(70 * unit), cy + int(10 * unit)), "Wed 14 Oct", anchor="mm",
              font=font("regular", int(13 * unit)), fill=c["panel_text"])
    return img


def render_splash(mark_logo: Image.Image, size=(300, 169)) -> Image.Image:
    """Preview of the Plasma splash screen (dark navy, logo, spinner)."""
    w, h = size
    img = Image.new("RGBA", size, (7, 23, 38, 255))
    logo = mark_logo.copy()
    scale = (h * 0.42) / logo.height
    logo = logo.resize((max(1, int(logo.width * scale)), max(1, int(logo.height * scale))), Image.LANCZOS)
    img.alpha_composite(logo, ((w - logo.width) // 2, (h - logo.height) // 2 - int(h * 0.04)))
    # Draw the spinner on its own layer so its translucent track is blended
    # with the background instead of replacing it.
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    s = int(h * 0.09)
    cx, cy = w // 2, int(h * 0.84)
    d.ellipse((cx - s, cy - s, cx + s, cy + s), outline=(255, 255, 255, 40), width=max(2, s // 4))
    d.arc((cx - s, cy - s, cx + s, cy + s), -90, 0, fill=(95, 216, 219, 255), width=max(2, s // 4))
    img.alpha_composite(layer)
    return img


def render_login(wallpaper_dark: Image.Image, logo_light: Image.Image, size=(1920, 1080)) -> Image.Image:
    """Preview of the login screen (Breeze layout with Zovelis background/logo)."""
    w, h = size
    unit = h / 1080
    img = wallpaper_dark.convert("RGBA").resize(size, Image.LANCZOS)
    veil = Image.new("RGBA", size, (4, 14, 24, 70))
    img.alpha_composite(veil)
    d = ImageDraw.Draw(img)
    d.text((w // 2, int(200 * unit)), "10:24", anchor="mm", font=font("regular", int(96 * unit)), fill=(255, 255, 255))
    d.text((w // 2, int(285 * unit)), "Wednesday, 14 October 2026", anchor="mm",
           font=font("regular", int(28 * unit)), fill=(232, 237, 242))
    r = int(64 * unit)
    cx, cy = w // 2, int(480 * unit)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(18, 120, 135), outline=(255, 255, 255), width=max(2, int(3 * unit)))
    d.ellipse((cx - r * 0.36, cy - r * 0.62, cx + r * 0.36, cy + r * 0.1), fill=(232, 245, 247))
    d.chord((cx - r * 0.72, cy + r * 0.12, cx + r * 0.72, cy + r * 1.3), 180, 360, fill=(232, 245, 247))
    d.text((cx, cy + r + int(36 * unit)), "Alex", anchor="mm", font=font("semibold", int(28 * unit)), fill=(255, 255, 255))
    fx0, fy0 = cx - int(170 * unit), cy + r + int(70 * unit)
    d.rounded_rectangle((fx0, fy0, fx0 + int(340 * unit), fy0 + int(46 * unit)), radius=int(8 * unit),
                        fill=(255, 255, 255, 235), outline=(95, 216, 219), width=max(1, int(2 * unit)))
    d.text((fx0 + int(16 * unit), fy0 + int(23 * unit)), "Password", anchor="lm",
           font=font("regular", int(20 * unit)), fill=(120, 134, 148))
    lg = logo_light.copy()
    scale = (52 * unit) / lg.height
    lg = lg.resize((int(lg.width * scale), int(lg.height * scale)), Image.LANCZOS)
    img.alpha_composite(lg, (int(48 * unit), h - int(48 * unit) - lg.height))
    for i, label in enumerate(("Sleep", "Restart", "Shut Down")):
        x = w // 2 + int((i - 1) * 170 * unit)
        d.ellipse((x - 24 * unit, h - 150 * unit, x + 24 * unit, h - 102 * unit), outline=(255, 255, 255), width=max(1, int(2 * unit)))
        d.text((x, h - 80 * unit), label, anchor="mm", font=font("regular", int(18 * unit)), fill=(232, 237, 242))
    return img


def render_menu(wallpaper: Image.Image, mark: Image.Image, size=(1920, 1080)) -> Image.Image:
    """The light desktop with the Zovelis (application) menu open."""
    w, h = size
    unit = h / 1080
    c = SCHEMES["light"]
    img = render_desktop("light", wallpaper, mark, size, window=False)
    mx0, my1 = int(8 * unit), h - int(62 * unit)
    mx1, my0 = mx0 + int(640 * unit), my1 - int(620 * unit)
    _shadow(img, (mx0, my0, mx1, my1), int(12 * unit), int(16 * unit), 0.3)
    d = ImageDraw.Draw(img)
    _rounded(d, (mx0, my0, mx1, my1), int(12 * unit), c["window"] + (255,), outline=c["border"])
    # Search field.
    _rounded(d, (mx0 + 24 * unit, my0 + 24 * unit, mx1 - 24 * unit, my0 + 68 * unit), int(8 * unit),
             c["view"], outline=c["selection"], width=max(1, int(2 * unit)))
    d.text((mx0 + 44 * unit, my0 + 46 * unit), "Search…", anchor="lm", font=font("regular", int(18 * unit)),
           fill=c["secondary"])
    d.text((mx0 + 28 * unit, my0 + 104 * unit), "Favorites", anchor="lm", font=font("semibold", int(17 * unit)),
           fill=c["text"])
    apps = [("browser", "Web Browser"), ("files", "Files"), ("store", "Discover"), ("settings", "Settings"),
            ("terminal", "Terminal"), ("files", "Documents"), ("store", "Welcome"), ("settings", "Help")]
    for i, (kind, label) in enumerate(apps):
        col, row = i % 4, i // 4
        x = mx0 + int((44 + col * 148) * unit)
        y = my0 + int((140 + row * 150) * unit)
        _app_icon(d, kind, x + int(28 * unit), y, int(56 * unit))
        d.text((x + int(56 * unit), y + int(84 * unit)), label, anchor="mm", font=font("regular", int(16 * unit)),
               fill=c["text"])
    # Session buttons along the bottom of the menu.
    for i, label in enumerate(("Sleep", "Restart", "Shut Down")):
        x = mx1 - int((330 - i * 110) * unit)
        d.text((x, my1 - 34 * unit), label, anchor="lm", font=font("regular", int(16 * unit)), fill=c["text"])
    return img


def render_apps(wallpaper: Image.Image, mark: Image.Image, size=(1920, 1080)) -> Image.Image:
    """The software centre: a grid of app tiles with Install buttons."""
    w, h = size
    unit = h / 1080
    c = SCHEMES["light"]
    img = render_desktop("light", wallpaper, mark, size, window=False)
    x0, y0, x1, y1 = int(240 * unit), int(90 * unit), w - int(240 * unit), h - int(130 * unit)
    _shadow(img, (x0, y0, x1, y1), int(10 * unit), int(18 * unit), 0.35)
    d = ImageDraw.Draw(img)
    _rounded(d, (x0, y0, x1, y1), int(10 * unit), c["window"] + (255,), outline=c["border"])
    d.rectangle((x0 + 1, y0 + 40 * unit, x0 + 260 * unit, y1 - 10 * unit), fill=c["sidebar"])
    d.text(((x0 + x1) // 2, y0 + 20 * unit), "Discover", anchor="mm", font=font("semibold", int(16 * unit)), fill=c["text"])
    for i, label in enumerate(("Home", "Applications", "Games", "Graphics", "Office", "Updates")):
        y = y0 + int((80 + i * 46) * unit)
        if i == 1:
            _rounded(d, (x0 + 10 * unit, y - 16 * unit, x0 + 250 * unit, y + 16 * unit), int(6 * unit), c["selection"])
        d.text((x0 + 30 * unit, y), label, anchor="lm", font=font("regular", int(17 * unit)),
               fill=(255, 255, 255) if i == 1 else c["text"])
    kinds = ["browser", "files", "store", "settings", "terminal", "browser", "store", "files", "settings"]
    names = ["Office Suite", "Photo Editor", "Music Player", "Video Editor", "Email", "Drawing", "Chat", "Notes",
             "Games Hub"]
    gx0 = x0 + int(300 * unit)
    tile_w, tile_h = int(390 * unit), int(200 * unit)
    for i in range(9):
        col, row = i % 3, i // 3
        tx = gx0 + int(col * (tile_w + 24 * unit))
        ty = y0 + int(70 * unit) + int(row * (tile_h + 24 * unit))
        if tx + tile_w > x1 - 20 * unit:
            continue
        _rounded(d, (tx, ty, tx + tile_w, ty + tile_h), int(8 * unit), c["view"], outline=c["border"])
        _app_icon(d, kinds[i], tx + int(24 * unit), ty + int(24 * unit), int(64 * unit))
        d.text((tx + int(108 * unit), ty + int(40 * unit)), names[i], anchor="lm", font=font("semibold", int(18 * unit)),
               fill=c["text"])
        d.text((tx + int(108 * unit), ty + int(70 * unit)), "Free · Sandboxed", anchor="lm",
               font=font("regular", int(15 * unit)), fill=c["secondary"])
        _rounded(d, (tx + int(24 * unit), ty + tile_h - int(60 * unit), tx + int(150 * unit), ty + tile_h - int(22 * unit)),
                 int(6 * unit), c["selection"])
        d.text((tx + int(87 * unit), ty + tile_h - int(41 * unit)), "Install", anchor="mm",
               font=font("semibold", int(16 * unit)), fill=(255, 255, 255))
    return img


def render_security(size=(1920, 1080)) -> Image.Image:
    """A shield with the three protections that are switched on by default."""
    w, h = size
    unit = h / 1080
    img = Image.new("RGBA", size, (7, 23, 38, 255))
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((w / 2 - 420 * unit, h / 2 - 420 * unit, w / 2 + 420 * unit, h / 2 + 420 * unit),
                                 fill=(14, 143, 166, 90))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(120 * unit)))
    d = ImageDraw.Draw(img)
    cx, cy = w / 2, h * 0.43
    s = 230 * unit
    shield = [(cx, cy - s), (cx + s * 0.85, cy - s * 0.62), (cx + s * 0.78, cy + s * 0.25),
              (cx, cy + s * 0.98), (cx - s * 0.78, cy + s * 0.25), (cx - s * 0.85, cy - s * 0.62)]
    d.polygon(shield, fill=(14, 143, 166))
    inner = [(cx + (x - cx) * 0.86, cy + (y - cy) * 0.86) for x, y in shield]
    d.polygon(inner, fill=(30, 200, 200))
    d.line([(cx - s * 0.32, cy + s * 0.02), (cx - s * 0.06, cy + s * 0.3), (cx + s * 0.38, cy - s * 0.24)],
           fill=(255, 255, 255), width=int(34 * unit), joint="curve")
    labels = ("Firewall on", "Security updates", "App sandboxing")
    for i, label in enumerate(labels):
        bx = w / 2 + (i - 1) * 520 * unit
        by = h * 0.82
        _rounded(d, (bx - 220 * unit, by - 44 * unit, bx + 220 * unit, by + 44 * unit), int(44 * unit),
                 (16, 38, 56), outline=(95, 216, 219), width=max(1, int(2 * unit)))
        d.ellipse((bx - 196 * unit, by - 18 * unit, bx - 160 * unit, by + 18 * unit), fill=(111, 221, 139))
        d.text((bx - 140 * unit, by), label, anchor="lm", font=font("semibold", int(32 * unit)), fill=(255, 255, 255))
    return img


def render_themes(light: Image.Image, dark: Image.Image, size=(1920, 1080)) -> Image.Image:
    """Light and dark desktops side by side, split diagonally."""
    w, h = size
    a = light.convert("RGBA").resize(size, Image.LANCZOS)
    b = dark.convert("RGBA").resize(size, Image.LANCZOS)
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon([(w * 0.62, 0), (w, 0), (w, h), (w * 0.38, h)], fill=255)
    a.paste(b, (0, 0), mask)
    d = ImageDraw.Draw(a)
    d.line([(w * 0.62, 0), (w * 0.38, h)], fill=(255, 255, 255), width=max(2, int(6 * h / 1080)))
    return a
