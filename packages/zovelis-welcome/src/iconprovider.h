// SPDX-License-Identifier: GPL-3.0-or-later
// Serves icons from the active icon theme to QML as image://icon/<name>.
// Several names may be given separated by '|'; the first one found wins.
#pragma once

#include <QQuickImageProvider>

class IconProvider : public QQuickImageProvider
{
public:
    IconProvider();
    QPixmap requestPixmap(const QString &id, QSize *size, const QSize &requestedSize) override;
};
