// SPDX-License-Identifier: GPL-3.0-or-later
// Runs the Zovelis desktop layout script against a stand-in for Plasma's
// desktop scripting API and checks the resulting taskbar. Catches typos in
// widget names, wrong configuration groups and script errors before an ISO
// is built.
//
//   node tests/plasma/layout-test.js packages/zovelis-desktop-settings/lookandfeel/common/layouts/org.kde.plasma.desktop-layout.js
"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const scriptPath = process.argv[2];
const source = fs.readFileSync(scriptPath, "utf8");

// Widgets that exist in Plasma 6.3 (plasma-desktop / plasma-workspace).
const knownWidgets = new Set([
    "org.kde.plasma.kickoff", "org.kde.plasma.icontasks", "org.kde.plasma.taskmanager",
    "org.kde.plasma.marginsseparator", "org.kde.plasma.systemtray", "org.kde.plasma.digitalclock",
    "org.kde.plasma.showdesktop", "org.kde.plasma.kimpanel", "org.kde.plasma.pager",
]);
// Configuration groups each widget reads (from their config/main.xml).
const configGroups = {
    "org.kde.plasma.kickoff": ["General"],
    "org.kde.plasma.icontasks": ["General"],
    "org.kde.plasma.digitalclock": ["Appearance"],
};
const installedApps = new Set([
    "org.kde.dolphin.desktop", "org.kde.discover.desktop", "systemsettings.desktop",
    "org.kde.kwrite.desktop", "org.kde.konsole.desktop", "org.kde.kcalc.desktop",
    "org.kde.spectacle.desktop", "org.zovelis.Welcome.desktop",
]);

function makeWidget(type) {
    const widget = { type, config: {}, currentConfigGroup: [] };
    widget.writeConfig = (key, value) => {
        const group = widget.currentConfigGroup.join("/");
        assert.ok(group, `${type}: writeConfig("${key}") without a config group`);
        const allowed = configGroups[type];
        assert.ok(allowed && allowed.includes(group), `${type}: unexpected config group "${group}"`);
        widget.config[`${group}/${key}`] = value;
    };
    return widget;
}

const panels = [];
function Panel() {
    this.widgets = [];
    this.location = "top";
    this.formFactor = "horizontal";
    this.screen = 0;
    this.addWidget = (name) => {
        assert.ok(knownWidgets.has(name), `unknown widget ${name}`);
        const w = makeWidget(name);
        this.widgets.push(w);
        return w;
    };
    panels.push(this);
}

function run(language, screen) {
    panels.length = 0;
    const desktops = [{ wallpaperPlugin: "" }, { wallpaperPlugin: "" }];
    const context = {
        Panel, gridUnit: 18, languageId: language,
        screenGeometry: () => screen,
        applicationExists: (name) => installedApps.has(name),
        desktopsForActivity: () => desktops,
        currentActivity: () => "activity-1",
        console,
    };
    vm.runInNewContext(source, context, { filename: scriptPath });
    return { panels: panels.slice(), desktops };
}

let failures = 0;
function test(name, fn) {
    try { fn(); console.log(`ok:   ${name}`); }
    catch (e) { failures++; console.log(`FAIL: ${name}\n      ${e.message}`); }
}

test("one taskbar at the bottom, Windows-like order", () => {
    const { panels: [panel], desktops } = run("en_US", { x: 0, y: 0, width: 1920, height: 1080 });
    assert.strictEqual(panels.length, 1);
    assert.strictEqual(panel.location, "bottom");
    assert.deepStrictEqual(panel.widgets.map(w => w.type), [
        "org.kde.plasma.kickoff", "org.kde.plasma.icontasks", "org.kde.plasma.marginsseparator",
        "org.kde.plasma.systemtray", "org.kde.plasma.digitalclock", "org.kde.plasma.showdesktop"]);
    assert.ok(panel.height >= 40 && panel.height % 2 === 0, `panel height ${panel.height}`);
    assert.ok(desktops.every(d => d.wallpaperPlugin === "org.kde.image"));
});

test("Zovelis menu icon and favourites that exist", () => {
    const { panels: [panel] } = run("en_US", { x: 0, y: 0, width: 1920, height: 1080 });
    const menu = panel.widgets[0];
    assert.strictEqual(menu.config["General/icon"], "start-here-zovelis");
    const favs = menu.config["General/favorites"];
    assert.ok(favs.includes("preferred://browser"));
    for (const f of favs) {
        assert.ok(f.startsWith("preferred://") || installedApps.has(f), `favourite ${f} not installed`);
    }
});

test("pinned apps: files, browser, software center, settings", () => {
    const { panels: [panel] } = run("en_US", { x: 0, y: 0, width: 1920, height: 1080 });
    // (Arrays from the script's own context: compare by value.)
    assert.deepStrictEqual(Array.from(panel.widgets[1].config["General/launchers"]), [
        "preferred://filemanager", "preferred://browser",
        "applications:org.kde.discover.desktop", "applications:systemsettings.desktop"]);
});

test("clock shows the date", () => {
    const { panels: [panel] } = run("en_US", { x: 0, y: 0, width: 1920, height: 1080 });
    assert.strictEqual(panel.widgets[4].config["Appearance/showDate"], true);
});

test("input method indicator for Japanese", () => {
    const { panels: [panel] } = run("ja", { x: 0, y: 0, width: 1920, height: 1080 });
    assert.ok(panel.widgets.some(w => w.type === "org.kde.plasma.kimpanel"));
});

test("ultra-wide screens get a centred taskbar", () => {
    const { panels: [panel] } = run("en_US", { x: 0, y: 0, width: 5120, height: 1440 });
    assert.strictEqual(panel.alignment, "center");
    assert.strictEqual(panel.maximumLength, Math.ceil(1440 * 21 / 9));
});

test("normal screens keep the full-width taskbar", () => {
    const { panels: [panel] } = run("en_US", { x: 0, y: 0, width: 1366, height: 768 });
    assert.strictEqual(panel.alignment, undefined);
});

if (failures) {
    console.log(`${failures} layout test(s) failed`);
    process.exit(1);
}
console.log("all layout tests passed");
