// SPDX-License-Identifier: GPL-3.0-or-later
#include "iconprovider.h"

#include <QIcon>
#include <QPixmap>

IconProvider::IconProvider()
    : QQuickImageProvider(QQuickImageProvider::Pixmap)
{
}

QPixmap IconProvider::requestPixmap(const QString &id, QSize *size, const QSize &requestedSize)
{
    const int width = requestedSize.width() > 0 ? requestedSize.width() : 64;
    const int height = requestedSize.height() > 0 ? requestedSize.height() : width;
    QPixmap pixmap;
    const QStringList names = id.split(QLatin1Char('|'), Qt::SkipEmptyParts);
    for (const QString &name : names) {
        const QIcon icon = QIcon::fromTheme(name);
        if (!icon.isNull()) {
            pixmap = icon.pixmap(QSize(width, height));
            break;
        }
    }
    if (pixmap.isNull()) {
        pixmap = QPixmap(width, height);
        pixmap.fill(Qt::transparent);
    }
    if (size) {
        *size = pixmap.size();
    }
    return pixmap;
}
