#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Zovelis OS static checks and unit tests. Runs everything that does not
# need a built ISO: syntax and lint checks, cross-package consistency,
# colour contrast, polkit rule and desktop layout tests, the Welcome app's
# unit and UI tests, renders of the installer slideshow, the splash screen
# and the login-screen fallback, the installer helper script tests and the
# trust checks of the build-chroot helper.
#
#   tests/run-static-checks.sh            (from the repository root)
#
# Optional tools are used when present (shellcheck, desktop-file-validate,
# appstreamcli, Qt 6 with Qt Quick, node). Set QT_PREFIX to use a Qt that is
# not installed system-wide (its bin/ must contain qt-cmake).
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
OUT=${ZOVELIS_TEST_OUT:-$ROOT/build/test-results}
rm -rf "$OUT"
mkdir -p "$OUT"

passed=0
failed=0
skipped=0
step() {
    name=$1
    shift
    log="$OUT/$(echo "$name" | tr ' /' '__').log"
    if "$@" >"$log" 2>&1; then
        if grep -q '^SKIP' "$log"; then
            echo "SKIP  $name ($(grep -m1 '^SKIP' "$log"))"
            skipped=$((skipped + 1))
        else
            echo "PASS  $name"
            passed=$((passed + 1))
        fi
    else
        echo "FAIL  $name (log: $log)"
        sed 's/^/      /' "$log" | tail -n 25
        failed=$((failed + 1))
    fi
}
have() { command -v "$1" >/dev/null 2>&1; }

shell_scripts() {
    grep -rlE '^#!/bin/(ba)?sh' packages scripts tests live-build branding 2>/dev/null | sort -u
}

check_shell_syntax() {
    rc=0
    for f in $(shell_scripts); do
        sh -n "$f" || { echo "syntax error: $f"; rc=1; }
    done
    return $rc
}

check_shellcheck() {
    if ! have shellcheck; then echo "SKIP: shellcheck not installed"; return 0; fi
    # SC2016: dpkg-query/format strings are meant literally.
    # shellcheck disable=SC2046
    shellcheck -x -S info -e SC2016,SC2012,SC2013,SC2015 $(shell_scripts)
}

check_python() {
    find branding tests scripts -name '*.py' -print0 | xargs -0 -n1 python3 -m py_compile
}

check_data_files() {
    python3 - <<'PY'
import glob, json, sys
import yaml
bad = 0
for f in glob.glob("packages/**/*.json", recursive=True):
    try:
        json.load(open(f, encoding="utf-8"))
    except Exception as e:
        print(f"invalid JSON {f}: {e}"); bad += 1
for f in glob.glob("packages/calamares-settings-zovelis/calamares/**/*.conf", recursive=True) + \
         ["packages/calamares-settings-zovelis/calamares/branding/zovelis/branding.desc"]:
    try:
        yaml.safe_load(open(f, encoding="utf-8"))
    except Exception as e:
        print(f"invalid YAML {f}: {e}"); bad += 1
print(f"checked JSON and YAML files, {bad} problem(s)")
sys.exit(1 if bad else 0)
PY
}

check_calamares_schemas() {
    src=${CALAMARES_SRC:-/opt/ref/calamares}
    if [ ! -d "$src/src/modules" ]; then echo "SKIP: Calamares sources not available (CALAMARES_SRC)"; return 0; fi
    python3 - "$src/src/modules" <<'PY'
import glob, sys, yaml, jsonschema
ref = sys.argv[1]
# Configurations of module instances; zovelisbootloader-* belong to the
# Zovelis module, which has no upstream schema.
instance_of = {"shellprocess-cleanup": "shellprocess"}
# Upstream schemas lag behind the code for these keys (verified in the
# Calamares 3.3 sources: lists are accepted, autologinGroup is optional).
known_outdated = {("users.conf", "'autologinGroup' is a required property"),
                  ("users.conf", "'sudoersGroup' is a required property"),
                  ("welcome.conf", "is not of type 'string'")}
bad = 0
for f in sorted(glob.glob("packages/calamares-settings-zovelis/calamares/modules/*.conf")):
    name = f.rsplit("/", 1)[1]
    module = instance_of.get(name[:-5], name[:-5])
    schemas = glob.glob(f"{ref}/{module}/{module}.schema.yaml")
    if not schemas:
        continue
    validator = jsonschema.Draft7Validator(yaml.safe_load(open(schemas[0])))
    for error in validator.iter_errors(yaml.safe_load(open(f))):
        if any(name == n and m in error.message for n, m in known_outdated):
            continue
        print(f"{name}: {error.message}"); bad += 1
print(f"schema problems: {bad}")
sys.exit(1 if bad else 0)
PY
}

check_desktop_files() {
    files=$(find packages -name '*.desktop' -not -path '*/sddm-theme/*' | sort)
    if have desktop-file-validate; then
        # shellcheck disable=SC2086
        desktop-file-validate $files
    else
        # shellcheck disable=SC2086
        python3 - $files <<'PY'
import configparser, sys
bad = 0
for f in sys.argv[1:]:
    p = configparser.ConfigParser(interpolation=None); p.optionxform = str
    p.read(f, encoding="utf-8")
    e = p["Desktop Entry"] if p.has_section("Desktop Entry") else None
    if e is None or not all(k in e for k in ("Type", "Name", "Exec")):
        print(f"{f}: missing Type/Name/Exec"); bad += 1
print("desktop-file-validate not installed; basic check only")
sys.exit(1 if bad else 0)
PY
    fi
}

check_xml() {
    find packages \( -name '*.policy' -o -name '*.metainfo.xml' \) -exec xmllint --noout {} + || return 1
    if have appstreamcli; then
        find packages -name '*.metainfo.xml' -exec appstreamcli validate --no-net --pedantic {} + || return 1
    fi
}

check_contrast() {
    python3 branding/generate_colors.py --check --verbose
}

check_polkit_rule() {
    if ! have node; then echo "SKIP: node not installed"; return 0; fi
    node - <<'JS'
const fs = require("fs");
const src = fs.readFileSync("packages/calamares-settings-zovelis/data/49-zovelis-installer.rules", "utf8");
function run(id, local, active, live) {
    let rule;
    const polkit = { Result: { YES: "yes", NO: "no", NOT_HANDLED: "nh" }, addRule: f => rule = f,
                     spawn: () => { if (!live) throw new Error("exit 1"); return ""; } };
    new Function("polkit", src)(polkit);
    return rule({ id }, { local, active });
}
const cases = [
    ["org.zovelis.installer.run", true, true, true, "yes"],
    ["org.zovelis.installer.run", true, true, false, "nh"],
    ["org.zovelis.installer.run", false, true, true, "nh"],
    ["org.zovelis.installer.run", true, false, true, "nh"],
    ["org.freedesktop.login1.reboot", true, true, true, "nh"],
    ["org.zovelis.admin-helper", true, true, true, "nh"],
];
let ok = true;
for (const c of cases) {
    const r = run(...c.slice(0, 4));
    console.log((r === c[4] ? "ok:   " : "FAIL: ") + JSON.stringify(c.slice(0, 4)) + " -> " + r);
    ok = ok && r === c[4];
}
process.exit(ok ? 0 : 1);
JS
}

check_layout_script() {
    if ! have node; then echo "SKIP: node not installed"; return 0; fi
    node tests/plasma/layout-test.js \
        packages/zovelis-desktop-settings/lookandfeel/common/layouts/org.kde.plasma.desktop-layout.js
}

# Qt: system Qt (Debian: qt6-base-dev...) or QT_PREFIX.
QT_CMAKE=""
if [ -n "${QT_PREFIX:-}" ] && [ -x "$QT_PREFIX/bin/qt-cmake" ]; then
    QT_CMAKE=$QT_PREFIX/bin/qt-cmake
    export LD_LIBRARY_PATH="$QT_PREFIX/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
elif have qt-cmake; then
    QT_CMAKE=qt-cmake
elif [ -x /usr/lib/qt6/bin/qt-cmake ]; then
    QT_CMAKE=/usr/lib/qt6/bin/qt-cmake
fi
export LC_ALL=C.UTF-8 QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software

check_welcome_app() {
    if [ -z "$QT_CMAKE" ]; then echo "SKIP: Qt 6 not available"; return 0; fi
    b="$OUT/build-welcome"
    "$QT_CMAKE" -S packages/zovelis-welcome -B "$b" -G Ninja -DCMAKE_BUILD_TYPE=Debug \
        -DBUILD_TESTING=ON -Wno-dev &&
        cmake --build "$b" --parallel "$(nproc)" &&
        (cd "$b" && ctest --output-on-failure)
}

build_qmlshot() {
    [ -n "$QT_CMAKE" ] || return 1
    "$QT_CMAKE" -S tests/tools/qmlshot -B "$OUT/build-qmlshot" -G Ninja -Wno-dev >/dev/null &&
        cmake --build "$OUT/build-qmlshot" >/dev/null
}

check_slideshow() {
    if [ -z "$QT_CMAKE" ]; then echo "SKIP: Qt 6 not available"; return 0; fi
    src=${CALAMARES_SRC:-/opt/ref/calamares}
    if [ ! -d "$src/src/qml/calamares-qt6/slideshow" ]; then echo "SKIP: Calamares sources not available"; return 0; fi
    build_qmlshot || return 1
    mkdir -p "$OUT/qml-imports"
    ln -sfn "$src/src/qml/calamares-qt6" "$OUT/qml-imports/calamares"
    "$OUT/build-qmlshot/qmlshot" --import "$OUT/qml-imports" --size 740x520 --set activatedInCalamares=false \
        --frames 5 --delay 600 --between goToNextSlide --out "$OUT/screenshots/installer-slide-" \
        packages/calamares-settings-zovelis/calamares/branding/zovelis/show.qml
}

check_splash() {
    if [ -z "$QT_CMAKE" ]; then echo "SKIP: Qt 6 not available"; return 0; fi
    build_qmlshot || return 1
    "$OUT/build-qmlshot/qmlshot" --import tests/qml/stubs --size 1280x800 --set stage=2 --frames 1 \
        --delay 1200 --out "$OUT/screenshots/splash-" \
        packages/zovelis-desktop-settings/lookandfeel/common/splash/Splash.qml
}

check_login_fallback() {
    if [ -z "$QT_CMAKE" ]; then echo "SKIP: Qt 6 not available"; return 0; fi
    if [ -e /usr/share/sddm/themes/breeze/Main.qml ]; then
        echo "SKIP: Breeze login screen installed here; fallback cannot be exercised"; return 0
    fi
    build_qmlshot || return 1
    # The fallback announces itself with one warning; anything else fails.
    "$OUT/build-qmlshot/qmlshot" --size 1024x768 \
        --set "themePath=file://$ROOT/packages/zovelis-desktop-settings/sddm-theme/Main.qml" \
        --frames 1 --delay 800 --out "$OUT/screenshots/login-fallback-" \
        tests/qml/harness/SddmFallback.qml >"$OUT/login.out" 2>&1
    cat "$OUT/login.out"
    grep -q 'using the fallback form' "$OUT/login.out" || return 1
    unexpected=$(grep -v -e 'using the fallback form' -e 'sddm/themes/breeze/Main.qml' -e '^/' "$OUT/login.out" || true)
    [ -z "$unexpected" ]
}

check_qmllint() {
    qmllint=""
    if [ -n "${QT_PREFIX:-}" ] && [ -x "$QT_PREFIX/bin/qmllint" ]; then qmllint=$QT_PREFIX/bin/qmllint
    elif [ -x /usr/lib/qt6/bin/qmllint ]; then qmllint=/usr/lib/qt6/bin/qmllint
    fi
    if [ -z "$qmllint" ]; then echo "SKIP: qmllint not available"; return 0; fi
    # QML that runs inside other programs (login screen, splash screen,
    # installer slideshow), checked against stand-ins for their modules.
    src=${CALAMARES_SRC:-/opt/ref/calamares}
    mkdir -p "$OUT/qml-imports"
    [ -d "$src/src/qml/calamares-qt6" ] && ln -sfn "$src/src/qml/calamares-qt6" "$OUT/qml-imports/calamares"
    "$qmllint" -I tests/qml/stubs -I "$OUT/qml-imports" \
        packages/zovelis-desktop-settings/lookandfeel/common/splash/Splash.qml \
        packages/calamares-settings-zovelis/calamares/branding/zovelis/show.qml &&
    # SDDM provides sddm/userModel/sessionModel/config as context properties,
    # which qmllint cannot know about.
    "$qmllint" --unqualified disable packages/zovelis-desktop-settings/sddm-theme/Main.qml
}

step "shell syntax" check_shell_syntax
step "shellcheck" check_shellcheck
step "python syntax" check_python
step "JSON and YAML" check_data_files
step "installer config schemas" check_calamares_schemas
step "desktop entries" check_desktop_files
step "XML (polkit, AppStream)" check_xml
step "colour contrast (WCAG)" check_contrast
step "consistency" python3 tests/check_consistency.py
step "installer polkit rule" check_polkit_rule
step "desktop layout script" check_layout_script
step "installer helper scripts" sh tests/installer/test-helper-scripts.sh
step "installer boot loader job" python3 tests/installer/test_zovelisbootloader.py
step "build chroot trust chain" sh tests/dev/test-make-build-chroot.sh
step "welcome app (build, unit, UI)" check_welcome_app
step "qmllint" check_qmllint
step "installer slideshow render" check_slideshow
step "splash screen render" check_splash
step "login screen fallback" check_login_fallback

echo
echo "passed: $passed  failed: $failed  skipped: $skipped   (logs: $OUT)"
[ "$failed" -eq 0 ]
