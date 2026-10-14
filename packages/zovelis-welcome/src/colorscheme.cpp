// SPDX-License-Identifier: GPL-3.0-or-later
#include "colorscheme.h"
#include "configfiles.h"

#include <QStringList>

namespace Zovelis
{

QColor parseSchemeColor(const QString &value)
{
    const QString v = value.trimmed();
    if (v.startsWith(QLatin1Char('#'))) {
        const QColor c = QColor::fromString(v);
        return c.isValid() ? c : QColor();
    }
    const QStringList parts = v.split(QLatin1Char(','));
    if (parts.size() < 3 || parts.size() > 4) {
        return QColor();
    }
    int rgba[4] = {0, 0, 0, 255};
    for (int i = 0; i < parts.size(); ++i) {
        bool ok = false;
        const int n = parts.at(i).trimmed().toInt(&ok);
        if (!ok || n < 0 || n > 255) {
            return QColor();
        }
        rgba[i] = n;
    }
    return QColor(rgba[0], rgba[1], rgba[2], rgba[3]);
}

bool paletteFromColorScheme(const QString &content, QPalette *palette)
{
    auto color = [&content](const char *set, const char *key) {
        return parseSchemeColor(readKConfigValue(content, QStringLiteral("Colors:%1").arg(QLatin1String(set)), QString::fromLatin1(key)));
    };
    const QColor window = color("Window", "BackgroundNormal");
    const QColor windowText = color("Window", "ForegroundNormal");
    const QColor base = color("View", "BackgroundNormal");
    const QColor text = color("View", "ForegroundNormal");
    const QColor button = color("Button", "BackgroundNormal");
    const QColor buttonText = color("Button", "ForegroundNormal");
    const QColor highlight = color("Selection", "BackgroundNormal");
    const QColor highlightedText = color("Selection", "ForegroundNormal");
    if (!window.isValid() || !windowText.isValid() || !base.isValid() || !text.isValid() || !highlight.isValid()
        || !highlightedText.isValid() || !button.isValid() || !buttonText.isValid()) {
        return false;
    }
    QColor alternateBase = color("View", "BackgroundAlternate");
    if (!alternateBase.isValid()) {
        alternateBase = base;
    }
    QColor placeholder = color("View", "ForegroundInactive");
    if (!placeholder.isValid()) {
        placeholder = text;
    }
    QColor link = color("View", "ForegroundLink");
    QColor visited = color("View", "ForegroundVisited");
    QColor tooltip = color("Tooltip", "BackgroundNormal");
    QColor tooltipText = color("Tooltip", "ForegroundNormal");

    QPalette p;
    for (QPalette::ColorGroup group : {QPalette::Active, QPalette::Inactive, QPalette::Disabled}) {
        const bool disabled = group == QPalette::Disabled;
        auto fade = [disabled, &window](const QColor &c) {
            if (!disabled) {
                return c;
            }
            return QColor((c.red() + window.red()) / 2, (c.green() + window.green()) / 2, (c.blue() + window.blue()) / 2);
        };
        p.setColor(group, QPalette::Window, window);
        p.setColor(group, QPalette::WindowText, fade(windowText));
        p.setColor(group, QPalette::Base, base);
        p.setColor(group, QPalette::AlternateBase, alternateBase);
        p.setColor(group, QPalette::Text, fade(text));
        p.setColor(group, QPalette::Button, button);
        p.setColor(group, QPalette::ButtonText, fade(buttonText));
        p.setColor(group, QPalette::Highlight, highlight);
        p.setColor(group, QPalette::HighlightedText, highlightedText);
        p.setColor(group, QPalette::PlaceholderText, placeholder);
        p.setColor(group, QPalette::BrightText, Qt::white);
        p.setColor(group, QPalette::Light, button.lighter(150));
        p.setColor(group, QPalette::Midlight, button.lighter(120));
        p.setColor(group, QPalette::Mid, button.darker(150));
        p.setColor(group, QPalette::Dark, button.darker(200));
        p.setColor(group, QPalette::Shadow, Qt::black);
        if (link.isValid()) {
            p.setColor(group, QPalette::Link, link);
        }
        if (visited.isValid()) {
            p.setColor(group, QPalette::LinkVisited, visited);
        }
        if (tooltip.isValid() && tooltipText.isValid()) {
            p.setColor(group, QPalette::ToolTipBase, tooltip);
            p.setColor(group, QPalette::ToolTipText, tooltipText);
        }
#if QT_VERSION >= QT_VERSION_CHECK(6, 6, 0)
        p.setColor(group, QPalette::Accent, highlight);
#endif
    }
    *palette = p;
    return true;
}

} // namespace Zovelis
