// SPDX-License-Identifier: GPL-3.0-or-later
// svgrender: rasterise an SVG with Qt SVG (the same renderer Plasma uses for icons).
// Usage: svgrender input.svg output.png WIDTH [HEIGHT] [--background #rrggbb]
#include <QGuiApplication>
#include <QImage>
#include <QPainter>
#include <QSvgRenderer>
#include <cstdio>

int main(int argc, char **argv)
{
    QGuiApplication app(argc, argv);
    const QStringList args = app.arguments();
    if (args.size() < 4) {
        std::fprintf(stderr, "usage: svgrender in.svg out.png width [height] [--background color]\n");
        return 2;
    }
    QSvgRenderer renderer(args.at(1));
    if (!renderer.isValid()) {
        std::fprintf(stderr, "invalid svg: %s\n", qPrintable(args.at(1)));
        return 1;
    }
    const int width = args.at(3).toInt();
    int height = width * renderer.defaultSize().height() / qMax(1, renderer.defaultSize().width());
    QColor background(Qt::transparent);
    for (int i = 4; i < args.size(); ++i) {
        if (args.at(i) == QLatin1String("--background") && i + 1 < args.size()) {
            background = QColor(args.at(++i));
        } else {
            height = args.at(i).toInt();
        }
    }
    QImage image(width, height, QImage::Format_ARGB32_Premultiplied);
    image.fill(background);
    QPainter painter(&image);
    painter.setRenderHints(QPainter::Antialiasing | QPainter::SmoothPixmapTransform);
    renderer.render(&painter, QRectF(0, 0, width, height));
    painter.end();
    if (!image.save(args.at(2))) {
        std::fprintf(stderr, "cannot write %s\n", qPrintable(args.at(2)));
        return 1;
    }
    return 0;
}
