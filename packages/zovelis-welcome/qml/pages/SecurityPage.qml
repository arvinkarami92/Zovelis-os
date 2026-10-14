// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.zovelis.welcome

PageScaffold {
    id: page

    title: qsTr("Security and updates")
    subtitle: qsTr("%1 protects you out of the box. Here is what is switched on.").arg(Backend.distroName)
    initialFocusItem: updatesSwitch.enabled ? updatesSwitch : firewallButton

    // Errors from the last action, e.g. a cancelled password prompt.
    Rectangle {
        Layout.fillWidth: true
        visible: Backend.errorMessage.length > 0
        implicitHeight: errorRow.implicitHeight + 2 * Theme.spacing
        radius: Theme.radius
        color: Theme.mix(Theme.card, Theme.negative, 0.12)
        border.width: 1
        border.color: Theme.negative
        Accessible.role: Accessible.AlertMessage
        Accessible.name: Backend.errorMessage

        RowLayout {
            id: errorRow
            anchors.fill: parent
            anchors.margins: Theme.spacing
            spacing: Theme.spacing

            Label {
                Layout.fillWidth: true
                text: Backend.errorMessage
                color: Theme.cardText
                wrapMode: Text.Wrap
            }
            Button {
                text: qsTr("Dismiss")
                flat: true
                onClicked: Backend.clearError()
            }
        }
    }

    StatusCard {
        Layout.fillWidth: true
        iconName: "security-high"
        title: qsTr("Firewall")
        status: Backend.firewallEnabled ? qsTr("On") : qsTr("Off")
        statusKind: Backend.firewallEnabled ? "positive" : "negative"
        description: Backend.firewallEnabled
                     ? qsTr("Blocks unexpected connections from other computers. Your apps can still reach the internet.")
                     : qsTr("The firewall is off. Turn it on to block unexpected connections from other computers.")

        Button {
            id: firewallButton
            text: qsTr("Firewall settings…")
            onClicked: Backend.openSettings("kcm_firewall")
        }
    }

    StatusCard {
        Layout.fillWidth: true
        iconName: "system-software-update|update-none"
        title: qsTr("Automatic security updates")
        status: !Backend.autoUpdatesAvailable ? qsTr("Not available")
              : Backend.autoUpdatesEnabled ? qsTr("On") : qsTr("Off")
        statusKind: !Backend.autoUpdatesAvailable ? "neutral" : (Backend.autoUpdatesEnabled ? "positive" : "negative")
        description: qsTr("Security fixes are downloaded and installed in the background every day. Other updates are offered in the Software Center.")

        RowLayout {
            spacing: Theme.spacing

            Switch {
                id: updatesSwitch
                text: qsTr("Install security updates automatically")
                enabled: Backend.autoUpdatesAvailable && !Backend.busy
                checked: Backend.autoUpdatesEnabled
                onToggled: {
                    const wanted = checked;
                    // Show the real state until the change has been confirmed.
                    checked = Qt.binding(() => Backend.autoUpdatesEnabled);
                    Backend.setAutoUpdates(wanted);
                }
            }
            BusyIndicator {
                running: Backend.busy
                visible: running
                implicitWidth: Theme.unit * 1.5
                implicitHeight: Theme.unit * 1.5
                Accessible.name: qsTr("Waiting for permission")
            }
        }
        Button {
            text: qsTr("Check for updates now")
            onClicked: Backend.openUpdates()
        }
    }

    StatusCard {
        Layout.fillWidth: true
        iconName: "object-locked|security-medium"
        title: qsTr("App sandboxing")
        status: Backend.flatpakAvailable ? qsTr("On") : qsTr("Not available")
        statusKind: Backend.flatpakAvailable ? "positive" : "neutral"
        description: qsTr("Apps installed from Flathub run in a sandbox. They can only use your files, camera or microphone when you allow it.")

        Button {
            visible: Backend.flatpakAvailable
            text: qsTr("App permissions…")
            onClicked: Backend.openSettings("kcm_flatpak")
        }
    }
}
