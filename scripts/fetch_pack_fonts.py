"""
Шрифты для пака промптов.

Пак раньше набирался Arial с системных путей macOS: во-первых, это сразу
читается как «документ из Word», во-вторых, скрипт собирался только на одной
машине. Здесь три гарнитуры из Google Fonts (лицензия OFL, вкладывать в
репозиторий можно), приведённые к статическим начертаниям — reportlab умеет
только их, а Google раздаёт вариативные.

Запускается один раз; файлы лежат в scripts/assets/fonts и коммитятся.

    python3 scripts/fetch_pack_fonts.py
"""

from __future__ import annotations

import io
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = Path(__file__).resolve().parent / "assets" / "fonts"
RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl"

#: Файл в репозитории Google → (вес, имя статического начертания).
#: Unbounded держит заголовки, Manrope — текст, моноширинный — сами промпты:
#: их копируют, и глазу нужно видеть, где кончается формула.
FACES = [
    ("unbounded/Unbounded[wght].ttf", 800, "Unbounded-ExtraBold.ttf"),
    ("manrope/Manrope[wght].ttf", 400, "Manrope-Regular.ttf"),
    ("manrope/Manrope[wght].ttf", 700, "Manrope-Bold.ttf"),
    ("jetbrainsmono/JetBrainsMono[wght].ttf", 400, "JetBrainsMono-Regular.ttf"),
]


def download(path: str) -> bytes:
    url = f"{RAW}/{path}"
    request = urllib.request.Request(url, headers={"User-Agent": "prompt-pack/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cache: dict[str, bytes] = {}

    for source, weight, filename in FACES:
        target = OUT / filename
        if target.exists():
            print(f"  {filename}: уже есть")
            continue

        if source not in cache:
            cache[source] = download(source)

        font = TTFont(io.BytesIO(cache[source]))
        static = instancer.instantiateVariableFont(font, {"wght": weight})
        static.save(target)
        print(f"  {filename}: {target.stat().st_size / 1024:.0f} КБ (wght {weight})")

    print("\nЛицензия OFL — файлы можно держать в репозитории и раздавать в PDF.")


if __name__ == "__main__":
    main()
