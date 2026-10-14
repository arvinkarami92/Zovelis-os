// SPDX-License-Identifier: GPL-3.0-or-later
// Zovelis OS splash screen, shown while Plasma starts after login.
// The background matches the boot splash and the login screen so the start
// sequence feels like one continuous screen.
import QtQuick
import org.kde.kirigami as Kirigami

Rectangle {
    id: root

    // Set by ksplashqml: 1 (started) ... 5 (desktop ready).
    property int stage

    color: "#071726"

    onStageChanged: {
        if (stage === 2) {
            introAnimation.running = true;
        } else if (stage === 5) {
            introAnimation.target = busyIndicator;
            introAnimation.from = 1;
            introAnimation.to = 0;
            introAnimation.running = true;
        }
    }

    Item {
        id: content
        anchors.fill: parent
        opacity: 0

        Image {
            id: logo
            anchors.centerIn: parent
            asynchronous: true
            source: "images/zovelis-logo-vertical-light.svg"
            sourceSize.height: Kirigami.Units.gridUnit * 9
            fillMode: Image.PreserveAspectFit
            Accessible.role: Accessible.Graphic
            Accessible.name: "Zovelis OS"
        }

        Image {
            id: busyIndicator
            // Halfway between the logo and the bottom edge.
            y: logo.y + logo.height + (parent.height - logo.y - logo.height) / 2 - height / 2
            anchors.horizontalCenter: parent.horizontalCenter
            asynchronous: true
            source: "images/busy.svg"
            sourceSize.width: Kirigami.Units.gridUnit * 2
            sourceSize.height: Kirigami.Units.gridUnit * 2
            Accessible.ignored: true

            RotationAnimator on rotation {
                from: 0
                to: 360
                // A fixed speed: the animation-speed setting should not make
                // the spinner race or crawl. It stops if animations are off.
                duration: 1600
                loops: Animation.Infinite
                running: Kirigami.Units.longDuration > 1
            }
        }
    }

    OpacityAnimator {
        id: introAnimation
        running: false
        target: content
        from: 0
        to: 1
        duration: Kirigami.Units.veryLongDuration * 2
        easing.type: Easing.InOutQuad
    }
}
