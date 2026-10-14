// SPDX-License-Identifier: GPL-3.0-or-later
// The bridge between the QML user interface and the system.
//
// Design rules:
//  * The app itself never runs with privileges. The only privileged action
//    (changing automatic updates) goes through pkexec and a small helper that
//    accepts a fixed set of arguments.
//  * Programs are started with explicit argument lists, never through a shell.
//  * Every value coming from QML that ends up on a command line is validated
//    against a whitelist or a strict pattern first.
#pragma once

#include <QObject>
#include <QString>
#include <QStringList>
#include <QtQml/qqmlregistration.h>

class QQmlEngine;
class QJSEngine;

struct BackendOptions {
    // Root under which system files are read. Empty means "/". Tests point
    // this at a temporary directory containing fake /etc files.
    QString sysroot;
    // When set, commands are recorded in commandLog instead of being run.
    bool dryRun = false;
    // -1: detect, 0: force installed system, 1: force live session.
    int forceLive = -1;
};

class Backend : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(bool liveSession READ liveSession CONSTANT)
    Q_PROPERTY(bool installerAvailable READ installerAvailable CONSTANT)
    Q_PROPERTY(QString distroName READ distroName CONSTANT)
    Q_PROPERTY(QString distroVersion READ distroVersion CONSTANT)
    Q_PROPERTY(QString themeVariant READ themeVariant NOTIFY themeVariantChanged)
    Q_PROPERTY(int textSize READ textSize NOTIFY textSizeChanged)
    Q_PROPERTY(bool firewallEnabled READ firewallEnabled NOTIFY statusChanged)
    Q_PROPERTY(bool autoUpdatesAvailable READ autoUpdatesAvailable NOTIFY statusChanged)
    Q_PROPERTY(bool autoUpdatesEnabled READ autoUpdatesEnabled NOTIFY statusChanged)
    Q_PROPERTY(bool flatpakAvailable READ flatpakAvailable NOTIFY statusChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QString errorMessage READ errorMessage NOTIFY errorMessageChanged)
    Q_PROPERTY(bool showAtLogin READ showAtLogin WRITE setShowAtLogin NOTIFY showAtLoginChanged)
    Q_PROPERTY(double animationFactor READ animationFactor CONSTANT)
    Q_PROPERTY(QStringList commandLog READ commandLog NOTIFY commandLogChanged)

public:
    explicit Backend(const BackendOptions &options, QObject *parent = nullptr);
    ~Backend() override;

    // QML singleton factory: hands out the instance created in main().
    static Backend *create(QQmlEngine *qmlEngine, QJSEngine *jsEngine);

    bool liveSession() const { return m_liveSession; }
    bool installerAvailable() const { return m_installerAvailable; }
    QString distroName() const { return m_distroName; }
    QString distroVersion() const { return m_distroVersion; }
    QString themeVariant() const { return m_themeVariant; }
    int textSize() const { return m_textSize; }
    bool firewallEnabled() const { return m_firewallEnabled; }
    bool autoUpdatesAvailable() const { return m_autoUpdatesAvailable; }
    bool autoUpdatesEnabled() const { return m_autoUpdatesEnabled; }
    bool flatpakAvailable() const { return m_flatpakAvailable; }
    bool busy() const { return m_busy; }
    QString errorMessage() const { return m_errorMessage; }
    bool showAtLogin() const { return m_showAtLogin; }
    void setShowAtLogin(bool show);
    double animationFactor() const { return m_animationFactor; }
    QStringList commandLog() const { return m_commandLog; }

    // Settings modules the UI may open. Anything else is refused.
    static const QStringList &allowedSettingsModules();

    Q_INVOKABLE void applyTheme(const QString &variant);
    Q_INVOKABLE void setTextSize(int level);
    Q_INVOKABLE void setAutoUpdates(bool enabled);
    Q_INVOKABLE void refreshStatus();
    Q_INVOKABLE bool openSettings(const QString &module);
    Q_INVOKABLE void openSoftwareCenter();
    Q_INVOKABLE bool openApp(const QString &appstreamId);
    Q_INVOKABLE void openUpdates();
    Q_INVOKABLE void startInstaller();
    Q_INVOKABLE void clearError();
    // Called when the user finishes or closes the window.
    Q_INVOKABLE void finish();

Q_SIGNALS:
    void themeVariantChanged();
    void textSizeChanged();
    void statusChanged();
    void busyChanged();
    void errorMessageChanged();
    void showAtLoginChanged();
    void commandLogChanged();

private:
    QString systemFile(const QString &absolutePath) const;
    static QString readTextFile(const QString &path);
    QString userConfigFile(const QString &name) const;
    QString kdeglobalsValue(const QString &group, const QString &key, const QString &fallback = QString()) const;
    bool launch(const QString &program, const QStringList &arguments);
    void setBusy(bool busy);
    void setError(const QString &message);
    void detectEnvironment();
    void loadPreferences();
    void savePreferences();

    BackendOptions m_options;
    bool m_liveSession = false;
    bool m_installerAvailable = false;
    QString m_distroName;
    QString m_distroVersion;
    QString m_themeVariant;
    int m_textSize = 0;
    bool m_firewallEnabled = false;
    bool m_autoUpdatesAvailable = false;
    bool m_autoUpdatesEnabled = false;
    bool m_flatpakAvailable = false;
    bool m_busy = false;
    QString m_errorMessage;
    bool m_showAtLogin = true;
    double m_animationFactor = 1.0;
    QStringList m_commandLog;
};
