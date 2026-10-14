// SPDX-License-Identifier: GPL-3.0-or-later
// A suggested application. Activating it opens the app's page in the
// Software Center, where the user can read about it and install it.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.zovelis.welcome

AbstractButton {
    id: root

    property string appId
    property string iconName
    property string description
    // Extra sentence for screen readers describing what activation does.
    property string hint: qsTr("Opens in the Software Center.")

    hoverEnabled: true
    focusPolicy: Qt.StrongFocus
    padding: Theme.spacing + Theme.smallSpacing

    implicitWidth: Theme.unit * 13
    implicitHeight: implicitContentHeight + topPadding + bottomPadding

    Accessible.role: Accessible.Button
    Accessible.name: text
    Accessible.description: hint.length > 0 ? description + ". " + hint : description
    Accessible.onPressAction: root.clicked()

    Keys.onReturnPressed: root.clicked()
    Keys.onEnterPressed: root.clicked()

    contentItem: RowLayout {
        spacing: Theme.spacing

        Image {
            Layout.alignment: Qt.AlignTop
            Layout.preferredWidth: Theme.smallIconSize * 1.4
            Layout.preferredHeight: Theme.smallIconSize * 1.4
            source: root.iconName.length > 0 ? "image://icon/" + root.iconName : ""
            sourceSize.width: Theme.smallIconSize * 1.4
            sourceSize.height: Theme.smallIconSize * 1.4
            fillMode: Image.PreserveAspectFit
            Accessible.ignored: true
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 2

            Label {
                Layout.fillWidth: true
                text: root.text
                color: Theme.cardText
                font.weight: Font.DemiBold
                elide: Text.ElideRight
            }
            Label {
                Layout.fillWidth: true
                text: root.description
                color: Theme.mix(Theme.cardText, Theme.card, 0.25)
                wrapMode: Text.Wrap
                maximumLineCount: 2
                elide: Text.ElideRight
            }
        }
    }

    background: Rectangle {
        radius: Theme.radius
        color: root.down ? Theme.mix(Theme.card, Theme.accent, 0.12)
             : root.hovered ? Theme.mix(Theme.card, Theme.accent, 0.06)
             : Theme.card
        border.width: 1
        border.color: root.hovered ? Theme.mix(Theme.accent, Theme.border, 0.4) : Theme.border

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
