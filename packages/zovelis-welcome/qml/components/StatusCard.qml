// SPDX-License-Identifier: GPL-3.0-or-later
// A card that reports the state of one protection (firewall, updates, …)
// with a coloured status label and optional controls on the right/below.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.zovelis.welcome

Control {
    id: root

    property string iconName
    property string title
    property string description
    property string status
    // "positive", "negative", "neutral" or "" (plain text colour).
    property string statusKind: ""
    default property alias actions: actionFlow.data

    padding: Theme.largeSpacing
    Accessible.role: Accessible.Grouping
    Accessible.name: status.length > 0 ? title + ", " + status : title
    Accessible.description: description

    readonly property color statusColor: statusKind === "positive" ? Theme.positive
                                       : statusKind === "negative" ? Theme.negative
                                       : statusKind === "neutral" ? Theme.neutral
                                       : Theme.cardText

    background: Rectangle {
        radius: Theme.radius
        color: Theme.card
        border.width: 1
        border.color: Theme.border
    }

    contentItem: RowLayout {
        spacing: Theme.largeSpacing

        Image {
            Layout.alignment: Qt.AlignTop
            Layout.preferredWidth: Theme.iconSize
            Layout.preferredHeight: Theme.iconSize
            visible: root.iconName.length > 0
            source: root.iconName.length > 0 ? "image://icon/" + root.iconName : ""
            sourceSize.width: Theme.iconSize
            sourceSize.height: Theme.iconSize
            fillMode: Image.PreserveAspectFit
            Accessible.ignored: true
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: Theme.smallSpacing

            Flow {
                Layout.fillWidth: true
                spacing: Theme.spacing

                Label {
                    text: root.title
                    color: Theme.cardText
                    font.weight: Font.DemiBold
                    font.pointSize: Theme.subheadingPointSize
                }
                Label {
                    visible: root.status.length > 0
                    text: root.status
                    color: root.statusColor
                    font.weight: Font.DemiBold
                    font.pointSize: Theme.subheadingPointSize
                }
            }

            Label {
                Layout.fillWidth: true
                visible: root.description.length > 0
                text: root.description
                color: Theme.mix(Theme.cardText, Theme.card, 0.25)
                wrapMode: Text.Wrap
            }

            Flow {
                id: actionFlow
                Layout.fillWidth: true
                Layout.topMargin: children.length > 0 ? Theme.smallSpacing : 0
                spacing: Theme.spacing
            }
        }
    }
}
