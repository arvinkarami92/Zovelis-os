# Zovelis OS design

## Principles

1. **Familiar first.** Things are where people coming from Windows look for
   them: menu bottom-left, taskbar with pinned and open apps, clock and
   notifications bottom-right, double-click to open files, Meta key opens
   the menu.
2. **Calm and readable.** One accent colour, generous spacing, Noto Sans,
   no decoration that competes with content.
3. **Accessible by default.** Contrast checked against WCAG 2.x, full
   keyboard navigation, screen reader and zoom included and announced,
   animations honour the system's animation-speed setting.
4. **Plasma, not a fork of it.** The look is built from Plasma's own
   mechanisms (global themes, colour schemes, layout scripts, Breeze), so it
   keeps working through updates.

## Brand

* **Mark**: a white "Z" on a rounded tile with a teal-to-blue gradient
  (`branding/src/zovelis-mark.svg`). Used for the menu button, app icons and
  the installer.
* **Wordmark**: "Zovelis" set in Inter SemiBold, converted to outlines.
* **Lockups**: horizontal (mark + wordmark) for the login screen and boot
  menu, vertical for the splash screens.
* **Wallpaper**: soft glass ribbons, light and dark variants of the same
  picture; Plasma switches automatically with the colour scheme.

## Colour

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| Window | `#F3F5F7` | `#161B22` | window backgrounds |
| View | `#FFFFFF` | `#0F1419` | lists, text fields |
| Text | `#1B2631` | `#E8EDF2` | body text |
| Secondary text | `#56626E` | `#9AA7B3` | hints, descriptions |
| Selection / accent | `#0A6B74` | `#0F737E` | selected items, default buttons |
| Focus | `#0E8FA6` | `#2BB3BF` | focus rings, hover |
| Navy (boot, login) | `#071726` | | Plymouth, splash, boot menu, sidebar of the installer |
| Teal 300 | `#5FD8DB` | | spinners, highlights on navy |

All text/background pairs meet 4.5:1 and all indicators 3:1; the check runs
with every build (`branding/generate_colors.py --check`).

## Typography

Noto Sans 10 pt (Plasma's default) for the interface, Hack for terminals.
The Welcome app offers three text sizes (10, 12 and 14 pt), applied to all
KDE fonts at once. GRUB uses Noto Sans bitmap fonts generated at build time,
so even the boot menu matches.

## Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                    desktop (files in ~/Desktop)                      │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ [Z] [Files][Firefox][Discover][Settings] (open windows)  tray 10:24 ▏│
└──────────────────────────────────────────────────────────────────────┘
```

The taskbar is 2.5 text lines high (44 px at default size), floats with a
small margin, and on ultra-wide screens stays as wide as a 21:9 monitor.

## Start-up sequence

Boot menu → Plymouth splash → login screen → Plasma splash all share the
navy background, so starting the computer looks like one continuous screen
rather than a series of flashes.

## Accessibility checklist

- Every interactive control in the Welcome app is reachable with Tab,
  activates with Space/Enter, has an accessible name, and shows a visible
  focus ring.
- Headings are marked as headings for screen readers; decorative images are
  hidden from them.
- Colour is never the only signal: status labels say "On"/"Off".
- Orca (Meta+Alt+S), zoom (Meta+Plus/Minus), sticky/slow keys and
  high-contrast colour schemes are available from System Settings >
  Accessibility, linked from the Welcome app.
- The GRUB boot menu beeps when it appears (Debian's convention) so people
  who cannot see the screen know the computer is waiting.
