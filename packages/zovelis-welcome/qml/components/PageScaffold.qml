// SPDX-License-Identifier: GPL-3.0-or-later
// A scrollable page with a heading, an optional subtitle and centred content
// that never grows wider than a comfortable reading width.
//
// Pages declare their content as children:
//   PageScaffold { title: "…"; Label { … } }
// Those children end up in the inner column (see `content` below).
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.zovelis.welcome

ScrollView {
    id: root

    property string title
    property string subtitle
    // Optional decorative image shown above the title.
    property url heroSource
    // The item that receives keyboard focus when the page is shown.
    property Item initialFocusItem: null
    default property alias content: column.data

    function focusFirst() {
        if (initialFocusItem && initialFocusItem.visible && initialFocusItem.enabled) {
            initialFocusItem.forceActiveFocus(Qt.TabFocusReason);
        }
    }

    contentWidth: availableWidth
    contentHeight: holder.implicitHeight
    focusPolicy: Qt.NoFocus
    clip: true

    // Assigned explicitly so these items do not go through `content` above.
    contentChildren: [
        Item {
            id: holder
            width: root.availableWidth
            implicitHeight: column.implicitHeight + Theme.hugeSpacing + Theme.largeSpacing

            ColumnLayout {
                id: column
                x: Math.round((holder.width - width) / 2)
                y: Theme.hugeSpacing
                width: Math.max(0, Math.min(holder.width - 2 * Theme.largeSpacing, Theme.contentMaxWidth))
                spacing: Theme.largeSpacing

                Image {
                    visible: root.heroSource.toString().length > 0
                    source: root.heroSource
                    sourceSize.width: Theme.unit * 5
                    sourceSize.height: Theme.unit * 5
                    Layout.preferredWidth: Theme.unit * 5
                    Layout.preferredHeight: Theme.unit * 5
                    fillMode: Image.PreserveAspectFit
                    Accessible.ignored: true
                }

                Label {
                    Layout.fillWidth: true
                    text: root.title
                    color: Theme.text
                    font.pointSize: Theme.headingPointSize
                    font.weight: Font.DemiBold
                    wrapMode: Text.Wrap
                    Accessible.role: Accessible.Heading
                    Accessible.name: text
                }

                Label {
                    Layout.fillWidth: true
                    Layout.topMargin: -Theme.spacing
                    visible: root.subtitle.length > 0
                    text: root.subtitle
                    color: Theme.secondaryText
                    font.pointSize: Theme.subheadingPointSize
                    wrapMode: Text.Wrap
                }
            }
        }
    ]
}
