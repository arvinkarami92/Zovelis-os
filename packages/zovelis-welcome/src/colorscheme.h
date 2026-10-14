// SPDX-License-Identifier: GPL-3.0-or-later
// Converts a KDE colour scheme (*.colors) into a QPalette, the way Plasma's
// platform theme does it closely enough for testing and screenshots. On a
// real Plasma desktop the platform theme provides the palette instead.
#pragma once

#include <QPalette>
#include <QString>

namespace Zovelis
{
// Returns false if the scheme lacks the essential colours.
bool paletteFromColorScheme(const QString &schemeContent, QPalette *palette);
// Parses "r,g,b" or "#rrggbb". Returns an invalid QColor on failure.
QColor parseSchemeColor(const QString &value);
}
