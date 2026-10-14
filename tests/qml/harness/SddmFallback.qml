// Loads the Zovelis login theme with stand-ins for the objects SDDM
// provides, on a system without the Breeze login screen, to check that the
// fallback login form appears and works.
import QtQuick

Item {
    id: harness
    width: 1024
    height: 768

    property QtObject sddm: QtObject {
        property bool canReboot: true
        property bool canPowerOff: true
        property string lastLogin: ""
        signal loginFailed()
        function login(user, password, session) { harness.sddm.lastLogin = user; harness.sddm.loginFailed(); }
        function reboot() {}
        function powerOff() {}
    }
    property QtObject userModel: QtObject { property string lastUser: "alex" }
    property QtObject sessionModel: QtObject { property int lastIndex: 0 }
    property QtObject config: QtObject { property string background: "" }
    property string themePath

    Loader {
        anchors.fill: parent
        source: harness.themePath
    }
}
