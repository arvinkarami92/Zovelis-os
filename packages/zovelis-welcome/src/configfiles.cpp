// SPDX-License-Identifier: GPL-3.0-or-later
#include "configfiles.h"

#include <QRegularExpression>
#include <QStringList>

namespace Zovelis
{

namespace
{
QStringList splitLines(const QString &content)
{
    QString normalized = content;
    normalized.replace(QStringLiteral("\r\n"), QStringLiteral("\n"));
    return normalized.split(QLatin1Char('\n'));
}

// Unquotes a shell-style value: "double", 'single' or bare.
QString unquoteShellValue(const QString &raw)
{
    const QString value = raw.trimmed();
    if (value.isEmpty()) {
        return value;
    }
    const QChar first = value.front();
    if (first == QLatin1Char('\'')) {
        const qsizetype end = value.indexOf(QLatin1Char('\''), 1);
        return end < 0 ? value.mid(1) : value.mid(1, end - 1);
    }
    if (first == QLatin1Char('"')) {
        QString out;
        for (qsizetype i = 1; i < value.size(); ++i) {
            const QChar c = value.at(i);
            if (c == QLatin1Char('\\') && i + 1 < value.size()) {
                out.append(value.at(++i));
            } else if (c == QLatin1Char('"')) {
                break;
            } else {
                out.append(c);
            }
        }
        return out;
    }
    // Bare word: stop at an unquoted comment.
    const qsizetype hash = value.indexOf(QStringLiteral(" #"));
    return (hash < 0 ? value : value.left(hash)).trimmed();
}

QString unescapeKConfig(const QString &raw)
{
    QString out;
    out.reserve(raw.size());
    for (qsizetype i = 0; i < raw.size(); ++i) {
        const QChar c = raw.at(i);
        if (c != QLatin1Char('\\') || i + 1 >= raw.size()) {
            out.append(c);
            continue;
        }
        const QChar n = raw.at(++i);
        switch (n.unicode()) {
        case 's':
            out.append(QLatin1Char(' '));
            break;
        case 't':
            out.append(QLatin1Char('\t'));
            break;
        case 'n':
            out.append(QLatin1Char('\n'));
            break;
        case 'r':
            out.append(QLatin1Char('\r'));
            break;
        case '\\':
            out.append(QLatin1Char('\\'));
            break;
        default:
            out.append(QLatin1Char('\\'));
            out.append(n);
            break;
        }
    }
    return out;
}
} // namespace

QHash<QString, QString> parseOsRelease(const QString &content)
{
    static const QRegularExpression keyPattern(QStringLiteral("^[A-Z0-9_]+$"));
    QHash<QString, QString> result;
    for (const QString &line : splitLines(content)) {
        const QString trimmed = line.trimmed();
        if (trimmed.isEmpty() || trimmed.startsWith(QLatin1Char('#'))) {
            continue;
        }
        const qsizetype eq = trimmed.indexOf(QLatin1Char('='));
        if (eq <= 0) {
            continue;
        }
        const QString key = trimmed.left(eq);
        if (!keyPattern.match(key).hasMatch()) {
            continue;
        }
        result.insert(key, unquoteShellValue(trimmed.mid(eq + 1)));
    }
    return result;
}

QString readKConfigValue(const QString &content, const QString &group, const QString &key, const QString &fallback)
{
    QString currentGroup; // entries before the first header live in the default group ""
    QString found = fallback;
    for (const QString &line : splitLines(content)) {
        const QString trimmed = line.trimmed();
        if (trimmed.isEmpty() || trimmed.startsWith(QLatin1Char('#'))) {
            continue;
        }
        if (trimmed.startsWith(QLatin1Char('[')) && trimmed.endsWith(QLatin1Char(']'))) {
            QString name = trimmed.mid(1, trimmed.size() - 2);
            if (name.endsWith(QStringLiteral("][$i"))) { // immutable group marker
                name.chop(4);
            }
            currentGroup = name;
            continue;
        }
        if (currentGroup != group) {
            continue;
        }
        const qsizetype eq = trimmed.indexOf(QLatin1Char('='));
        if (eq <= 0) {
            continue;
        }
        QString entryKey = trimmed.left(eq).trimmed();
        const qsizetype bracket = entryKey.indexOf(QLatin1Char('['));
        if (bracket >= 0) {
            const QString suffix = entryKey.mid(bracket);
            // Accept option flags like [$e] / [$i]; skip localized variants like [de].
            if (!suffix.startsWith(QStringLiteral("[$"))) {
                continue;
            }
            entryKey = entryKey.left(bracket).trimmed();
        }
        if (entryKey == key) {
            found = unescapeKConfig(trimmed.mid(eq + 1).trimmed());
        }
    }
    return found;
}

QString readShellVariable(const QString &content, const QString &key)
{
    QString found;
    for (const QString &line : splitLines(content)) {
        const QString trimmed = line.trimmed();
        if (trimmed.isEmpty() || trimmed.startsWith(QLatin1Char('#'))) {
            continue;
        }
        const qsizetype eq = trimmed.indexOf(QLatin1Char('='));
        if (eq <= 0 || trimmed.left(eq).trimmed() != key) {
            continue;
        }
        found = unquoteShellValue(trimmed.mid(eq + 1));
    }
    return found;
}

QString readAptValue(const QString &content, const QString &key)
{
    // Strip /* block */ comments first, then handle one statement per ';'.
    QString text = content;
    static const QRegularExpression blockComments(QStringLiteral("/\\*.*?\\*/"), QRegularExpression::DotMatchesEverythingOption);
    text.remove(blockComments);

    QString cleaned;
    for (const QString &line : splitLines(text)) {
        QString l = line;
        // A '//' or '#' outside quotes starts a comment.
        bool inQuotes = false;
        for (qsizetype i = 0; i < l.size(); ++i) {
            const QChar c = l.at(i);
            if (c == QLatin1Char('"')) {
                inQuotes = !inQuotes;
            } else if (!inQuotes && (c == QLatin1Char('#') || (c == QLatin1Char('/') && i + 1 < l.size() && l.at(i + 1) == QLatin1Char('/')))) {
                l.truncate(i);
                break;
            }
        }
        cleaned.append(l).append(QLatin1Char('\n'));
    }

    QString found;
    const QStringList statements = cleaned.split(QLatin1Char(';'));
    for (const QString &statement : statements) {
        const QString s = statement.simplified();
        if (s.isEmpty()) {
            continue;
        }
        const qsizetype space = s.indexOf(QLatin1Char(' '));
        if (space <= 0) {
            continue;
        }
        const QString k = s.left(space);
        if (k.compare(key, Qt::CaseInsensitive) != 0) {
            continue;
        }
        QString v = s.mid(space + 1).trimmed();
        if (v.size() >= 2 && v.startsWith(QLatin1Char('"')) && v.endsWith(QLatin1Char('"'))) {
            v = v.mid(1, v.size() - 2);
        }
        found = v;
    }
    return found;
}

QString withPointSize(const QString &fontString, int pointSize)
{
    QStringList fields = fontString.split(QLatin1Char(','));
    if (fields.size() < 2 || fields.at(0).trimmed().isEmpty() || pointSize <= 0) {
        return QString();
    }
    fields[1] = QString::number(pointSize);
    if (fields.size() > 2) {
        fields[2] = QStringLiteral("-1"); // pixel size must be unset when a point size is used
    }
    return fields.join(QLatin1Char(','));
}

double pointSizeOf(const QString &fontString)
{
    const QStringList fields = fontString.split(QLatin1Char(','));
    if (fields.size() < 2) {
        return -1;
    }
    bool ok = false;
    const double size = fields.at(1).toDouble(&ok);
    return (ok && size > 0) ? size : -1;
}

bool isValidAppstreamId(const QString &id)
{
    static const QRegularExpression pattern(QStringLiteral("^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$"));
    return pattern.match(id).hasMatch() && !id.contains(QStringLiteral(".."));
}

int textSizeLevelForPointSize(double pointSize)
{
    if (pointSize < 11.0) {
        return 0;
    }
    if (pointSize < 13.0) {
        return 1;
    }
    return 2;
}

int basePointSizeForLevel(int level)
{
    switch (level) {
    case 1:
        return 12;
    case 2:
        return 14;
    default:
        return 10;
    }
}

} // namespace Zovelis
