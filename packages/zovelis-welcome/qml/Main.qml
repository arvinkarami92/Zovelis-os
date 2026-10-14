// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window
import org.zovelis.welcome

ApplicationWindow {
    id: window

    readonly property bool live: Backend.liveSession
    readonly property var stepNames: live ? [qsTr("Welcome")]
                                          : [qsTr("Welcome"), qsTr("Appearance"), qsTr("Security"), qsTr("Apps"), qsTr("Done")]
    property int currentIndex: 0
    readonly property var pages: live ? [livePage] : [welcomePage, appearancePage, securityPage, appsPage, donePage]
    readonly property int pageCount: pages.length
    readonly property bool lastPage: currentIndex === pageCount - 1
    property bool finished: false

    // Used by the screenshot/self-test mode in main.cpp.
    function pageName(index) {
        return stepNames[index] || "";
    }
    function pageItem(index) {
        return index === currentIndex ? pageLoader.item : null;
    }
    function goNext() {
        if (lastPage) {
            finish();
        } else {
            currentIndex = currentIndex + 1;
        }
    }
    function goBack() {
        if (currentIndex > 0) {
            currentIndex = currentIndex - 1;
        }
    }
    function finish() {
        const done = pageItem(pageCount - 1);
        Backend.showAtLogin = (done && done.showAgain !== undefined) ? done.showAgain : false;
        finished = true;
        Backend.finish();
        close();
    }
    function focusCurrentPage() {
        const page = pageItem(currentIndex);
        if (page && page.initialFocusItem) {
            page.focusFirst();
        } else {
            nextButton.forceActiveFocus(Qt.TabFocusReason);
        }
    }

    title: qsTr("Welcome to %1").arg(Backend.distroName)
    width: Math.min(Theme.unit * 50, Screen.desktopAvailableWidth > 0 ? Screen.desktopAvailableWidth * 0.95 : 900)
    height: Math.min(Theme.unit * 37, Screen.desktopAvailableHeight > 0 ? Screen.desktopAvailableHeight * 0.92 : 660)
    minimumWidth: Theme.unit * 24
    minimumHeight: Theme.unit * 22
    visible: true
    color: Theme.window

    // Hand the system colours to every control explicitly. Inside Plasma the
    // controls already get them from the desktop style; elsewhere (other
    // desktops, the test-suite) some styles would otherwise fall back to
    // their own built-in light palette and draw dark text on a dark window.
    palette.window: Theme.palette.window
    palette.windowText: Theme.palette.windowText
    palette.base: Theme.palette.base
    palette.alternateBase: Theme.palette.alternateBase
    palette.text: Theme.palette.text
    palette.button: Theme.palette.button
    palette.buttonText: Theme.palette.buttonText
    palette.highlight: Theme.palette.highlight
    palette.highlightedText: Theme.palette.highlightedText
    palette.placeholderText: Theme.palette.placeholderText
    palette.light: Theme.palette.light
    palette.midlight: Theme.palette.midlight
    palette.mid: Theme.palette.mid
    palette.dark: Theme.palette.dark
    palette.shadow: Theme.palette.shadow

    onCurrentIndexChanged: {
        fadeIn.restart();
        Qt.callLater(focusCurrentPage);
    }
    Component.onCompleted: Qt.callLater(focusCurrentPage)

    onClosing: {
        // Closing early counts as "don't show this again"; it stays in the menu.
        if (!finished && !live) {
            Backend.showAtLogin = false;
            Backend.finish();
        }
    }

    Shortcut {
        sequences: [StandardKey.Forward]
        enabled: !window.live
        onActivated: window.goNext()
    }
    Shortcut {
        sequences: [StandardKey.Back]
        onActivated: window.goBack()
    }
    Shortcut {
        sequences: [StandardKey.Quit, StandardKey.Close]
        onActivated: window.close()
    }

    header: Pane {
        visible: !window.live
        padding: Theme.spacing
        background: Rectangle {
            color: Theme.window
            Rectangle {
                anchors.bottom: parent.bottom
                width: parent.width
                height: 1
                color: Theme.border
            }
        }
        contentItem: StepIndicator {
            steps: window.stepNames
            current: window.currentIndex
        }
    }

    // One page at a time; pages keep their state in Backend, so recreating
    // them when navigating is cheap and keeps memory use low.
    Loader {
        id: pageLoader
        anchors.fill: parent
        sourceComponent: window.pages[window.currentIndex] || null

        NumberAnimation {
            id: fadeIn
            target: pageLoader
            property: "opacity"
            from: 0.0
            to: 1.0
            duration: Theme.longDuration
            easing.type: Easing.OutCubic
        }
    }

    Component { id: welcomePage; WelcomePage {} }
    Component { id: appearancePage; AppearancePage {} }
    Component { id: securityPage; SecurityPage {} }
    Component { id: appsPage; AppsPage {} }
    Component { id: donePage; DonePage {} }
    Component {
        id: livePage
        LivePage {
            onTryRequested: window.close()
        }
    }

    footer: Pane {
        padding: Theme.spacing
        leftPadding: Theme.largeSpacing
        rightPadding: Theme.largeSpacing
        background: Rectangle {
            color: Theme.window
            Rectangle {
                width: parent.width
                height: 1
                color: Theme.border
            }
        }

        contentItem: RowLayout {
            spacing: Theme.spacing

            Button {
                id: backButton
                visible: window.currentIndex > 0
                text: qsTr("Back")
                icon.name: "go-previous"
                onClicked: window.goBack()
            }
            Button {
                visible: !window.live && window.currentIndex === 0
                text: qsTr("Skip setup")
                flat: true
                onClicked: window.finish()
            }
            Item {
                Layout.fillWidth: true
            }
            Button {
                id: nextButton
                highlighted: true
                text: window.live ? qsTr("Close")
                    : window.lastPage ? qsTr("Start using %1").arg(Backend.distroName)
                    : window.currentIndex === 0 ? qsTr("Get started")
                    : qsTr("Next")
                icon.name: (window.live || window.lastPage) ? "" : "go-next"
                onClicked: window.live ? window.close() : window.goNext()
            }
        }
    }
}
