import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "10-ai-promtov-s-primerami.pdf"
IMAGE_DIR = ROOT / "scripts" / "assets" / "prompt-pack"

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_ITALIC = "/System/Library/Fonts/Supplemental/Arial Italic.ttf"

pdfmetrics.registerFont(TTFont("Arial", FONT_REGULAR))
pdfmetrics.registerFont(TTFont("Arial-Bold", FONT_BOLD))
pdfmetrics.registerFont(TTFont("Arial-Italic", FONT_ITALIC))

PAGE_W, PAGE_H = A4
BLUE = colors.HexColor("#5277F5")
INK = colors.HexColor("#171A24")
MUTED = colors.HexColor("#646B7A")
PAPER = colors.HexColor("#F7F8FC")
PALE_BLUE = colors.HexColor("#EAF0FF")
LIME = colors.HexColor("#DFFF72")
PINK = colors.HexColor("#FF72B6")


def escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )


def page_background(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    canvas.setFillColor(BLUE)
    canvas.roundRect(17 * mm, PAGE_H - 22 * mm, 12 * mm, 4 * mm, 2 * mm, fill=1, stroke=0)
    canvas.setFillColor(PINK)
    canvas.circle(PAGE_W - 22 * mm, PAGE_H - 20 * mm, 5 * mm, fill=1, stroke=0)
    canvas.setFillColor(LIME)
    canvas.circle(PAGE_W - 29 * mm, PAGE_H - 26 * mm, 2.5 * mm, fill=1, stroke=0)

    canvas.setStrokeColor(colors.HexColor("#DCE1EC"))
    canvas.setLineWidth(0.7)
    canvas.line(17 * mm, 15 * mm, PAGE_W - 17 * mm, 15 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Arial", 8.5)
    canvas.drawString(17 * mm, 9.5 * mm, "10 промтов для сильных AI-визуалов")
    canvas.drawRightString(PAGE_W - 17 * mm, 9.5 * mm, str(doc.page))
    canvas.restoreState()


styles = getSampleStyleSheet()
title = ParagraphStyle(
    "Title",
    parent=styles["Title"],
    fontName="Arial-Bold",
    fontSize=30,
    leading=34,
    textColor=INK,
    alignment=TA_LEFT,
    spaceAfter=8 * mm,
)
subtitle = ParagraphStyle(
    "Subtitle",
    fontName="Arial",
    fontSize=13,
    leading=19,
    textColor=MUTED,
    spaceAfter=6 * mm,
)
h1 = ParagraphStyle(
    "H1",
    fontName="Arial-Bold",
    fontSize=23,
    leading=27,
    textColor=INK,
    spaceAfter=6 * mm,
)
h2 = ParagraphStyle(
    "H2",
    fontName="Arial-Bold",
    fontSize=15,
    leading=19,
    textColor=INK,
    spaceAfter=2.5 * mm,
)
body = ParagraphStyle(
    "Body",
    fontName="Arial",
    fontSize=10.5,
    leading=15,
    textColor=INK,
    spaceAfter=3 * mm,
)
small = ParagraphStyle(
    "Small",
    fontName="Arial",
    fontSize=8.7,
    leading=12.5,
    textColor=MUTED,
)
prompt_style = ParagraphStyle(
    "Prompt",
    fontName="Arial",
    fontSize=8.4,
    leading=11.7,
    textColor=INK,
)
label = ParagraphStyle(
    "Label",
    fontName="Arial-Bold",
    fontSize=8.5,
    leading=10,
    textColor=BLUE,
    spaceAfter=2 * mm,
)
center = ParagraphStyle(
    "Center",
    fontName="Arial-Bold",
    fontSize=18,
    leading=23,
    textColor=INK,
    alignment=TA_CENTER,
)

card_title = ParagraphStyle(
    "CardTitle",
    fontName="Arial-Bold",
    fontSize=15,
    leading=18,
    textColor=INK,
    spaceAfter=1.2 * mm,
)

card_use = ParagraphStyle(
    "CardUse",
    fontName="Arial",
    fontSize=8.6,
    leading=11.5,
    textColor=MUTED,
    spaceAfter=3.5 * mm,
)

step_title = ParagraphStyle(
    "StepTitle",
    fontName="Arial-Bold",
    fontSize=11,
    leading=13,
    textColor=INK,
    alignment=TA_CENTER,
)

step_body = ParagraphStyle(
    "StepBody",
    fontName="Arial",
    fontSize=8.5,
    leading=11,
    textColor=MUTED,
    alignment=TA_CENTER,
)


from prompt_pack_data import PROMPTS  # noqa: E402


IMAGE_FILES = {
    "01": "01-liquid-chrome.jpg",
    "02": "02-makoto-shinkai.jpg",
    "03": "03-nostalgic-bloom.jpg",
    "04": "04-punk-collage.jpg",
    "05": "05-paper-diorama.jpg",
    "06": "06-screentone-popart.jpg",
    "07": "07-painterly.jpg",
    "08": "08-sprite-art.jpg",
    "09": "09-photo-rescue.jpg",
    "10": "10-cinematic-remaster.jpg",
}


def result_image(number, width=49.5 * mm, height=88 * mm):
    image_path = IMAGE_DIR / IMAGE_FILES[number]
    if not image_path.exists():
        raise FileNotFoundError(f"Missing result image: {image_path}")
    return Image(str(image_path), width=width, height=height)


def prompt_card(number, name, use_case, prompt):
    text_column = [
        Paragraph(f"ПРОМТ {number}", label),
        Paragraph(escape(name), card_title),
        Paragraph(escape(use_case), card_use),
        Paragraph("СКОПИРУЙТЕ ЦЕЛИКОМ", label),
        Paragraph(escape(prompt), prompt_style),
    ]
    table = Table(
        [[result_image(number), text_column]],
        colWidths=[56 * mm, 110 * mm],
        rowHeights=[92 * mm],
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#DCE1EC")),
                ("LINEAFTER", (0, 0), (0, 0), 0.8, colors.HexColor("#DCE1EC")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, 0), 3 * mm),
                ("RIGHTPADDING", (0, 0), (0, 0), 3 * mm),
                ("TOPPADDING", (0, 0), (0, 0), 2 * mm),
                ("BOTTOMPADDING", (0, 0), (0, 0), 2 * mm),
                ("LEFTPADDING", (1, 0), (1, 0), 5 * mm),
                ("RIGHTPADDING", (1, 0), (1, 0), 5 * mm),
                ("TOPPADDING", (1, 0), (1, 0), 5 * mm),
                ("BOTTOMPADDING", (1, 0), (1, 0), 4 * mm),
            ]
        )
    )
    return KeepTogether([table])


def cover_gallery():
    images = [
        result_image("01", 51 * mm, 90.7 * mm),
        result_image("04", 51 * mm, 90.7 * mm),
        result_image("07", 51 * mm, 90.7 * mm),
    ]
    gallery = Table([images], colWidths=[54 * mm] * 3, rowHeights=[94 * mm])
    gallery.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#DCE1EC")),
                ("INNERGRID", (0, 0), (-1, -1), 0.8, colors.HexColor("#DCE1EC")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 1.5 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1.5 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 1.5 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5 * mm),
            ]
        )
    )
    return gallery


def quick_steps():
    cells = [
        [Paragraph("1. ЗАГРУЗИТЕ", step_title), Paragraph("2. СКОПИРУЙТЕ", step_title), Paragraph("3. АДАПТИРУЙТЕ", step_title)],
        [
            Paragraph("Добавьте исходное фото с хорошо видимым объектом.", step_body),
            Paragraph("Вставьте выбранный промт в генератор целиком.", step_body),
            Paragraph("При необходимости поменяйте только свет, фон или детали.", step_body),
        ],
    ]
    steps = Table(cells, colWidths=[54 * mm] * 3)
    steps.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PALE_BLUE),
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#BED0FF")),
                ("INNERGRID", (0, 0), (-1, -1), 0.8, colors.HexColor("#BED0FF")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, 0), 4 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1 * mm),
                ("TOPPADDING", (0, 1), (-1, 1), 1 * mm),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 4 * mm),
                ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
            ]
        )
    )
    return steps


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=29 * mm,
        bottomMargin=22 * mm,
        title="10 промтов для сильных AI-визуалов",
        author="ViralReel Studio",
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )
    doc.addPageTemplates(PageTemplate(id="main", frames=[frame], onPage=page_background))

    story = [
        Spacer(1, 3 * mm),
        Paragraph("10 промтов для сильных<br/>AI-визуалов", title),
        Paragraph(
            "Готовые формулировки для Nano Banana Pro: стилизация, восстановление фото и кинематографичный 4K. На каждой странице — промт и наглядный пример результата.",
            subtitle,
        ),
        cover_gallery(),
        Spacer(1, 6 * mm),
        quick_steps(),
        Spacer(1, 5 * mm),
        Paragraph(
            "Совет: если лицо или поза изменились, добавьте в конец: <b>Preserve the exact facial identity, pose and composition from the reference image.</b>",
            small,
        ),
        PageBreak(),
    ]

    for index in range(0, len(PROMPTS), 2):
        section_name = "Визуальные стили" if index < 8 else "Восстановление и качество"
        story.append(Paragraph(section_name, h1))
        for prompt in PROMPTS[index:index + 2]:
            story.append(prompt_card(*prompt))
            story.append(Spacer(1, 6 * mm))
        if index + 2 < len(PROMPTS):
            story.append(PageBreak())

    doc.build(story)
    print(OUTPUT)


if __name__ == "__main__":
    build()
