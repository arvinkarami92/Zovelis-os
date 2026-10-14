// SPDX-License-Identifier: GPL-3.0-or-later
// A miniature desktop that shows what the light or dark appearance looks like.
// Decorative only: screen readers get the card's own text instead.
import QtQuick
import org.zovelis.welcome

Item {
    id: root

    property bool dark: false

    implicitWidth: Theme.unit * 12
    implicitHeight: Math.round(width * 9 / 16)
    Accessible.ignored: true

    Rectangle {
        id: screen
        anchors.fill: parent
        radius: Math.max(2, Theme.radius - 2)
        clip: true
        gradient: Gradient {
            GradientStop { position: 0.0; color: root.dark ? "#06121f" : "#f4fafb" }
            GradientStop { position: 1.0; color: root.dark ? "#0b2638" : "#cfe8ee" }
        }

        // Wallpaper ribbons.
        Rectangle {
            width: screen.width * 1.4
            height: screen.height * 0.22
            x: -screen.width * 0.2
            y: screen.height * 0.52
            rotation: -7
            color: root.dark ? "#1a8fa6" : "#3cc9cb"
            opacity: root.dark ? 0.55 : 0.6
        }
        Rectangle {
            width: screen.width * 1.4
            height: screen.height * 0.4
            x: -screen.width * 0.2
            y: screen.height * 0.66
            rotation: -4
            color: root.dark ? "#0d4f86" : "#118fb0"
            opacity: root.dark ? 0.6 : 0.55
        }

        // An application window.
        Rectangle {
            x: screen.width * 0.12
            y: screen.height * 0.12
            width: screen.width * 0.58
            height: screen.height * 0.56
            radius: 3
            color: root.dark ? "#22272e" : "#ffffff"
            border.width: 1
            border.color: root.dark ? "#3a424c" : "#c9d1d6"

            Rectangle {
                width: parent.width
                height: parent.height * 0.16
                radius: 3
                color: root.dark ? "#2b323a" : "#e9eef1"
            }
            Column {
                x: parent.width * 0.08
                y: parent.height * 0.3
                spacing: parent.height * 0.08
                Repeater {
                    model: [0.8, 0.62, 0.7]
                    Rectangle {
                        required property real modelData
                        width: screen.width * 0.58 * 0.84 * modelData
                        height: Math.max(2, screen.height * 0.035)
                        radius: height / 2
                        color: root.dark ? "#c8d3dc" : "#33414d"
                        opacity: 0.55
                    }
                }
            }
        }

        // The taskbar.
        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: parent.height * 0.12
            color: root.dark ? "#10161d" : "#f6f8f9"
            opacity: 0.97

            Row {
                anchors.verticalCenter: parent.verticalCenter
                x: parent.height * 0.3
                spacing: parent.height * 0.3
                Repeater {
                    model: 4
                    Rectangle {
                        required property int index
                        width: screen.height * 0.07
                        height: width
                        radius: width * 0.25
                        color: index === 0 ? "#12a5b3" : (root.dark ? "#5b6875" : "#9aa7b1")
                    }
                }
            }
        }
    }
}
