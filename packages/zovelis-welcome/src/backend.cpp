// SPDX-License-Identifier: GPL-3.0-or-later
#include "backend.h"
#include "configfiles.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QFont>
#include <QGuiApplication>
#include <QJSEngine>
#include <QPalette>
#include <QProcess>
#include <QQmlEngine>
#include <QSaveFile>
#include <QStandardPaths>
#include <QTextStream>

#ifndef ZOVELIS_LIBEXECDIR
#define ZOVELIS_LIBEXECDIR "/usr/libexec"
#endif

namespace
{
Backend *s_instance = nullptr;

constexpr auto LightLookAndFeel = "org.zovelis.light.desktop";
constexpr auto DarkLookAndFeel = "org.zovelis.dark.desktop";
constexpr auto PreferencesFile = "zovelis-welcomerc";

// Fonts adjusted by the "text size" choice: kdeglobals group, key, offset
// from the base size, and the family used when the key is not set yet.
struct FontEntry {
    const char *group;
    const char *key;
    int offset;
    const char *defaultFamily;
};
constexpr FontEntry FontEntries[] = {
    {"General", "font", 0, "Noto Sans"},
    {"General", "menuFont", 0, "Noto Sans"},
    {"General", "toolBarFont", 0, "Noto Sans"},
    {"General", "smallestReadableFont", -2, "Noto Sans"},
    {"General", "fixed", 0, "Hack"},
    {"WM", "activeFont", 0, "Noto Sans"},
};

// pkexec exit codes (see pkexec(1)).
constexpr int PkexecDismissed = 126;
constexpr int PkexecNotAuthorized = 127;
} // namespace

Backend::Backend(const BackendOptions &options, QObject *parent)
    : QObject(parent)
    , m_options(options)
{
    Q_ASSERT(!s_instance);
    s_instance = this;
    detectEnvironment();
    loadPreferences();
    refreshStatus();
}

Backend::~Backend()
{
    if (s_instance == this) {
        s_instance = nullptr;
    }
}

Backend *Backend::create(QQmlEngine *, QJSEngine *)
{
    Q_ASSERT(s_instance);
    // The instance is owned by main(); QML must never delete it.
    QJSEngine::setObjectOwnership(s_instance, QJSEngine::CppOwnership);
    return s_instance;
}

const QStringList &Backend::allowedSettingsModules()
{
    static const QStringList modules{
        QStringLiteral("kcm_access"),
        QStringLiteral("kcm_firewall"),
        QStringLiteral("kcm_flatpak"),
        QStringLiteral("kcm_fonts"),
        QStringLiteral("kcm_lookandfeel"),
        QStringLiteral("kcm_updates"),
    };
    return modules;
}

QString Backend::systemFile(const QString &absolutePath) const
{
    if (m_options.sysroot.isEmpty()) {
        return absolutePath;
    }
    return QDir::cleanPath(m_options.sysroot + QLatin1Char('/') + absolutePath);
}

QString Backend::readTextFile(const QString &path)
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        return QString();
    }
    // Config files are small; refuse anything unreasonably large.
    if (file.size() > 1024 * 1024) {
        return QString();
    }
    return QString::fromUtf8(file.readAll());
}

QString Backend::userConfigFile(const QString &name) const
{
    return QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation) + QLatin1Char('/') + name;
}

QString Backend::kdeglobalsValue(const QString &group, const QString &key, const QString &fallback) const
{
    // Same lookup order Plasma uses: the user's file, the per-user defaults
    // written from the active global theme, then the system-wide defaults.
    static const QString missing = QStringLiteral("\x01missing\x01");
    const QStringList files{
        userConfigFile(QStringLiteral("kdeglobals")),
        userConfigFile(QStringLiteral("kdedefaults/kdeglobals")),
        systemFile(QStringLiteral("/etc/xdg/kdeglobals")),
    };
    for (const QString &file : files) {
        const QString value = Zovelis::readKConfigValue(readTextFile(file), group, key, missing);
        if (value != missing) {
            return value;
        }
    }
    return fallback;
}

void Backend::detectEnvironment()
{
    QString osRelease = readTextFile(systemFile(QStringLiteral("/etc/os-release")));
    if (osRelease.isEmpty()) {
        osRelease = readTextFile(systemFile(QStringLiteral("/usr/lib/os-release")));
    }
    const auto os = Zovelis::parseOsRelease(osRelease);
    m_distroName = os.value(QStringLiteral("NAME"), QStringLiteral("Zovelis OS"));
    m_distroVersion = os.value(QStringLiteral("VERSION"), os.value(QStringLiteral("VERSION_ID")));

    if (m_options.forceLive >= 0) {
        m_liveSession = m_options.forceLive == 1;
    } else {
        const QStringList cmdline = readTextFile(systemFile(QStringLiteral("/proc/cmdline"))).split(QLatin1Char(' '), Qt::SkipEmptyParts);
        m_liveSession = QFileInfo::exists(systemFile(QStringLiteral("/run/live/medium"))) || cmdline.contains(QStringLiteral("boot=live"));
    }
    m_installerAvailable = QFileInfo::exists(systemFile(QStringLiteral("/usr/bin/zovelis-install")));

    bool ok = false;
    const double factor = kdeglobalsValue(QStringLiteral("KDE"), QStringLiteral("AnimationDurationFactor"), QStringLiteral("1")).toDouble(&ok);
    m_animationFactor = ok ? qBound(0.0, factor, 4.0) : 1.0;

    const QString lnf = kdeglobalsValue(QStringLiteral("KDE"), QStringLiteral("LookAndFeelPackage"));
    const QString scheme = kdeglobalsValue(QStringLiteral("General"), QStringLiteral("ColorScheme"));
    if (!lnf.isEmpty()) {
        m_themeVariant = lnf.contains(QLatin1String("dark"), Qt::CaseInsensitive) ? QStringLiteral("dark") : QStringLiteral("light");
    } else if (!scheme.isEmpty()) {
        m_themeVariant = scheme.contains(QLatin1String("dark"), Qt::CaseInsensitive) ? QStringLiteral("dark") : QStringLiteral("light");
    } else {
        const QColor window = QGuiApplication::palette().color(QPalette::Window);
        m_themeVariant = window.lightness() < 128 ? QStringLiteral("dark") : QStringLiteral("light");
    }

    const double points = Zovelis::pointSizeOf(kdeglobalsValue(QStringLiteral("General"), QStringLiteral("font")));
    m_textSize = points > 0 ? Zovelis::textSizeLevelForPointSize(points) : 0;
}

void Backend::loadPreferences()
{
    const QString content = readTextFile(userConfigFile(QLatin1String(PreferencesFile)));
    const QString value = Zovelis::readKConfigValue(content, QStringLiteral("General"), QStringLiteral("ShowAtLogin"), QStringLiteral("true"));
    m_showAtLogin = value.compare(QLatin1String("false"), Qt::CaseInsensitive) != 0;
}

void Backend::savePreferences()
{
    const QString path = userConfigFile(QLatin1String(PreferencesFile));
    QDir().mkpath(QFileInfo(path).absolutePath());
    QSaveFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        return;
    }
    QTextStream out(&file);
    out << "[General]\n"
        << "ShowAtLogin=" << (m_showAtLogin ? "true" : "false") << '\n'
        << "Version=" << ZOVELIS_WELCOME_VERSION << '\n';
    out.flush();
    file.commit();
}

void Backend::setShowAtLogin(bool show)
{
    if (m_showAtLogin == show) {
        return;
    }
    m_showAtLogin = show;
    savePreferences();
    Q_EMIT showAtLoginChanged();
}

void Backend::refreshStatus()
{
    const QString ufw = readTextFile(systemFile(QStringLiteral("/etc/ufw/ufw.conf")));
    m_firewallEnabled = Zovelis::readShellVariable(ufw, QStringLiteral("ENABLED")).compare(QLatin1String("yes"), Qt::CaseInsensitive) == 0;

    m_autoUpdatesAvailable = QFileInfo::exists(systemFile(QStringLiteral("/usr/bin/unattended-upgrade")));
    const QString periodic = Zovelis::readAptValue(readTextFile(systemFile(QStringLiteral("/etc/apt/apt.conf.d/20auto-upgrades"))),
                                                   QStringLiteral("APT::Periodic::Unattended-Upgrade"));
    m_autoUpdatesEnabled = m_autoUpdatesAvailable && !periodic.isEmpty() && periodic != QLatin1String("0");

    m_flatpakAvailable = QFileInfo::exists(systemFile(QStringLiteral("/usr/bin/flatpak")));
    Q_EMIT statusChanged();
}

bool Backend::launch(const QString &program, const QStringList &arguments)
{
    if (m_options.dryRun) {
        m_commandLog.append((QStringList{program} + arguments).join(QLatin1Char(' ')));
        Q_EMIT commandLogChanged();
        return true;
    }
    const QString executable = QStandardPaths::findExecutable(program);
    if (executable.isEmpty()) {
        setError(tr("The program “%1” is not installed.").arg(program));
        return false;
    }
    if (!QProcess::startDetached(executable, arguments)) {
        setError(tr("Could not start “%1”.").arg(program));
        return false;
    }
    return true;
}

void Backend::applyTheme(const QString &variant)
{
    if (variant != QLatin1String("light") && variant != QLatin1String("dark")) {
        return;
    }
    const QString package = QString::fromLatin1(variant == QLatin1String("dark") ? DarkLookAndFeel : LightLookAndFeel);
    if (!launch(QStringLiteral("plasma-apply-lookandfeel"), {QStringLiteral("--apply"), package})) {
        return;
    }
    if (m_themeVariant != variant) {
        m_themeVariant = variant;
        Q_EMIT themeVariantChanged();
    }
}

void Backend::setTextSize(int level)
{
    level = qBound(0, level, 2);
    if (level == m_textSize) {
        return;
    }
    const int base = Zovelis::basePointSizeForLevel(level);
    for (const FontEntry &entry : FontEntries) {
        const QString group = QString::fromLatin1(entry.group);
        const QString key = QString::fromLatin1(entry.key);
        const int size = base + entry.offset;
        QString value = Zovelis::withPointSize(kdeglobalsValue(group, key), size);
        if (value.isEmpty()) {
            QFont font(QString::fromLatin1(entry.defaultFamily));
            font.setPointSize(size);
            value = font.toString();
        }
        const QStringList args{QStringLiteral("--file"), QStringLiteral("kdeglobals"), QStringLiteral("--group"), group,
                               QStringLiteral("--key"),  key,                           QStringLiteral("--notify"), value};
        if (m_options.dryRun) {
            launch(QStringLiteral("kwriteconfig6"), args);
            continue;
        }
        // Run these one after another: they all rewrite the same file.
        const QString exe = QStandardPaths::findExecutable(QStringLiteral("kwriteconfig6"));
        if (exe.isEmpty()) {
            setError(tr("The program “%1” is not installed.").arg(QStringLiteral("kwriteconfig6")));
            return;
        }
        QProcess process;
        process.start(exe, args);
        if (!process.waitForFinished(5000) || process.exitCode() != 0) {
            setError(tr("Could not change the text size."));
            return;
        }
    }
    // Tell running KDE applications that fonts changed (KGlobalSettings::FontChanged == 1).
    launch(QStringLiteral("dbus-send"),
           {QStringLiteral("--session"), QStringLiteral("--type=signal"), QStringLiteral("/KGlobalSettings"),
            QStringLiteral("org.kde.KGlobalSettings.notifyChange"), QStringLiteral("int32:1"), QStringLiteral("int32:0")});
    m_textSize = level;
    Q_EMIT textSizeChanged();
}

void Backend::setAutoUpdates(bool enabled)
{
    if (m_busy || !m_autoUpdatesAvailable) {
        return;
    }
    clearError();
    const QString helper = QStringLiteral(ZOVELIS_LIBEXECDIR "/zovelis/zovelis-admin-helper");
    const QStringList args{helper, QStringLiteral("auto-updates"), enabled ? QStringLiteral("on") : QStringLiteral("off")};

    if (m_options.dryRun) {
        launch(QStringLiteral("pkexec"), args);
        m_autoUpdatesEnabled = enabled;
        Q_EMIT statusChanged();
        return;
    }

    auto *process = new QProcess(this);
    connect(process, &QProcess::errorOccurred, this, [this, process](QProcess::ProcessError error) {
        if (error != QProcess::FailedToStart) {
            return; // finished() reports the other cases
        }
        process->deleteLater();
        setBusy(false);
        setError(tr("Administrator permission could not be requested because pkexec is missing."));
    });
    connect(process, &QProcess::finished, this, [this, process](int exitCode, QProcess::ExitStatus status) {
        process->deleteLater();
        setBusy(false);
        refreshStatus();
        if (status != QProcess::NormalExit) {
            setError(tr("The settings helper stopped unexpectedly. Nothing was changed."));
        } else if (exitCode == PkexecDismissed) {
            setError(tr("Authentication was cancelled. Nothing was changed."));
        } else if (exitCode == PkexecNotAuthorized) {
            setError(tr("Your account is not allowed to change this setting."));
        } else if (exitCode != 0) {
            setError(tr("The setting could not be changed (error %1).").arg(exitCode));
        }
    });
    setBusy(true);
    process->start(QStringLiteral("pkexec"), args);
}

bool Backend::openSettings(const QString &module)
{
    if (!allowedSettingsModules().contains(module)) {
        return false;
    }
    return launch(QStringLiteral("systemsettings"), {module});
}

void Backend::openSoftwareCenter()
{
    launch(QStringLiteral("plasma-discover"), {});
}

bool Backend::openApp(const QString &appstreamId)
{
    if (!Zovelis::isValidAppstreamId(appstreamId)) {
        return false;
    }
    return launch(QStringLiteral("plasma-discover"), {QStringLiteral("--application"), QStringLiteral("appstream://") + appstreamId});
}

void Backend::openUpdates()
{
    launch(QStringLiteral("plasma-discover"), {QStringLiteral("--mode"), QStringLiteral("update")});
}

void Backend::startInstaller()
{
    launch(QStringLiteral("zovelis-install"), {});
}

void Backend::finish()
{
    savePreferences();
}

void Backend::setBusy(bool busy)
{
    if (m_busy != busy) {
        m_busy = busy;
        Q_EMIT busyChanged();
    }
}

void Backend::setError(const QString &message)
{
    if (m_errorMessage != message) {
        m_errorMessage = message;
        Q_EMIT errorMessageChanged();
    }
}

void Backend::clearError()
{
    setError(QString());
}
