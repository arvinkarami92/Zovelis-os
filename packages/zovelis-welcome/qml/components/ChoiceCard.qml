// SPDX-License-Identifier: GPL-3.0-or-later
// A large, clickable card that behaves like a radio button: one card in a
// group is "checked". The owner binds `checked` to real state and reacts to
// `clicked`, so the card always shows what the system actually uses.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.zovelis.welcome

AbstractButton {
    id: root

    property string description
    property Component preview: null

    checkable: false
    hoverEnabled: true
    focusPolicy: Qt.StrongFocus
    padding: Theme.largeSpacing

    implicitWidth: Math.max(Theme.unit * 10, implicitContentWidth + leftPadding + rightPadding)
    implicitHeight: implicitContentHeight + topPadding + bottomPadding

    Accessible.role: Accessible.RadioButton
    Accessible.name: text
    Accessible.description: description
    Accessible.checkable: true
    Accessible.checked: checked
    Accessible.onPressAction: root.clicked()

    Keys.onReturnPressed: root.clicked()
    Keys.onEnterPressed: root.clicked()

    contentItem: ColumnLayout {
        spacing: Theme.spacing

        Loader {
            Layout.fillWidth: true
            Layout.preferredHeight: item ? item.implicitHeight : 0
            active: root.preview !== null
            visible: active
            sourceComponent: root.preview
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: Theme.spacing

            // Radio indicator: drawn, so it is visible in every colour scheme.
            Rectangle {
                Layout.alignment: Qt.AlignVCenter
                implicitWidth: Math.round(Theme.unit * 1.1)
                implicitHeight: implicitWidth
                radius: width / 2
                color: "transparent"
                border.width: 2
                border.color: root.checked ? Theme.accent : Theme.secondaryText

                Rectangle {
                    anchors.centerIn: parent
                    width: parent.width / 2
                    height: width
                    radius: width / 2
                    color: Theme.accent
                    visible: root.checked
                }
            }

            Label {
                Layout.fillWidth: true
                text: root.text
                color: Theme.cardText
                font.weight: Font.DemiBold
                wrapMode: Text.Wrap
            }
        }

        Label {
            Layout.fillWidth: true
            visible: root.description.length > 0
            text: root.description
            color: Theme.mix(Theme.cardText, Theme.card, 0.25)
            wrapMode: Text.Wrap
        }
    }

    background: Rectangle {
        radius: Theme.radius
        color: Theme.card
        border.width: root.checked ? 2 : 1
        border.color: root.checked ? Theme.accent
                    : root.hovered ? Theme.mix(Theme.accent, Theme.border, 0.4)
                    : Theme.border

        Behavior on border.color {
            ColorAnimation { duration: Theme.shortDuration }
        }

        // Keyboard focus ring, drawn outside the card.
        Rectangle {
            anchors.fill: parent
            anchors.margins: -4
            radius: parent.radius + 4
            color: "transparent"
            border.width: 2
            border.color: Theme.accent
            visible: root.visualFocus
        }
    }
}
