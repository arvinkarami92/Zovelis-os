// SPDX-License-Identifier: GPL-3.0-or-later
// Shared sizes, colours and timings. Everything is derived from the system
// palette and font, so the app follows the user's colour scheme (including
// high-contrast schemes), their text size and their animation-speed setting.
pragma Singleton
import QtQuick
import org.zovelis.welcome

QtObject {
    id: theme

    readonly property SystemPalette palette: SystemPalette {
        colorGroup: SystemPalette.Active
    }
    readonly property FontMetrics metrics: FontMetrics {}

    // One "unit" is the height of a line of body text.
    readonly property int unit: Math.max(16, Math.round(metrics.height))
    readonly property int smallSpacing: Math.round(unit / 4)
    readonly property int spacing: Math.round(unit / 2)
    readonly property int largeSpacing: unit
    readonly property int hugeSpacing: unit * 2
    readonly property int radius: Math.round(unit / 2.5)
    // Keep lines of text at a comfortable reading length on wide screens.
    readonly property int contentMaxWidth: unit * 44
    readonly property int iconSize: Math.round(unit * 2.5)
    readonly property int smallIconSize: Math.round(unit * 1.5)

    readonly property real basePointSize: Qt.application.font.pointSize > 0 ? Qt.application.font.pointSize : 10
    readonly property real headingPointSize: Math.round(basePointSize * 1.8)
    readonly property real subheadingPointSize: Math.round(basePointSize * 1.25)

    readonly property bool dark: palette.window.hslLightness < 0.5
    readonly property color window: palette.window
    readonly property color text: palette.windowText
    // 75 % text colour: still above 4.5:1 contrast on Breeze and Zovelis schemes (checked in tests).
    readonly property color secondaryText: mix(palette.windowText, palette.window, 0.25)
    readonly property color card: palette.base
    readonly property color cardText: palette.text
    readonly property color border: mix(palette.windowText, palette.window, dark ? 0.72 : 0.80)
    readonly property color accent: palette.highlight
    readonly property color accentText: palette.highlightedText
    readonly property color positive: dark ? "#6fdd8b" : "#1b6e34"
    readonly property color negative: dark ? "#ff8f87" : "#b3261e"
    readonly property color neutral: dark ? "#f5c060" : "#7a4f00"

    // Durations honour Plasma's animation speed slider; 0 means "instant".
    readonly property int shortDuration: Math.round(120 * Backend.animationFactor)
    readonly property int longDuration: Math.round(220 * Backend.animationFactor)

    function mix(a, b, t) {
        return Qt.rgba(a.r * (1 - t) + b.r * t, a.g * (1 - t) + b.g * t, a.b * (1 - t) + b.b * t, 1);
    }
}
