/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Zovelis OS installer slideshow (Calamares slideshow API 2).
 * Shown while the system is being installed: a few slides that introduce
 * the desktop. They change every 9 seconds; clicking or the arrow keys
 * change them sooner.
 */
import QtQuick
import calamares.slideshow 1.0

Presentation {
    id: presentation

    function nextSlide() {
        presentation.goToNextSlide();
    }

    // API 2: Calamares calls these when the slideshow is shown / hidden.
    function onActivate() {
        presentation.currentSlide = 0;
        advanceTimer.restart();
    }
    function onLeave() {
        advanceTimer.stop();
    }

    Timer {
        id: advanceTimer
        interval: 9000
        running: presentation.activatedInCalamares
        repeat: true
        onTriggered: presentation.nextSlide()
    }

    // Painted behind every slide, so text always has the same background
    // whatever the colours of the installer window are.
    Rectangle {
        anchors.fill: parent
        z: -1
        color: "#F3F5F7"
    }

    // One slide: a picture with a heading and a sentence or two below it,
    // centred in the whole slideshow area.
    component ZSlide: Slide {
        id: slide
        property string heading
        property string body
        property url picture
        readonly property color ink: "#1B2631"
        readonly property color secondaryInk: "#4A5866"

        x: 0
        y: 0
        width: slide.parent ? slide.parent.width : 0
        height: slide.parent ? slide.parent.height : 0

        Column {
            anchors.centerIn: parent
            width: Math.min(slide.width * 0.88, slide.height * 0.56 * 16 / 9)
            spacing: Math.max(6, slide.height * 0.02)

            Image {
                width: parent.width
                height: width * 9 / 16
                source: slide.picture
                fillMode: Image.PreserveAspectFit
                smooth: true
                mipmap: true
                asynchronous: true
            }
            Text {
                width: parent.width
                text: slide.heading
                color: slide.ink
                font.pixelSize: Math.max(18, slide.height * 0.048)
                font.weight: Font.DemiBold
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
            }
            Text {
                width: parent.width
                text: slide.body
                color: slide.secondaryInk
                font.pixelSize: Math.max(14, slide.height * 0.03)
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                lineHeight: 1.15
            }
        }
    }

    ZSlide {
        picture: "slide-desktop.png"
        heading: qsTr("Welcome to Zovelis OS")
        body: qsTr("Zovelis OS is being installed. This takes a few minutes; you can keep using the computer in the meantime.")
    }
    ZSlide {
        picture: "slide-menu.png"
        heading: qsTr("Everything where you expect it")
        body: qsTr("Open the Zovelis menu in the bottom-left corner, or press the Meta (Windows) key, and start typing to find apps, files and settings.")
    }
    ZSlide {
        picture: "slide-apps.png"
        heading: qsTr("Thousands of free apps")
        body: qsTr("Discover, the Software Center, installs, updates and removes apps for you, including sandboxed apps from Flathub.")
    }
    ZSlide {
        picture: "slide-security.png"
        heading: qsTr("Secure from the start")
        body: qsTr("A firewall, automatic security updates and app sandboxing are switched on. Your files stay private on your account.")
    }
    ZSlide {
        picture: "slide-themes.png"
        heading: qsTr("Light or dark, your choice")
        body: qsTr("After installing, the Welcome app helps you pick a look and a comfortable text size.")
    }
}
