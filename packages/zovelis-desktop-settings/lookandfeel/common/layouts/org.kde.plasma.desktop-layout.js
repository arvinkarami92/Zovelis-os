// SPDX-License-Identifier: GPL-3.0-or-later
// Zovelis OS default desktop layout (Plasma desktop scripting API).
//
// Plasma runs this script the first time a user logs in (and when the user
// chooses "Use desktop layout from theme" while applying a Zovelis global
// theme). It creates one taskbar along the bottom edge, laid out the way
// people who come from Windows expect it:
//
//   [Zovelis menu] [pinned + running apps ............] [tray] [clock] [desktop]
//
// The desktop itself shows the files in ~/Desktop and the Zovelis wallpaper
// (the wallpaper comes from the global theme's defaults).

var panel = new Panel;
panel.location = "bottom";

// Tall enough for icon-only task buttons with comfortable click targets;
// rounded down to an even number like Plasma's own default panel.
panel.height = 2 * Math.floor(gridUnit * 2.5 / 2);

// On very wide screens, keep the taskbar at most as wide as a 21:9 monitor
// so the menu and the clock do not end up far apart.
var maximumAspectRatio = 21 / 9;
if (panel.formFactor === "horizontal") {
    var geo = screenGeometry(panel.screen);
    var maximumWidth = Math.ceil(geo.height * maximumAspectRatio);
    if (geo.width > maximumWidth) {
        panel.alignment = "center";
        panel.minimumLength = maximumWidth;
        panel.maximumLength = maximumWidth;
    }
}

// --- Start menu --------------------------------------------------------
var menu = panel.addWidget("org.kde.plasma.kickoff");
menu.currentConfigGroup = ["General"];
menu.writeConfig("icon", "start-here-zovelis");
// Favourites shown when the menu opens; only those that are installed.
var favoriteCandidates = [
    "preferred://browser",
    "org.kde.dolphin.desktop",
    "org.kde.discover.desktop",
    "systemsettings.desktop",
    "org.kde.kwrite.desktop",
    "org.kde.konsole.desktop",
    "org.kde.kcalc.desktop",
    "org.kde.spectacle.desktop",
    "org.zovelis.Welcome.desktop"
];
var favorites = [];
for (var i = 0; i < favoriteCandidates.length; ++i) {
    var candidate = favoriteCandidates[i];
    if (candidate.indexOf("preferred://") === 0 || applicationExists(candidate)) {
        favorites.push(candidate);
    }
}
menu.writeConfig("favorites", favorites);

// --- Task bar: pinned apps first, then open windows --------------------
var tasks = panel.addWidget("org.kde.plasma.icontasks");
tasks.currentConfigGroup = ["General"];
var launcherCandidates = [
    ["preferred://filemanager", ""],
    ["preferred://browser", ""],
    ["applications:org.kde.discover.desktop", "org.kde.discover.desktop"],
    ["applications:systemsettings.desktop", "systemsettings.desktop"]
];
var launchers = [];
for (var j = 0; j < launcherCandidates.length; ++j) {
    var launcher = launcherCandidates[j];
    if (launcher[1] === "" || applicationExists(launcher[1])) {
        launchers.push(launcher[0]);
    }
}
tasks.writeConfig("launchers", launchers);

panel.addWidget("org.kde.plasma.marginsseparator");

// Input method indicator for languages that need one (same list as Plasma's
// default panel), so that typing Chinese, Japanese, Hindi... works out of the box.
var inputMethodLanguages = ["as", "bn", "bo", "brx", "doi", "gu", "hi", "ja", "kn", "ko",
                            "kok", "ks", "lep", "mai", "ml", "mni", "mr", "ne", "or", "pa",
                            "sa", "sat", "sd", "si", "ta", "te", "th", "ur", "vi", "zh_CN",
                            "zh_TW"];
if (inputMethodLanguages.indexOf(languageId) !== -1) {
    panel.addWidget("org.kde.plasma.kimpanel");
}

// --- Notification area, clock, and "show desktop" corner ---------------
panel.addWidget("org.kde.plasma.systemtray");
var clock = panel.addWidget("org.kde.plasma.digitalclock");
clock.currentConfigGroup = ["Appearance"];
clock.writeConfig("showDate", true);
panel.addWidget("org.kde.plasma.showdesktop");

// --- Desktop ------------------------------------------------------------
var desktopsArray = desktopsForActivity(currentActivity());
for (var k = 0; k < desktopsArray.length; ++k) {
    desktopsArray[k].wallpaperPlugin = "org.kde.image";
}
