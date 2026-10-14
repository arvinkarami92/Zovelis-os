// SPDX-License-Identifier: GPL-3.0-or-later
#include "colorscheme.h"
#include "configfiles.h"

#include <QFont>
#include <QTest>

using namespace Zovelis;

class TestConfigFiles : public QObject
{
    Q_OBJECT

private Q_SLOTS:
    void osRelease()
    {
        const auto os = parseOsRelease(QStringLiteral(
            "# comment\n"
            "PRETTY_NAME=\"Zovelis OS 1.0 (based on Debian 13)\"\n"
            "NAME='Zovelis OS'\n"
            "ID=zovelis\n"
            "ID_LIKE=debian\n"
            "VERSION=\"1.0 \\\"Aurora\\\"\"\n"
            "bad line without equals\n"
            "lower=case-not-allowed\n"
            "=empty-key\n"
            "HOME_URL=\"https://example.invalid/\" \n"));
        QCOMPARE(os.value(QStringLiteral("PRETTY_NAME")), QStringLiteral("Zovelis OS 1.0 (based on Debian 13)"));
        QCOMPARE(os.value(QStringLiteral("NAME")), QStringLiteral("Zovelis OS"));
        QCOMPARE(os.value(QStringLiteral("ID")), QStringLiteral("zovelis"));
        QCOMPARE(os.value(QStringLiteral("VERSION")), QStringLiteral("1.0 \"Aurora\""));
        QCOMPARE(os.value(QStringLiteral("HOME_URL")), QStringLiteral("https://example.invalid/"));
        QVERIFY(!os.contains(QStringLiteral("lower")));
        QVERIFY(!os.contains(QString()));
        QCOMPARE(os.size(), 6);
    }

    void kconfig()
    {
        const QString content = QStringLiteral(
            "topkey=top\n"
            "[General]\n"
            "ColorScheme=ZovelisDark\n"
            "font=Noto Sans,12,-1,5,400,0,0,0,0,0,0,0,0,0,0,1\n"
            "Name[de]=Deutsch\n"
            "Name=English\n"
            "spaced = value with spaces \n"
            "escaped=a\\sb\\\\c\n"
            "[KDE]\n"
            "LookAndFeelPackage[$e]=org.zovelis.dark.desktop\n"
            "AnimationDurationFactor=0.5\n"
            "[Colors:View][Inactive]\n"
            "BackgroundNormal=1,2,3\n"
            "[Locked][$i]\n"
            "key=locked\n"
            "[General]\n"
            "ColorScheme=ZovelisLight\n");
        QCOMPARE(readKConfigValue(content, QString(), QStringLiteral("topkey")), QStringLiteral("top"));
        // Later duplicates win, also across repeated group headers.
        QCOMPARE(readKConfigValue(content, QStringLiteral("General"), QStringLiteral("ColorScheme")), QStringLiteral("ZovelisLight"));
        QCOMPARE(readKConfigValue(content, QStringLiteral("General"), QStringLiteral("Name")), QStringLiteral("English"));
        QCOMPARE(readKConfigValue(content, QStringLiteral("General"), QStringLiteral("spaced")), QStringLiteral("value with spaces"));
        QCOMPARE(readKConfigValue(content, QStringLiteral("General"), QStringLiteral("escaped")), QStringLiteral("a b\\c"));
        QCOMPARE(readKConfigValue(content, QStringLiteral("KDE"), QStringLiteral("LookAndFeelPackage")), QStringLiteral("org.zovelis.dark.desktop"));
        QCOMPARE(readKConfigValue(content, QStringLiteral("Colors:View][Inactive"), QStringLiteral("BackgroundNormal")), QStringLiteral("1,2,3"));
        QCOMPARE(readKConfigValue(content, QStringLiteral("Locked"), QStringLiteral("key")), QStringLiteral("locked"));
        QCOMPARE(readKConfigValue(content, QStringLiteral("KDE"), QStringLiteral("missing"), QStringLiteral("fb")), QStringLiteral("fb"));
        QCOMPARE(readKConfigValue(content, QStringLiteral("Nope"), QStringLiteral("ColorScheme"), QStringLiteral("fb")), QStringLiteral("fb"));
        // Windows line endings.
        QCOMPARE(readKConfigValue(QStringLiteral("[A]\r\nk=v\r\n"), QStringLiteral("A"), QStringLiteral("k")), QStringLiteral("v"));
    }

    void shellVariable()
    {
        const QString ufw = QStringLiteral("# /etc/ufw/ufw.conf\nENABLED=no\nLOGLEVEL=low\nENABLED=yes\n");
        QCOMPARE(readShellVariable(ufw, QStringLiteral("ENABLED")), QStringLiteral("yes"));
        QCOMPARE(readShellVariable(QStringLiteral("ENABLED=\"yes\"\n"), QStringLiteral("ENABLED")), QStringLiteral("yes"));
        QCOMPARE(readShellVariable(QStringLiteral("ENABLED='no' \n"), QStringLiteral("ENABLED")), QStringLiteral("no"));
        QCOMPARE(readShellVariable(QStringLiteral("ENABLED=yes # comment\n"), QStringLiteral("ENABLED")), QStringLiteral("yes"));
        QCOMPARE(readShellVariable(QStringLiteral("#ENABLED=yes\n"), QStringLiteral("ENABLED")), QString());
        QCOMPARE(readShellVariable(QString(), QStringLiteral("ENABLED")), QString());
    }

    void aptValues()
    {
        const QString conf = QStringLiteral(
            "// Managed by Zovelis\n"
            "APT::Periodic::Update-Package-Lists \"1\";\n"
            "/* block\n APT::Periodic::Unattended-Upgrade \"7\"; */\n"
            "apt::periodic::unattended-upgrade \"1\"; // trailing comment\n"
            "# APT::Periodic::Unattended-Upgrade \"9\";\n"
            "Unattended-Upgrade::Mail \"root//x\";\n");
        QCOMPARE(readAptValue(conf, QStringLiteral("APT::Periodic::Unattended-Upgrade")), QStringLiteral("1"));
        QCOMPARE(readAptValue(conf, QStringLiteral("APT::Periodic::Update-Package-Lists")), QStringLiteral("1"));
        QCOMPARE(readAptValue(conf, QStringLiteral("Unattended-Upgrade::Mail")), QStringLiteral("root//x"));
        QCOMPARE(readAptValue(conf, QStringLiteral("APT::Periodic::Missing")), QString());
        QCOMPARE(readAptValue(QStringLiteral("APT::Periodic::Unattended-Upgrade \"0\";"), QStringLiteral("APT::Periodic::Unattended-Upgrade")), QStringLiteral("0"));
        // Two statements on one line.
        QCOMPARE(readAptValue(QStringLiteral("A::B \"1\"; A::C \"2\";"), QStringLiteral("A::C")), QStringLiteral("2"));
    }

    void fonts()
    {
        const QString qt6 = QStringLiteral("Noto Sans,10,-1,5,400,0,0,0,0,0,0,0,0,0,0,1");
        QCOMPARE(withPointSize(qt6, 12), QStringLiteral("Noto Sans,12,-1,5,400,0,0,0,0,0,0,0,0,0,0,1"));
        QCOMPARE(withPointSize(QStringLiteral("Hack,10,-1,5,50,0,0,0,0,0"), 14), QStringLiteral("Hack,14,-1,5,50,0,0,0,0,0"));
        QCOMPARE(withPointSize(QStringLiteral("Noto Sans,9.5,-1"), 10), QStringLiteral("Noto Sans,10,-1"));
        QCOMPARE(withPointSize(QStringLiteral("Noto Sans,-1,13"), 12), QStringLiteral("Noto Sans,12,-1")); // pixel size cleared
        QCOMPARE(withPointSize(QString(), 12), QString());
        QCOMPARE(withPointSize(QStringLiteral(",10"), 12), QString());
        QCOMPARE(withPointSize(qt6, 0), QString());
        QCOMPARE(pointSizeOf(qt6), 10.0);
        QCOMPARE(pointSizeOf(QStringLiteral("Noto Sans,10.5,-1")), 10.5);
        QCOMPARE(pointSizeOf(QStringLiteral("garbage")), -1.0);
        QCOMPARE(pointSizeOf(QStringLiteral("Noto Sans,abc")), -1.0);

        // The string we generate must round-trip through QFont.
        QFont font;
        QVERIFY(font.fromString(withPointSize(qt6, 14)));
        QCOMPARE(font.pointSize(), 14);
        QCOMPARE(font.family(), QStringLiteral("Noto Sans"));
    }

    void textSizes()
    {
        QCOMPARE(textSizeLevelForPointSize(9), 0);
        QCOMPARE(textSizeLevelForPointSize(10), 0);
        QCOMPARE(textSizeLevelForPointSize(10.9), 0);
        QCOMPARE(textSizeLevelForPointSize(12), 1);
        QCOMPARE(textSizeLevelForPointSize(14), 2);
        QCOMPARE(textSizeLevelForPointSize(20), 2);
        for (int level = 0; level <= 2; ++level) {
            QCOMPARE(textSizeLevelForPointSize(basePointSizeForLevel(level)), level);
        }
        QCOMPARE(basePointSizeForLevel(-5), 10);
    }

    void appstreamIds_data()
    {
        QTest::addColumn<QString>("id");
        QTest::addColumn<bool>("valid");
        QTest::newRow("libreoffice") << QStringLiteral("org.libreoffice.LibreOffice") << true;
        QTest::newRow("dash") << QStringLiteral("com.obsproject.Studio-beta") << true;
        QTest::newRow("underscore") << QStringLiteral("io.github.some_app") << true;
        QTest::newRow("desktop suffix") << QStringLiteral("org.kde.dolphin.desktop") << true;
        QTest::newRow("empty") << QString() << false;
        QTest::newRow("space") << QStringLiteral("org.example App") << false;
        QTest::newRow("leading dash") << QStringLiteral("--help") << false;
        QTest::newRow("leading dot") << QStringLiteral(".hidden") << false;
        QTest::newRow("double dot") << QStringLiteral("org..example") << false;
        QTest::newRow("slash") << QStringLiteral("org/example") << false;
        QTest::newRow("scheme") << QStringLiteral("appstream://x") << false;
        QTest::newRow("shell") << QStringLiteral("a;rm") << false;
        QTest::newRow("newline") << QStringLiteral("a\nb") << false;
        QTest::newRow("unicode") << QStringLiteral("org.exämple") << false;
        QTest::newRow("too long") << QString(300, QLatin1Char('a')) << false;
    }

    void appstreamIds()
    {
        QFETCH(QString, id);
        QFETCH(bool, valid);
        QCOMPARE(isValidAppstreamId(id), valid);
    }

    void colorSchemes()
    {
        QCOMPARE(parseSchemeColor(QStringLiteral("15,115,126")), QColor(15, 115, 126));
        QCOMPARE(parseSchemeColor(QStringLiteral("#0f737e")), QColor(15, 115, 126));
        QCOMPARE(parseSchemeColor(QStringLiteral("1,2,3,128")).alpha(), 128);
        QVERIFY(!parseSchemeColor(QStringLiteral("256,0,0")).isValid());
        QVERIFY(!parseSchemeColor(QStringLiteral("1,2")).isValid());
        QVERIFY(!parseSchemeColor(QStringLiteral("red")).isValid());

        const QString scheme = QStringLiteral(
            "[Colors:Window]\nBackgroundNormal=22,27,34\nForegroundNormal=232,237,242\n"
            "[Colors:View]\nBackgroundNormal=15,20,25\nForegroundNormal=232,237,242\nForegroundInactive=154,167,179\n"
            "[Colors:Button]\nBackgroundNormal=34,42,51\nForegroundNormal=232,237,242\n"
            "[Colors:Selection]\nBackgroundNormal=15,115,126\nForegroundNormal=255,255,255\n");
        QPalette palette;
        QVERIFY(paletteFromColorScheme(scheme, &palette));
        QCOMPARE(palette.color(QPalette::Active, QPalette::Window), QColor(22, 27, 34));
        QCOMPARE(palette.color(QPalette::Active, QPalette::Highlight), QColor(15, 115, 126));
        QCOMPARE(palette.color(QPalette::Active, QPalette::PlaceholderText), QColor(154, 167, 179));
        QVERIFY(!paletteFromColorScheme(QStringLiteral("[Colors:Window]\nBackgroundNormal=1,2,3\n"), &palette));
    }
};

QTEST_MAIN(TestConfigFiles)
#include "test_configfiles.moc"
