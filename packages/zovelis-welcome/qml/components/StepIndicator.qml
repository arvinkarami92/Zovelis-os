// SPDX-License-Identifier: GPL-3.0-or-later
// Shows where the user is in the setup ("Step 2 of 5"). On narrow windows
// only the current step's name is shown.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.zovelis.welcome

Item {
    id: root

    property var steps: []
    property int current: 0
    readonly property bool compact: width < Theme.unit * 34

    implicitHeight: Theme.unit * 2.4
    Accessible.role: Accessible.StaticText
    Accessible.name: qsTr("Step %1 of %2: %3").arg(current + 1).arg(steps.length).arg(steps[current] || "")

    RowLayout {
        anchors.centerIn: parent
        spacing: Theme.spacing
        visible: !root.compact

        Repeater {
            model: root.steps

            RowLayout {
                id: step
                required property int index
                required property string modelData
                readonly property bool done: index < root.current
                readonly property bool active: index === root.current
                spacing: Theme.smallSpacing

                Rectangle {
                    implicitWidth: Math.round(Theme.unit * 1.3)
                    implicitHeight: implicitWidth
                    radius: width / 2
                    color: step.active || step.done ? Theme.accent : "transparent"
                    border.width: step.active || step.done ? 0 : 2
                    border.color: Theme.secondaryText

                    Label {
                        anchors.centerIn: parent
                        text: step.done ? "✓" : String(step.index + 1)
                        color: step.active || step.done ? Theme.accentText : Theme.secondaryText
                        font.pointSize: Math.max(7, Theme.basePointSize * 0.85)
                        font.weight: Font.DemiBold
                    }
                }
                Label {
                    text: step.modelData
                    color: step.active ? Theme.text : Theme.secondaryText
                    font.weight: step.active ? Font.DemiBold : Font.Normal
                }
                Rectangle {
                    visible: step.index < root.steps.length - 1
                    implicitWidth: Theme.unit * 1.2
                    implicitHeight: 2
                    color: Theme.border
                }
            }
        }
    }

    Label {
        anchors.centerIn: parent
        visible: root.compact
        text: qsTr("Step %1 of %2 · %3").arg(root.current + 1).arg(root.steps.length).arg(root.steps[root.current] || "")
        color: Theme.text
        font.weight: Font.DemiBold
    }
}
