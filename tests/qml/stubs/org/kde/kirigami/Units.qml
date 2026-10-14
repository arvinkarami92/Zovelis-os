// Test stand-in for Kirigami.Units (only what Zovelis QML uses).
pragma Singleton
import QtQuick
QtObject {
    readonly property int gridUnit: 18
    readonly property int shortDuration: 100
    readonly property int longDuration: 200
    readonly property int veryLongDuration: 400
}
