#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate the Zovelis Light / Dark KDE colour schemes and verify contrast.

Every text colour is checked against the backgrounds it is drawn on using
the WCAG 2.x contrast formula: body text needs 4.5:1, focus rings and other
non-text indicators need 3:1. The script exits non-zero if any pair fails,
so it doubles as a test (run by tests/run-all.sh).
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "packages" / "zovelis-desktop-settings" / "usr" / "share" / "color-schemes"


def rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def luminance(c) -> float:
    def channel(v):
        v = v / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(x) for x in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b) -> float:
    la, lb = luminance(rgb(a)), luminance(rgb(b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


LIGHT = {
    "name": "Zovelis Light", "id": "ZovelisLight",
    "window": "#F3F5F7", "window_alt": "#E6EBEF",
    "view": "#FFFFFF", "view_alt": "#F6F8FA",
    "button": "#FDFEFE", "button_alt": "#CFE9EC",
    "header": "#E6EBEF", "header_alt": "#F3F5F7",
    "header_inactive": "#F3F5F7", "header_inactive_alt": "#E9EEF1",
    "tooltip": "#FFFFFF", "tooltip_alt": "#F3F5F7",
    "text": "#1B2631", "inactive": "#56626E", "active": "#0B6E78",
    "link": "#0B6596", "visited": "#7A4FA0",
    "negative": "#B3261E", "neutral": "#8A5300", "positive": "#1B7A3A",
    "focus": "#0E8FA6", "hover": "#0E8FA6",
    "selection": "#0A6B74", "selection_alt": "#9FD8DD", "selection_text": "#FFFFFF",
    "selection_inactive": "#E3F4F6", "selection_link": "#FFE9B0",
    "selection_negative": "#FFE2DF", "selection_neutral": "#FFEFD2", "selection_positive": "#DDF8E5",
    "complementary": "#1B2631", "complementary_alt": "#141D26",
    "complementary_text": "#F2F5F7", "complementary_inactive": "#A9B4BE",
    "complementary_focus": "#2BB3BF", "complementary_link": "#6BCDF5",
    "complementary_negative": "#FF8F87", "complementary_neutral": "#F5C060", "complementary_positive": "#6FDD8B",
}

DARK = {
    "name": "Zovelis Dark", "id": "ZovelisDark",
    "window": "#161B22", "window_alt": "#1C232B",
    "view": "#0F1419", "view_alt": "#141A21",
    "button": "#222A33", "button_alt": "#14555C",
    "header": "#1C232B", "header_alt": "#161B22",
    "header_inactive": "#161B22", "header_inactive_alt": "#1A2028",
    "tooltip": "#222A33", "tooltip_alt": "#1C232B",
    "text": "#E8EDF2", "inactive": "#9AA7B3", "active": "#4CC9D4",
    "link": "#5CC8F0", "visited": "#C49BF0",
    "negative": "#FF8F87", "neutral": "#F5C060", "positive": "#6FDD8B",
    "focus": "#2BB3BF", "hover": "#2BB3BF",
    "selection": "#0F737E", "selection_alt": "#0B545C", "selection_text": "#FFFFFF",
    "selection_inactive": "#E3F4F6", "selection_link": "#FFE9B0",
    "selection_negative": "#FFE2DF", "selection_neutral": "#FFEFD2", "selection_positive": "#DDF8E5",
    "complementary": "#0C1117", "complementary_alt": "#080C10",
    "complementary_text": "#E8EDF2", "complementary_inactive": "#9AA7B3",
    "complementary_focus": "#2BB3BF", "complementary_link": "#5CC8F0",
    "complementary_negative": "#FF8F87", "complementary_neutral": "#F5C060", "complementary_positive": "#6FDD8B",
}


def triplet(hex_color: str) -> str:
    return ",".join(str(v) for v in rgb(hex_color))


def color_set(p: dict, bg: str, bg_alt: str, prefix: str = "") -> list[str]:
    k = (lambda name: p[prefix + name]) if prefix else (lambda name: p[name])
    if prefix == "selection_":
        fg = {"normal": p["selection_text"], "inactive": p["selection_inactive"], "active": p["selection_text"],
              "link": p["selection_link"], "visited": p["selection_inactive"], "negative": p["selection_negative"],
              "neutral": p["selection_neutral"], "positive": p["selection_positive"]}
        focus = hover = p["focus"]
    elif prefix == "complementary_":
        fg = {"normal": p["complementary_text"], "inactive": p["complementary_inactive"],
              "active": p["complementary_focus"], "link": p["complementary_link"], "visited": p["visited"],
              "negative": p["complementary_negative"], "neutral": p["complementary_neutral"],
              "positive": p["complementary_positive"]}
        focus = hover = p["complementary_focus"]
    else:
        fg = {"normal": p["text"], "inactive": p["inactive"], "active": p["active"], "link": p["link"],
              "visited": p["visited"], "negative": p["negative"], "neutral": p["neutral"], "positive": p["positive"]}
        focus, hover = p["focus"], p["hover"]
    return [
        f"BackgroundAlternate={triplet(bg_alt)}",
        f"BackgroundNormal={triplet(bg)}",
        f"DecorationFocus={triplet(focus)}",
        f"DecorationHover={triplet(hover)}",
        f"ForegroundActive={triplet(fg['active'])}",
        f"ForegroundInactive={triplet(fg['inactive'])}",
        f"ForegroundLink={triplet(fg['link'])}",
        f"ForegroundNegative={triplet(fg['negative'])}",
        f"ForegroundNeutral={triplet(fg['neutral'])}",
        f"ForegroundNormal={triplet(fg['normal'])}",
        f"ForegroundPositive={triplet(fg['positive'])}",
        f"ForegroundVisited={triplet(fg['visited'])}",
    ]


def scheme(p: dict) -> str:
    sections = {
        "Colors:Button": color_set(p, p["button"], p["button_alt"]),
        "Colors:Complementary": color_set(p, p["complementary"], p["complementary_alt"], "complementary_"),
        "Colors:Header": color_set(p, p["header"], p["header_alt"]),
        "Colors:Header][Inactive": color_set(p, p["header_inactive"], p["header_inactive_alt"]),
        "Colors:Selection": color_set(p, p["selection"], p["selection_alt"], "selection_"),
        "Colors:Tooltip": color_set(p, p["tooltip"], p["tooltip_alt"]),
        "Colors:View": color_set(p, p["view"], p["view_alt"]),
        "Colors:Window": color_set(p, p["window"], p["window_alt"]),
    }
    lines = [
        "# SPDX-License-Identifier: GPL-3.0-or-later",
        "# Generated by branding/generate_colors.py — edit that file, not this one.",
        "[ColorEffects:Disabled]", "Color=56,56,56", "ColorAmount=0", "ColorEffect=0",
        "ContrastAmount=0.65", "ContrastEffect=1", "IntensityAmount=0.1", "IntensityEffect=2", "",
        "[ColorEffects:Inactive]", "ChangeSelectionColor=true", "Color=112,111,110", "ColorAmount=0.025",
        "ColorEffect=2", "ContrastAmount=0.1", "ContrastEffect=2", "Enable=false", "IntensityAmount=0",
        "IntensityEffect=0", "",
    ]
    for name, entries in sections.items():
        lines.append(f"[{name}]")
        lines.extend(entries)
        lines.append("")
    lines += [
        "[General]", f"ColorScheme={p['id']}", f"Name={p['name']}", "shadeSortColumn=true", "",
        "[KDE]", "contrast=4", "",
        "[WM]",
        f"activeBackground={triplet(p['header'])}", f"activeBlend={triplet(p['header'])}",
        f"activeForeground={triplet(p['text'])}",
        f"inactiveBackground={triplet(p['header_inactive'])}", f"inactiveBlend={triplet(p['header_inactive'])}",
        f"inactiveForeground={triplet(p['inactive'])}", "",
    ]
    return "\n".join(lines)


def checks(p: dict) -> list[tuple[str, str, str, float]]:
    """(description, foreground, background, minimum ratio)."""
    text_on = [("window", "window"), ("view", "view"), ("button", "button"), ("header", "header"),
               ("tooltip", "tooltip"), ("view_alt", "view alternate rows")]
    out = []
    for bg_key, label in text_on:
        out.append((f"text on {label}", p["text"], p[bg_key], 4.5))
        out.append((f"secondary text on {label}", p["inactive"], p[bg_key], 4.5))
    for key in ("link", "visited", "negative", "neutral", "positive", "active"):
        out.append((f"{key} text on view", p[key], p["view"], 4.5))
        out.append((f"{key} text on window", p[key], p["window"], 4.5))
    out.append(("selected text", p["selection_text"], p["selection"], 4.5))
    for key in ("selection_inactive", "selection_link", "selection_negative", "selection_neutral", "selection_positive"):
        out.append((f"{key} on selection", p[key], p["selection"], 4.5))
    out.append(("focus ring on window", p["focus"], p["window"], 3.0))
    out.append(("focus ring on view", p["focus"], p["view"], 3.0))
    out.append(("selection vs window (indicator)", p["selection"], p["window"], 3.0))
    out.append(("complementary text", p["complementary_text"], p["complementary"], 4.5))
    out.append(("complementary secondary", p["complementary_inactive"], p["complementary"], 4.5))
    for key in ("complementary_link", "complementary_negative", "complementary_neutral", "complementary_positive"):
        out.append((key, p[key], p["complementary"], 4.5))
    return out


def main() -> int:
    failures = 0
    write = "--check" not in sys.argv
    for palette in (LIGHT, DARK):
        for desc, fg, bg, minimum in checks(palette):
            ratio = contrast(fg, bg)
            ok = ratio >= minimum
            failures += 0 if ok else 1
            if not ok or "--verbose" in sys.argv:
                print(f"{'ok  ' if ok else 'FAIL'} {palette['id']:<13} {desc:<42} {ratio:5.2f} (min {minimum})")
        if write:
            OUT.mkdir(parents=True, exist_ok=True)
            target = OUT / f"{palette['id']}.colors"
            target.write_text(scheme(palette), encoding="utf-8")
            print(f"wrote {target.relative_to(REPO)}")
    if failures:
        print(f"{failures} contrast check(s) failed", file=sys.stderr)
        return 1
    print("all contrast checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
