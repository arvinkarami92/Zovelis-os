// SPDX-License-Identifier: GPL-3.0-or-later
// qmlshot: load a QML file, optionally set properties / call functions on its
// root object, and save screenshots. Used by the test-suite to check QML
// that runs inside other programs (installer slideshow, splash screen, login
// screen) without those programs. Any QML warning makes it fail.
//
//   qmlshot [--import DIR]... [--size WxH] [--set NAME=VALUE]...
//           [--frames N] [--delay MS] [--between FUNCTION] --out PREFIX FILE.qml
#include <QCommandLineParser>
#include <QDir>
#include <QGuiApplication>
#include <QImage>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickView>
#include <QTimer>
#include <cstdio>
#include <functional>

static int g_warnings = 0;
static void handler(QtMsgType type, const QMessageLogContext &, const QString &msg)
{
    std::fprintf(stderr, "%s\n", qPrintable(msg));
    if (type != QtDebugMsg && type != QtInfoMsg) {
        ++g_warnings;
    }
}

int main(int argc, char **argv)
{
    qInstallMessageHandler(handler);
    QGuiApplication app(argc, argv);
    QCommandLineParser p;
    p.addHelpOption();
    QCommandLineOption importOpt(QStringLiteral("import"), QStringLiteral("QML import path"), QStringLiteral("dir"));
    QCommandLineOption sizeOpt(QStringLiteral("size"), QStringLiteral("window size"), QStringLiteral("WxH"), QStringLiteral("800x600"));
    QCommandLineOption setOpt(QStringLiteral("set"), QStringLiteral("root property"), QStringLiteral("name=value"));
    QCommandLineOption framesOpt(QStringLiteral("frames"), QStringLiteral("number of screenshots"), QStringLiteral("n"), QStringLiteral("1"));
    QCommandLineOption delayOpt(QStringLiteral("delay"), QStringLiteral("ms before each screenshot"), QStringLiteral("ms"), QStringLiteral("800"));
    QCommandLineOption betweenOpt(QStringLiteral("between"), QStringLiteral("root function called after each screenshot"), QStringLiteral("function"));
    QCommandLineOption outOpt(QStringLiteral("out"), QStringLiteral("output prefix"), QStringLiteral("prefix"));
    p.addOptions({importOpt, sizeOpt, setOpt, framesOpt, delayOpt, betweenOpt, outOpt});
    p.addPositionalArgument(QStringLiteral("file"), QStringLiteral("QML file"));
    p.process(app);
    if (p.positionalArguments().size() != 1 || !p.isSet(outOpt)) {
        p.showHelp(2);
    }

    QQuickView view;
    for (const QString &dir : p.values(importOpt)) {
        view.engine()->addImportPath(dir);
    }
    const QStringList size = p.value(sizeOpt).split(QLatin1Char('x'));
    view.resize(size.value(0).toInt(), size.value(1).toInt());
    view.setResizeMode(QQuickView::SizeRootObjectToView);
    view.setSource(QUrl::fromLocalFile(QFileInfo(p.positionalArguments().first()).absoluteFilePath()));
    if (view.status() != QQuickView::Ready || !view.rootObject()) {
        std::fprintf(stderr, "qmlshot: could not load the QML file\n");
        return 1;
    }
    QObject *root = view.rootObject();
    for (const QString &assignment : p.values(setOpt)) {
        const qsizetype eq = assignment.indexOf(QLatin1Char('='));
        const QString name = assignment.left(eq);
        const QString value = assignment.mid(eq + 1);
        QVariant v = value;
        if (value == QLatin1String("true") || value == QLatin1String("false")) {
            v = value == QLatin1String("true");
        } else {
            bool ok = false;
            const int n = value.toInt(&ok);
            if (ok) {
                v = n;
            }
        }
        if (!root->setProperty(name.toUtf8().constData(), v)) {
            std::fprintf(stderr, "qmlshot: cannot set %s\n", qPrintable(name));
            return 1;
        }
    }
    view.show();

    const int frames = p.value(framesOpt).toInt();
    const int delay = p.value(delayOpt).toInt();
    const QString between = p.value(betweenOpt);
    const QString prefix = p.value(outOpt);
    QDir().mkpath(QFileInfo(prefix).absolutePath());
    int frame = 0;
    std::function<void()> next;
    next = [&]() {
        QTimer::singleShot(delay, &app, [&]() {
            const QImage image = view.grabWindow();
            const QString file = QStringLiteral("%1%2.png").arg(prefix).arg(frame + 1, 2, 10, QLatin1Char('0'));
            if (image.isNull() || !image.save(file)) {
                std::fprintf(stderr, "qmlshot: cannot save %s\n", qPrintable(file));
                QCoreApplication::exit(1);
                return;
            }
            std::printf("%s\n", qPrintable(file));
            if (++frame >= frames) {
                QCoreApplication::exit(g_warnings ? 3 : 0);
                return;
            }
            if (!between.isEmpty()) {
                QMetaObject::invokeMethod(root, between.toUtf8().constData());
            }
            next();
        });
    };
    next();
    return app.exec();
}
