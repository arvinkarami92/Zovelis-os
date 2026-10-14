// SPDX-License-Identifier: GPL-3.0-or-later
// Small, dependency-free parsers for the system files Zovelis Welcome reads.
// Everything here is pure (no I/O) so it can be unit-tested in isolation.
#pragma once

#include <QHash>
#include <QString>

namespace Zovelis
{

// Parses os-release(5) content: KEY=VALUE lines, values optionally quoted
// with ' or ", backslash escapes inside double quotes. Invalid lines are skipped.
QHash<QString, QString> parseOsRelease(const QString &content);

// Reads one value from a KConfig-style file (kdeglobals, zovelis-welcomerc).
// `group` may be nested, written as "Outer][Inner" (KConfig's own notation).
// Entry flags such as key[$e] or key[$i] are accepted; localized keys
// (key[de]) are ignored. Returns `fallback` when the key is absent.
QString readKConfigValue(const QString &content, const QString &group, const QString &key, const QString &fallback = QString());

// Reads KEY from a shell-style assignment file such as /etc/ufw/ufw.conf.
QString readShellVariable(const QString &content, const QString &key);

// Reads a scalar from an APT configuration fragment, e.g.
//   APT::Periodic::Unattended-Upgrade "1";
// Key matching is case-insensitive, as in APT. Returns an empty string if absent.
QString readAptValue(const QString &content, const QString &key);

// Returns a QFont::toString() style string with the point size replaced by
// `pointSize`. Accepts both the Qt 5 (10 field) and Qt 6 (16/17 field) formats.
// Returns an empty string if `fontString` cannot be parsed.
QString withPointSize(const QString &fontString, int pointSize);

// Point size stored in a QFont::toString() style string, or -1.
double pointSizeOf(const QString &fontString);

// AppStream component IDs: reverse-DNS, letters, digits, '.', '_' and '-'.
// Used to validate anything we pass to the software centre.
bool isValidAppstreamId(const QString &id);

// Text size presets offered in the UI: 0 = default, 1 = large, 2 = larger.
int textSizeLevelForPointSize(double pointSize);
int basePointSizeForLevel(int level);

} // namespace Zovelis
