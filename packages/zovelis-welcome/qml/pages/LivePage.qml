// SPDX-License-Identifier: GPL-3.0-or-later
// Shown in the live session (booted from USB/DVD): try or install.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.zovelis.welcome

PageScaffold {
    id: page

    signal tryRequested()

    heroSource: Qt.resolvedUrl("../../images/zovelis-mark.svg")
    title: qsTr("Welcome to %1").arg(Backend.distroName)
    subtitle: qsTr("You're trying %1 without installing it. Nothing on this computer changes until you choose to install.").arg(Backend.distroName)
    initialFocusItem: Backend.installerAvailable ? installTile : tryTile

    GridLayout {
        Layout.fillWidth: true
        columns: width > Theme.unit * 26 ? 2 : 1
        columnSpacing: Theme.largeSpacing
        rowSpacing: Theme.largeSpacing

        AppTile {
            id: installTile
            Layout.fillWidth: true
            Layout.preferredWidth: 1
            visible: Backend.installerAvailable
            text: qsTr("Install %1").arg(Backend.distroName)
            description: qsTr("Set it up on this computer. Takes about 15 minutes.")
            iconName: "zovelis-installer|system-software-install"
            hint: qsTr("Opens the installer.")
            onClicked: Backend.startInstaller()
        }
        AppTile {
            id: tryTile
            Layout.fillWidth: true
            Layout.preferredWidth: 1
            text: qsTr("Keep trying")
            description: qsTr("Explore first. The installer is on the desktop when you're ready.")
            iconName: "zovelis|start-here-kde"
            hint: qsTr("Closes this window.")
            onClicked: page.tryRequested()
        }
    }

    Label {
        Layout.fillWidth: true
        text: qsTr("Tip: connect to the internet first using the network icon in the bottom-right corner, so the installer can set the right time zone.")
        color: Theme.secondaryText
        wrapMode: Text.Wrap
    }

    Button {
        text: qsTr("Accessibility options…")
        icon.name: "preferences-desktop-accessibility"
        onClicked: Backend.openSettings("kcm_access")
    }
}
