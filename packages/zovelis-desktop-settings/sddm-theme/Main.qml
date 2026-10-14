// SPDX-License-Identifier: GPL-3.0-or-later
// Zovelis OS login screen.
//
// This is Plasma's Breeze login screen, loaded from its own directory so it
// always matches the installed Plasma version, with the Zovelis background
// and logo set in theme.conf next to this file (SDDM hands those settings to
// Breeze as `config`).
//
// If the Breeze login screen cannot be loaded (for example because it was
// removed), a plain fallback form is shown instead, so nobody is ever locked
// out of their computer by a broken theme.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root

    width: 1600
    height: 900

    Loader {
        id: breeze
        anchors.fill: parent
        focus: true
        source: "file:///usr/share/sddm/themes/breeze/Main.qml"
        onStatusChanged: {
            if (status === Loader.Error) {
                console.warn("Zovelis login: Breeze login screen not available, using the fallback form");
                sourceComponent = fallback;
            }
        }
    }

    Component {
        id: fallback

        Rectangle {
            color: "#071726"
            focus: true

            ColumnLayout {
                anchors.centerIn: parent
                width: Math.min(parent.width - 48, 360)
                spacing: 12

                Label {
                    Layout.fillWidth: true
                    text: "Zovelis OS"
                    color: "#ffffff"
                    font.pointSize: 22
                    horizontalAlignment: Text.AlignHCenter
                }
                TextField {
                    id: userField
                    Layout.fillWidth: true
                    placeholderText: "User name"
                    text: userModel.lastUser
                    Accessible.name: "User name"
                    onAccepted: passwordField.forceActiveFocus()
                }
                TextField {
                    id: passwordField
                    Layout.fillWidth: true
                    placeholderText: "Password"
                    echoMode: TextInput.Password
                    focus: true
                    Accessible.name: "Password"
                    onAccepted: sddm.login(userField.text, passwordField.text, sessionModel.lastIndex)
                }
                Button {
                    Layout.fillWidth: true
                    text: "Log in"
                    onClicked: sddm.login(userField.text, passwordField.text, sessionModel.lastIndex)
                }
                Label {
                    id: message
                    Layout.fillWidth: true
                    color: "#ffb4ab"
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.Wrap
                }
                RowLayout {
                    Layout.alignment: Qt.AlignHCenter
                    Button {
                        text: "Restart"
                        enabled: sddm.canReboot
                        onClicked: sddm.reboot()
                    }
                    Button {
                        text: "Shut down"
                        enabled: sddm.canPowerOff
                        onClicked: sddm.powerOff()
                    }
                }
            }

            Connections {
                target: sddm
                function onLoginFailed() {
                    message.text = "Login failed. Check the user name and password.";
                    passwordField.selectAll();
                    passwordField.forceActiveFocus();
                }
            }
        }
    }
}
