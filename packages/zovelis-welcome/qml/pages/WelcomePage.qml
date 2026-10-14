// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.zovelis.welcome

PageScaffold {
    id: page

    heroSource: Qt.resolvedUrl("../../images/zovelis-mark.svg")
    title: qsTr("Welcome to %1").arg(Backend.distroName)
    subtitle: qsTr("Let's get your computer ready. It only takes a minute, and you can change everything later in System Settings.")

    Label {
        Layout.fillWidth: true
        text: qsTr("In the next steps you can:")
        color: Theme.text
        wrapMode: Text.Wrap
    }

    Repeater {
        model: [
            { icon: "preferences-desktop-theme-global|preferences-desktop-theme",
              text: qsTr("Choose a light or dark look and a comfortable text size") },
            { icon: "security-high",
              text: qsTr("Check that your firewall and automatic security updates are on") },
            { icon: "plasmadiscover|system-software-install",
              text: qsTr("Find apps to install from the Software Center") }
        ]

        RowLayout {
            id: row
            required property var modelData
            Layout.fillWidth: true
            spacing: Theme.spacing

            Image {
                Layout.preferredWidth: Theme.smallIconSize
                Layout.preferredHeight: Theme.smallIconSize
                source: "image://icon/" + row.modelData.icon
                sourceSize.width: Theme.smallIconSize
                sourceSize.height: Theme.smallIconSize
                Accessible.ignored: true
            }
            Label {
                Layout.fillWidth: true
                text: row.modelData.text
                color: Theme.text
                wrapMode: Text.Wrap
            }
        }
    }
}
