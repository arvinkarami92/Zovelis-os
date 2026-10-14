// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.zovelis.welcome

PageScaffold {
    id: page

    // Read by Main.qml when the user finishes.
    property alias showAgain: showCheck.checked

    heroSource: Qt.resolvedUrl("../../images/zovelis-mark.svg")
    title: qsTr("You're all set!")
    subtitle: qsTr("A few tips to help you find your way around.")
    initialFocusItem: showCheck

    GridLayout {
        Layout.fillWidth: true
        columns: width > Theme.unit * 30 ? 2 : 1
        columnSpacing: Theme.largeSpacing
        rowSpacing: Theme.largeSpacing

        Repeater {
            model: [
                { icon: "start-here-zovelis|start-here-kde", title: qsTr("Find your apps"),
                  text: qsTr("Click the Zovelis button in the bottom-left corner, or press the Meta key, then start typing.") },
                { icon: "preferences-system", title: qsTr("Change settings"),
                  text: qsTr("System Settings in the menu has Wi-Fi, displays, sound, users and more.") },
                { icon: "system-software-update|update-none", title: qsTr("Stay up to date"),
                  text: qsTr("You'll get a notification when updates are ready. Security fixes install on their own.") },
                { icon: "system-file-manager|folder", title: qsTr("Your files"),
                  text: qsTr("Meta+E opens Files. Plugged-in USB drives show up there and in the system tray.") },
                { icon: "preferences-desktop-accessibility", title: qsTr("Accessibility"),
                  text: qsTr("Meta+Alt+S starts the screen reader. Meta+Plus and Meta+Minus zoom the screen.") },
                { icon: "help-about", title: qsTr("See this again"),
                  text: qsTr("Search for “Welcome” in the menu whenever you like.") }
            ]

            RowLayout {
                id: tip
                required property var modelData
                Layout.fillWidth: true
                Layout.preferredWidth: 1
                Layout.alignment: Qt.AlignTop
                spacing: Theme.spacing

                Image {
                    Layout.alignment: Qt.AlignTop
                    Layout.preferredWidth: Theme.smallIconSize * 1.4
                    Layout.preferredHeight: Theme.smallIconSize * 1.4
                    source: "image://icon/" + tip.modelData.icon
                    sourceSize.width: Theme.smallIconSize * 1.4
                    sourceSize.height: Theme.smallIconSize * 1.4
                    Accessible.ignored: true
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 2
                    Label {
                        Layout.fillWidth: true
                        text: tip.modelData.title
                        color: Theme.text
                        font.weight: Font.DemiBold
                        wrapMode: Text.Wrap
                    }
                    Label {
                        Layout.fillWidth: true
                        text: tip.modelData.text
                        color: Theme.secondaryText
                        wrapMode: Text.Wrap
                    }
                }
            }
        }
    }

    CheckBox {
        id: showCheck
        Layout.topMargin: Theme.spacing
        text: qsTr("Show this guide every time I sign in")
        checked: false
    }
}
