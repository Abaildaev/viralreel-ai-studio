"""
Сборка пака промптов в PDF — версия на парах «до и после».

Все десять формул переделывают загруженный кадр, а не рисуют с нуля. Пак,
показывающий только результат, поэтому нечестен вдвойне: непонятно, что
сделал промпт, и нечем доказать, что сделал именно он. Здесь на каждой
странице слева исходник, справа результат, между ними — сама формула.

Одна страница на промпт: картинки крупные, промпт моноширинным и целиком,
внизу — где у формулы ручка.

    python3 scripts/build_prompt_pack.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prompt_pack_data import (  # noqa: E402
    BEFORE_FILES,
    PROMPTS,
    SECTIONS,
    SLUGS,
    TWEAKS,
)

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "scripts" / "assets" / "prompt-pack-v2"
FONTS = ROOT / "scripts" / "assets" / "fonts"
OUTPUT = ROOT / "output" / "pdf" / "10-promptov-do-posle.pdf"

#: Кнопки на последней странице. Пак пересылают чаще всего остального,
#: и без этих двух ссылок каждая пересылка уходит в никуда.
BOT_URL = "https://t.me/"
CHANNEL_URL = "https://t.me/"

# ─── палитра ────────────────────────────────────────────────────────────────
# Картинки на каждой странице разноцветные и громкие, поэтому оправа молчит:
# белая бумага, графитовый текст, один синий на номерах и ссылках.

INK = colors.HexColor("#10131A")
MUTED = colors.HexColor("#6E7480")
HAIR = colors.HexColor("#E2E5EB")
PANEL = colors.HexColor("#F5F6F8")
ACCENT = colors.HexColor("#2C5CFF")
PAPER = colors.white

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

#: Разрешение, под которое ужимаются картинки.
#:
#: Оригиналы — PNG по 4–6 МБ каждый, и пак из двадцати таких весит под семьдесят
#: мегабайт: Telegram не отдаёт документы тяжелее пятидесяти, а качать столько
#: ради десяти промптов никто не станет. 220 dpi хватает, чтобы на печати не
#: было видно пикселей, а на экране разница неразличима.
PRINT_DPI = 220
JPEG_QUALITY = 84


def register_fonts() -> None:
    faces = {
        "Pack-Display": "Unbounded-ExtraBold.ttf",
        "Pack": "Manrope-Regular.ttf",
        "Pack-Bold": "Manrope-Bold.ttf",
        "Pack-Mono": "JetBrainsMono-Regular.ttf",
    }
    for name, filename in faces.items():
        path = FONTS / filename
        if not path.exists():
            sys.exit(f"Нет шрифта {path}. Запустите scripts/fetch_pack_fonts.py")
        pdfmetrics.registerFont(TTFont(name, str(path)))


def style(name: str, **kwargs) -> ParagraphStyle:
    return ParagraphStyle(name, **kwargs)


def escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_styles() -> dict[str, ParagraphStyle]:
    return {
        "cover_title": style(
            "cover_title", fontName="Pack-Display", fontSize=27, leading=34,
            textColor=INK, spaceAfter=5 * mm,
        ),
        "cover_lead": style(
            "cover_lead", fontName="Pack", fontSize=11, leading=17,
            textColor=MUTED, spaceAfter=7 * mm,
        ),
        "number": style(
            "number", fontName="Pack-Display", fontSize=26, leading=30, textColor=ACCENT,
        ),
        "name": style(
            "name", fontName="Pack-Display", fontSize=15, leading=19, textColor=INK,
        ),
        "purpose": style(
            "purpose", fontName="Pack", fontSize=9.5, leading=13, textColor=MUTED,
        ),
        "eyebrow": style(
            "eyebrow", fontName="Pack-Bold", fontSize=7, leading=9, textColor=MUTED,
        ),
        "prompt": style(
            "prompt", fontName="Pack-Mono", fontSize=7.6, leading=11.4, textColor=INK,
        ),
        "tweak": style(
            "tweak", fontName="Pack", fontSize=8.6, leading=12.6, textColor=INK,
        ),
        "caption": style(
            "caption", fontName="Pack-Bold", fontSize=7, leading=9,
            textColor=MUTED, alignment=TA_CENTER,
        ),
        "step_head": style(
            "step_head", fontName="Pack-Bold", fontSize=9, leading=12, textColor=INK,
        ),
        "step_body": style(
            "step_body", fontName="Pack", fontSize=8.4, leading=11.6, textColor=MUTED,
        ),
        "cta_title": style(
            "cta_title", fontName="Pack-Display", fontSize=20, leading=26,
            textColor=INK, spaceAfter=4 * mm,
        ),
        "cta_body": style(
            "cta_body", fontName="Pack", fontSize=10, leading=15, textColor=MUTED,
        ),
        "cta_button": style(
            "cta_button", fontName="Pack-Bold", fontSize=10.5, leading=14,
            textColor=colors.white, alignment=TA_CENTER,
        ),
    }


def page_furniture(canvas, doc) -> None:
    """Тонкая линия и подпись внизу. Больше на странице ничего не нужно."""
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    if doc.page > 1:
        canvas.setStrokeColor(HAIR)
        canvas.setLineWidth(0.6)
        canvas.line(MARGIN, 13 * mm, PAGE_W - MARGIN, 13 * mm)

        canvas.setFillColor(MUTED)
        canvas.setFont("Pack", 7.5)
        canvas.drawString(MARGIN, 8.5 * mm, "10 промптов для Nano Banana Pro")
        canvas.drawRightString(PAGE_W - MARGIN, 8.5 * mm, str(doc.page))

    canvas.restoreState()


def print_ready(filename: str, width_mm: float) -> Path:
    """
    Копия картинки под нужный размер на странице.

    Кэшируется: пересборка PDF не переделывает то, что уже ужато.
    """
    target_px = int(width_mm / 25.4 * PRINT_DPI)
    cache = IMAGES / "print"
    cache.mkdir(exist_ok=True)
    target = cache / f"{Path(filename).stem}-{target_px}.jpg"

    if not target.exists():
        source = PILImage.open(IMAGES / filename).convert("RGB")
        height_px = round(target_px * source.height / source.width)
        source.resize((target_px, height_px), PILImage.LANCZOS).save(
            target, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True
        )

    return target


def picture(filename: str, width: float) -> Image:
    """Картинка 9:16, вписанная в заданную ширину."""
    path = print_ready(filename, width / mm)
    return Image(str(path), width=width, height=width * 16 / 9)


def before_after(number: str, styles: dict, width: float) -> Table:
    half = (width - 5 * mm) / 2
    before = picture(BEFORE_FILES[number], half)
    after = picture(f"{number}-{SLUGS[number]}.png", half)

    grid = Table(
        [
            [Paragraph("ДО", styles["caption"]), Paragraph("ПОСЛЕ", styles["caption"])],
            [before, after],
        ],
        colWidths=[half, half],
        rowHeights=[5 * mm, half * 16 / 9],
    )
    grid.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1.5 * mm),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 0),
            ]
        )
    )
    return grid


def prompt_block(prompt: str, styles: dict, width: float) -> Table:
    block = Table(
        [
            [Paragraph("ПРОМПТ — КОПИРУЙТЕ ЦЕЛИКОМ, БЕЗ СОКРАЩЕНИЙ", styles["eyebrow"])],
            [Paragraph(escape(prompt), styles["prompt"])],
        ],
        colWidths=[width],
    )
    block.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PANEL),
                ("LINEBEFORE", (0, 0), (0, -1), 2, ACCENT),
                ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("TOPPADDING", (0, 0), (-1, 0), 4 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 2 * mm),
                ("TOPPADDING", (0, 1), (-1, 1), 0),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 4.5 * mm),
            ]
        )
    )
    return block


def prompt_page(entry, styles: dict, width: float) -> list:
    number, name, purpose, prompt = entry

    heading = Table(
        [[
            Paragraph(number, styles["number"]),
            [
                Paragraph(escape(name), styles["name"]),
                Paragraph(escape(purpose), styles["purpose"]),
            ],
            Paragraph(SECTIONS[number].upper(), styles["eyebrow"]),
        ]],
        colWidths=[24 * mm, width - 66 * mm, 42 * mm],
    )
    heading.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (1, 0), "TOP"),
                ("VALIGN", (2, 0), (2, 0), "TOP"),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    tweak = Table(
        [[Paragraph(f"<b>Что менять под себя:</b> {escape(TWEAKS[number])}", styles["tweak"])]],
        colWidths=[width],
    )
    tweak.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (-1, 0), 0.6, HAIR),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    return [
        heading,
        Spacer(1, 5 * mm),
        before_after(number, styles, width),
        Spacer(1, 5 * mm),
        prompt_block(prompt, styles, width),
        Spacer(1, 3.5 * mm),
        tweak,
    ]


def cover(styles: dict, width: float, available: list[str]) -> list:
    strip_numbers = [n for n in ("01", "02", "06", "07") if n in available][:3]
    tile = (width - 3 * 4 * mm) / 4
    row = [picture("00-before.png", tile)]
    labels = [Paragraph("ИСХОДНИК", styles["caption"])]
    for number in strip_numbers:
        row.append(picture(f"{number}-{SLUGS[number]}.png", tile))
        labels.append(Paragraph(escape(dict((p[0], p[1]) for p in PROMPTS)[number]).upper(), styles["caption"]))

    strip = Table(
        [labels, row],
        colWidths=[tile + 4 * mm] * len(row),
        rowHeights=[5 * mm, tile * 16 / 9],
    )
    strip.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1.5 * mm),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 0),
            ]
        )
    )

    steps = Table(
        [
            [
                Paragraph("1. Возьмите своё фото", styles["step_head"]),
                Paragraph("2. Скопируйте промпт", styles["step_head"]),
                Paragraph("3. Поменяйте одну деталь", styles["step_head"]),
            ],
            [
                Paragraph("Вертикальное, с хорошо видимым лицом или объектом.", styles["step_body"]),
                Paragraph("Целиком, без сокращений — формула работает как одно целое.", styles["step_body"]),
                Paragraph("Внизу каждой страницы написано, где у формулы ручка.", styles["step_body"]),
            ],
        ],
        colWidths=[width / 3] * 3,
    )
    steps.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEABOVE", (0, 0), (-1, 0), 0.6, HAIR),
                ("LEFTPADDING", (0, 0), (0, -1), 0),
                ("LEFTPADDING", (1, 0), (-1, -1), 6 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6 * mm),
                ("TOPPADDING", (0, 0), (-1, 0), 4 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1.5 * mm),
                ("TOPPADDING", (0, 1), (-1, 1), 0),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 0),
            ]
        )
    )

    tip = Table(
        [[Paragraph(
            "<b>Если лицо или поза уехали</b> — допишите в конец промпта: "
            "<font face=\"Pack-Mono\" size=\"8\">Preserve the exact facial identity, "
            "pose and composition from the reference image.</font> "
            "Эта строка возвращает сходство любой из десяти формул.",
            styles["step_body"],
        )]],
        colWidths=[width],
    )
    tip.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PANEL),
                ("LINEBEFORE", (0, 0), (0, -1), 2, ACCENT),
                ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
            ]
        )
    )

    return [
        Paragraph("10 промптов<br/>для Nano Banana Pro", styles["cover_title"]),
        Paragraph(
            "Одно фото — десять стилей. Каждая формула проверена на одном и том же "
            "снимке, поэтому видно, что результат меняет промпт, а не новая съёмка. "
            "На каждой странице слева исходник, справа результат.",
            styles["cover_lead"],
        ),
        strip,
        Spacer(1, 7 * mm),
        steps,
        # Совет прижат к низу: иначе обложка обрывается на середине страницы,
        # и пустота внизу читается как незакончённая вёрстка, а не как воздух.
        Spacer(1, 27 * mm),
        tip,
    ]


def button(text: str, url: str, styles: dict, width: float) -> Table:
    cell = Table(
        [[Paragraph(f'<a href="{url}" color="white">{escape(text)}</a>', styles["cta_button"])]],
        colWidths=[width],
    )
    cell.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), ACCENT),
                ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
            ]
        )
    )
    return cell


def closing(styles: dict, width: float) -> list:
    return [
        Spacer(1, 12 * mm),
        Paragraph("Где это запускать", styles["cta_title"]),
        Paragraph(
            "Все формулы написаны под Nano Banana Pro. Открывайте бота, выбирайте модель "
            "и вставляйте промпт целиком — останется только заменить детали под свою "
            "задачу и получить управляемый результат.",
            styles["cta_body"],
        ),
        Spacer(1, 6 * mm),
        button("ПИШИ «ПРОМПТ» — забери пак", BOT_URL, styles, width),
        Spacer(1, 10 * mm),
        Paragraph(
            "Эти десять — стартовый набор. Новые промпты, разборы и уроки по нейросетям "
            "выходят в канале каждый день.",
            styles["cta_body"],
        ),
        Spacer(1, 6 * mm),
        button("Забрать остальные промпты", CHANNEL_URL, styles, width),
    ]


def main() -> None:
    register_fonts()
    styles = build_styles()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    available = [
        number for number in SLUGS
        if (IMAGES / f"{number}-{SLUGS[number]}.png").exists()
    ]
    missing = [number for number in SLUGS if number not in available]
    if missing:
        print(f"Нет примеров для {', '.join(missing)} — эти страницы пропущены.")
    if not available:
        sys.exit("Ни одного примера не найдено, собирать нечего.")

    doc = BaseDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=20 * mm,
        title="10 промптов для Nano Banana Pro",
        author="Промпты и нейросети",
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    doc.addPageTemplates(PageTemplate(id="main", frames=[frame], onPage=page_furniture))

    story: list = cover(styles, doc.width, available)

    for entry in PROMPTS:
        if entry[0] not in available:
            continue
        story.append(PageBreak())
        story.extend(prompt_page(entry, styles, doc.width))

    story.append(PageBreak())
    story.extend(closing(styles, doc.width))

    doc.build(story)
    size_mb = OUTPUT.stat().st_size / 1024 / 1024
    print(f"{OUTPUT}  ({len(available)} промптов, {size_mb:.1f} МБ)")


if __name__ == "__main__":
    main()
