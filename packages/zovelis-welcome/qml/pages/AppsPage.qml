// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.zovelis.welcome

PageScaffold {
    id: page

    // Flathub application IDs. Activating a tile opens its page in Discover.
    readonly property var apps: [
        { id: "org.libreoffice.LibreOffice", name: "LibreOffice", icon: "libreoffice-startcenter|applications-office",
          description: qsTr("Documents, spreadsheets and presentations") },
        { id: "org.mozilla.Thunderbird", name: "Thunderbird", icon: "thunderbird|internet-mail",
          description: qsTr("Email and calendar") },
        { id: "org.videolan.VLC", name: "VLC", icon: "vlc|applications-multimedia",
          description: qsTr("Plays almost any video or music file") },
        { id: "org.gimp.GIMP", name: "GIMP", icon: "gimp|applications-graphics",
          description: qsTr("Photo editing") },
        { id: "org.kde.krita", name: "Krita", icon: "krita|applications-graphics",
          description: qsTr("Drawing and digital painting") },
        { id: "org.kde.kdenlive", name: "Kdenlive", icon: "kdenlive|applications-multimedia",
          description: qsTr("Video editing") },
        { id: "com.obsproject.Studio", name: "OBS Studio", icon: "com.obsproject.Studio|camera-video",
          description: qsTr("Screen recording and streaming") },
        { id: "com.valvesoftware.Steam", name: "Steam", icon: "steam|applications-games",
          description: qsTr("Games") }
    ]

    title: qsTr("Get your apps")
    subtitle: qsTr("The Software Center has thousands of free apps. It keeps them up to date for you, too.")
    initialFocusItem: storeButton

    Button {
        id: storeButton
        text: qsTr("Open the Software Center")
        icon.name: "plasmadiscover"
        highlighted: true
        onClicked: Backend.openSoftwareCenter()
    }

    Label {
        Layout.fillWidth: true
        Layout.topMargin: Theme.spacing
        text: qsTr("Popular apps")
        color: Theme.text
        font.weight: Font.DemiBold
        font.pointSize: Theme.subheadingPointSize
        Accessible.role: Accessible.Heading
        Accessible.name: text
    }

    GridLayout {
        Layout.fillWidth: true
        columns: Math.max(1, Math.floor((width + columnSpacing) / (Theme.unit * 14 + columnSpacing)))
        columnSpacing: Theme.spacing
        rowSpacing: Theme.spacing

        Repeater {
            model: page.apps

            AppTile {
                required property var modelData
                Layout.fillWidth: true
                Layout.preferredWidth: 1
                text: modelData.name
                description: modelData.description
                iconName: modelData.icon
                appId: modelData.id
                onClicked: Backend.openApp(appId)
            }
        }
    }

    Label {
        Layout.fillWidth: true
        text: qsTr("Already included: Firefox web browser, Files, Terminal, text editor, image and PDF viewers, media player, calculator and screenshot tool.")
        color: Theme.secondaryText
        wrapMode: Text.Wrap
    }
}
