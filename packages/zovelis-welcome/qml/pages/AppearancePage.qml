// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.zovelis.welcome

PageScaffold {
    id: page

    title: qsTr("Choose your look")
    subtitle: qsTr("Pick a style and a text size that feel comfortable. Changes apply right away.")
    initialFocusItem: lightCard

    Label {
        Layout.fillWidth: true
        text: qsTr("Style")
        color: Theme.text
        font.weight: Font.DemiBold
        font.pointSize: Theme.subheadingPointSize
        Accessible.role: Accessible.Heading
        Accessible.name: text
    }

    GridLayout {
        Layout.fillWidth: true
        columns: width > Theme.unit * 24 ? 2 : 1
        columnSpacing: Theme.largeSpacing
        rowSpacing: Theme.largeSpacing

        ChoiceCard {
            id: lightCard
            Layout.fillWidth: true
            Layout.preferredWidth: 1
            text: qsTr("Light")
            description: qsTr("Bright and clear. Good for well-lit rooms.")
            checked: Backend.themeVariant === "light"
            preview: Component { ThemePreview { dark: false } }
            onClicked: Backend.applyTheme("light")
        }
        ChoiceCard {
            Layout.fillWidth: true
            Layout.preferredWidth: 1
            text: qsTr("Dark")
            description: qsTr("Easier on the eyes in dim light and at night.")
            checked: Backend.themeVariant === "dark"
            preview: Component { ThemePreview { dark: true } }
            onClicked: Backend.applyTheme("dark")
        }
    }

    Label {
        Layout.fillWidth: true
        Layout.topMargin: Theme.spacing
        text: qsTr("Text size")
        color: Theme.text
        font.weight: Font.DemiBold
        font.pointSize: Theme.subheadingPointSize
        Accessible.role: Accessible.Heading
        Accessible.name: text
    }

    GridLayout {
        Layout.fillWidth: true
        columns: width > Theme.unit * 30 ? 3 : 1
        columnSpacing: Theme.largeSpacing
        rowSpacing: Theme.largeSpacing

        Repeater {
            model: [
                { label: qsTr("Default"), description: qsTr("Standard size"), scale: 1.0 },
                { label: qsTr("Large"), description: qsTr("A little bigger"), scale: 1.2 },
                { label: qsTr("Larger"), description: qsTr("Easiest to read"), scale: 1.4 }
            ]

            ChoiceCard {
                id: sizeCard
                required property var modelData
                required property int index
                Layout.fillWidth: true
                Layout.preferredWidth: 1
                text: modelData.label
                description: modelData.description
                checked: Backend.textSize === index
                onClicked: Backend.setTextSize(index)
                preview: Component {
                    Label {
                        text: "Aa"
                        color: Theme.cardText
                        horizontalAlignment: Text.AlignHCenter
                        font.pointSize: Math.round(Theme.basePointSize * 2 * sizeCard.modelData.scale)
                        Accessible.ignored: true
                    }
                }
            }
        }
    }

    Label {
        Layout.fillWidth: true
        text: qsTr("Some apps switch to the new text size the next time you open them.")
        color: Theme.secondaryText
        wrapMode: Text.Wrap
    }

    Label {
        Layout.fillWidth: true
        Layout.topMargin: Theme.spacing
        text: qsTr("Accessibility")
        color: Theme.text
        font.weight: Font.DemiBold
        font.pointSize: Theme.subheadingPointSize
        Accessible.role: Accessible.Heading
        Accessible.name: text
    }

    Label {
        Layout.fillWidth: true
        text: qsTr("Press Meta+Alt+S to turn the screen reader on or off, and Meta+Plus or Meta+Minus to zoom. Meta is the key with the Windows logo.")
        color: Theme.text
        wrapMode: Text.Wrap
    }

    Button {
        text: qsTr("More accessibility options…")
        icon.name: "preferences-desktop-accessibility"
        onClicked: Backend.openSettings("kcm_access")
    }
}
