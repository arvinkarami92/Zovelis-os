// SPDX-License-Identifier: GPL-3.0-or-later
// Zovelis Welcome: first-run setup on installed systems, "try or install"
// in the live session.
#include "backend.h"
#include "colorscheme.h"
#include "iconprovider.h"

#include <QApplication>
#include <QCommandLineParser>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QIcon>
#include <QLockFile>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QStandardPaths>
#include <QTimer>

#include <cstdio>
#include <memory>

namespace
{
// Counts warnings so --strict can fail on any QML or binding problem.
int g_warningCount = 0;
QtMessageHandler g_previousHandler = nullptr;

void countingMessageHandler(QtMsgType type, const QMessageLogContext &context, const QString &message)
{
    if (type == QtWarningMsg || type == QtCriticalMsg || type == QtFatalMsg) {
        ++g_warningCount;
    }
    if (g_previousHandler) {
        g_previousHandler(type, context, message);
    }
}

// Renders every page to PNG files (used by the test-suite and for docs).
class ScreenshotRunner : public QObject
{
public:
    ScreenshotRunner(QQuickWindow *window, const QString &directory, const QString &prefix)
        : m_window(window)
        , m_directory(directory)
        , m_prefix(prefix)
    {
        QDir().mkpath(directory);
    }

    void start()
    {
        bool ok = false;
        m_pageCount = m_window->property("pageCount").toInt(&ok);
        if (!ok || m_pageCount <= 0) {
            std::fprintf(stderr, "screenshot: window has no pages\n");
            QCoreApplication::exit(4);
            return;
        }
        showPage(0);
    }

private:
    void showPage(int index)
    {
        m_window->setProperty("currentIndex", index);
        // Give bindings, layouts and the fade-in animation time to settle.
        QTimer::singleShot(700, this, [this, index] { capture(index); });
    }

    void capture(int index)
    {
        QVariant result;
        QMetaObject::invokeMethod(m_window, "pageName", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, index));
        const QString name = result.toString().toLower().replace(QLatin1Char(' '), QLatin1Char('-'));
        const QString file = QStringLiteral("%1/%2%3-%4.png").arg(m_directory, m_prefix).arg(index + 1, 2, 10, QLatin1Char('0')).arg(name);
        const QImage image = m_window->grabWindow();
        if (image.isNull() || !image.save(file)) {
            std::fprintf(stderr, "screenshot: could not save %s\n", qPrintable(file));
            QCoreApplication::exit(5);
            return;
        }
        std::printf("screenshot: %s\n", qPrintable(file));
        if (index + 1 < m_pageCount) {
            showPage(index + 1);
        } else {
            QCoreApplication::exit(0);
        }
    }

    QQuickWindow *m_window;
    QString m_directory;
    QString m_prefix;
    int m_pageCount = 0;
};
} // namespace

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);
    QApplication::setApplicationName(QStringLiteral("zovelis-welcome"));
    QApplication::setApplicationDisplayName(QStringLiteral("Welcome"));
    QApplication::setApplicationVersion(QStringLiteral(ZOVELIS_WELCOME_VERSION));
    QApplication::setOrganizationDomain(QStringLiteral("zovelis.org"));
    // Matches the .desktop file so Wayland compositors show the right icon.
    QGuiApplication::setDesktopFileName(QStringLiteral("org.zovelis.Welcome"));
    // Inside Plasma the platform theme picks the icon theme. Elsewhere (other
    // desktops, tests) fall back to Breeze, which Zovelis OS always ships.
    if (QIcon::themeName().isEmpty() || QIcon::themeName() == QLatin1String("hicolor")) {
        QIcon::setThemeName(QStringLiteral("breeze"));
    }
    // Some platform plugins (e.g. "offscreen", used by the tests) do not tell
    // Qt where icon themes live; add the standard XDG locations if missing.
    {
        QStringList searchPaths = QIcon::themeSearchPaths();
        const QStringList dataDirs = QStandardPaths::standardLocations(QStandardPaths::GenericDataLocation);
        for (const QString &dataDir : dataDirs) {
            const QString iconDir = dataDir + QStringLiteral("/icons");
            if (!searchPaths.contains(iconDir) && QFileInfo(iconDir).isDir()) {
                searchPaths.append(iconDir);
            }
        }
        QIcon::setThemeSearchPaths(searchPaths);
    }
    QApplication::setWindowIcon(QIcon::fromTheme(QStringLiteral("zovelis-welcome")));

    QCommandLineParser parser;
    parser.setApplicationDescription(QStringLiteral("Welcome and first-run setup for Zovelis OS."));
    parser.addHelpOption();
    parser.addVersionOption();
    const QCommandLineOption autostartOption(QStringLiteral("autostart"), QStringLiteral("Started at login: exit quietly if the user turned the guide off."));
    const QCommandLineOption liveOption(QStringLiteral("live"), QStringLiteral("Show the live-session welcome."));
    const QCommandLineOption installedOption(QStringLiteral("installed"), QStringLiteral("Show the installed-system setup."));
    const QCommandLineOption dryRunOption(QStringLiteral("dry-run"), QStringLiteral("Do not change anything; print the commands that would run."));
    const QCommandLineOption sysrootOption(QStringLiteral("sysroot"), QStringLiteral("Read system files below <dir> (testing)."), QStringLiteral("dir"));
    const QCommandLineOption screenshotOption(QStringLiteral("screenshot-dir"), QStringLiteral("Render every page to <dir> and exit (testing)."), QStringLiteral("dir"));
    const QCommandLineOption prefixOption(QStringLiteral("screenshot-prefix"), QStringLiteral("File name prefix for screenshots."), QStringLiteral("prefix"));
    const QCommandLineOption sizeOption(QStringLiteral("size"), QStringLiteral("Window size, e.g. 900x660 (testing)."), QStringLiteral("WxH"));
    const QCommandLineOption strictOption(QStringLiteral("strict"), QStringLiteral("Exit with an error if any warning was printed (testing)."));
    const QCommandLineOption schemeOption(QStringLiteral("color-scheme"), QStringLiteral("Use colours from a KDE .colors file (testing)."), QStringLiteral("file"));
    parser.addOptions({autostartOption, liveOption, installedOption, dryRunOption, sysrootOption, screenshotOption, prefixOption, sizeOption, strictOption, schemeOption});
    parser.process(app);

    if (parser.isSet(strictOption)) {
        g_previousHandler = qInstallMessageHandler(countingMessageHandler);
    }

    if (parser.isSet(schemeOption)) {
        QFile file(parser.value(schemeOption));
        QPalette palette;
        if (!file.open(QIODevice::ReadOnly) || !Zovelis::paletteFromColorScheme(QString::fromUtf8(file.readAll()), &palette)) {
            std::fprintf(stderr, "cannot use colour scheme %s\n", qPrintable(parser.value(schemeOption)));
            return 2;
        }
        QApplication::setPalette(palette);
    }

    BackendOptions options;
    options.dryRun = parser.isSet(dryRunOption) || parser.isSet(screenshotOption);
    options.sysroot = parser.value(sysrootOption);
    if (parser.isSet(liveOption)) {
        options.forceLive = 1;
    } else if (parser.isSet(installedOption)) {
        options.forceLive = 0;
    }
    Backend backend(options);

    if (parser.isSet(autostartOption) && !backend.showAtLogin()) {
        return 0;
    }

    // Only one window: a second launch (e.g. from the menu while the
    // autostarted one is open) simply exits.
    std::unique_ptr<QLockFile> lock;
    if (!parser.isSet(screenshotOption)) {
        QString runtimeDir = QStandardPaths::writableLocation(QStandardPaths::RuntimeLocation);
        if (runtimeDir.isEmpty()) {
            runtimeDir = QDir::tempPath();
        }
        lock = std::make_unique<QLockFile>(runtimeDir + QStringLiteral("/zovelis-welcome.lock"));
        lock->setStaleLockTime(0);
        if (!lock->tryLock(100)) {
            std::fprintf(stderr, "zovelis-welcome is already running.\n");
            return 0;
        }
    }

    QQmlApplicationEngine engine;
    engine.addImageProvider(QStringLiteral("icon"), new IconProvider);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.loadFromModule("org.zovelis.welcome", "Main");
    if (engine.rootObjects().isEmpty()) {
        return 1;
    }

    auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().constFirst());
    if (window && parser.isSet(sizeOption)) {
        const QStringList parts = parser.value(sizeOption).split(QLatin1Char('x'));
        if (parts.size() == 2) {
            window->resize(parts.at(0).toInt(), parts.at(1).toInt());
        }
    }

    std::unique_ptr<ScreenshotRunner> screenshots;
    if (window && parser.isSet(screenshotOption)) {
        screenshots = std::make_unique<ScreenshotRunner>(window, parser.value(screenshotOption), parser.value(prefixOption));
        QTimer::singleShot(300, screenshots.get(), [&screenshots] { screenshots->start(); });
    }

    const int result = app.exec();
    if (parser.isSet(strictOption) && g_warningCount > 0) {
        std::fprintf(stderr, "strict mode: %d warning(s) were printed\n", g_warningCount);
        return result == 0 ? 3 : result;
    }
    return result;
}
