"""
Тексты пака промптов: единственный источник правды.

Их читают двое — сборщик PDF и генератор примеров, — и разъехаться им нельзя:
картинка под промптом должна быть получена ровно этим промптом. Модуль
намеренно без зависимостей, чтобы генератор не тянул за собой reportlab.

Кортеж: номер, название, для чего это, сам промпт.
"""

PROMPTS = [
    (
        "01",
        "Liquid Chrome",
        "Жидкий хром и премиальный 3D-блеск",
        "Transform the main subject in the uploaded image into polished liquid chrome. Preserve the original pose, silhouette, facial identity and camera angle. Add realistic mirror-like reflections, smooth molten-metal contours, crisp specular highlights and subtle rainbow refractions. Keep the background recognizable but cleaner and more cinematic. Premium 3D advertising look, ultra-detailed, high contrast, sharp focus, vertical 9:16 composition, no text, no watermark.",
    ),
    (
        "02",
        "Makoto Shinkai mood",
        "Аниме-кадр с кинематографичным светом",
        "Reimagine the uploaded photo as a detailed modern anime film frame with luminous natural light, expressive eyes, delicate linework and richly painted environments. Preserve the person's identity, clothing, pose and composition. Add warm sun rays, soft atmospheric particles, realistic reflections and a dreamy cinematic color palette. Highly detailed background, emotional storytelling, clean anatomy, vertical 9:16, no text, no watermark.",
    ),
    (
        "03",
        "Nostalgic Bloom",
        "Ностальгический свет и плёночное настроение",
        "Turn the uploaded portrait into a nostalgic dreamlike editorial image. Preserve identity and pose. Use soft blooming highlights, gentle lens haze, subtle film grain, slight chromatic aberration, pastel cyan-yellow-magenta light leaks and deep cinematic shadows. The result should feel like a rediscovered frame from an experimental 1990s music video: emotional, elegant, realistic skin texture, vertical 9:16, no text, no watermark.",
    ),
    (
        "04",
        "Punk Collage",
        "Яркий журнальный коллаж",
        "Convert the uploaded image into a bold punk editorial collage. Preserve the subject's face and pose, then combine high-contrast black-and-white halftone cutouts with torn paper edges, hot pink background, acid-yellow tape, hand-drawn stars, marker scribbles and rough photocopy texture. Dynamic fashion-magazine layout, deliberate imperfections, clean focal hierarchy, vertical 9:16, no readable text, no watermark.",
    ),
    (
        "05",
        "Paper Diorama",
        "Объёмная сцена из бумаги",
        "Rebuild the uploaded scene as a handcrafted paper diorama. Preserve the subject, pose, camera angle and key colors. Everything should look cut from layered matte paper and assembled by hand: visible paper fibers, folded edges, stacked depth, tiny shadows between layers and charming miniature details. Soft studio lighting, tactile craftsmanship, cinematic depth of field, vertical 9:16, no text, no watermark.",
    ),
    (
        "06",
        "Screentone Pop-Art",
        "Комикс с растром и сильным контрастом",
        "Transform the uploaded portrait into premium screentone pop-art. Keep the person's identity, pose and outfit recognizable. Use precise black ink outlines, dense halftone dots, limited turquoise-yellow-black palette, dramatic comic shadows, sharp highlights and energetic speed lines. Add polished print texture and a clean poster composition while keeping facial anatomy accurate. Vertical 9:16, no speech bubbles, no text, no watermark.",
    ),
    (
        "07",
        "Painterly",
        "Живописный digital-art эффект",
        "Repaint the uploaded image as expressive contemporary digital art. Preserve the subject's identity, pose and composition. Use confident visible brushstrokes, layered paint texture, simplified but accurate facial planes, rich complementary colors and dramatic soft light. Blend fine detail around the eyes and face with looser strokes in the background. Gallery-quality illustration, vertical 9:16, no text, no watermark.",
    ),
    (
        "08",
        "Sprite Art",
        "Стильная игровая пиксельная сцена",
        "Convert the uploaded image into polished high-resolution sprite art inspired by stylish 1990s arcade games. Preserve the person's identity, pose, outfit and the main vehicle or environment. Use deliberate pixel clusters, crisp silhouettes, limited vibrant palette, dramatic rim light and readable depth. Keep the composition cinematic and fashion-forward, not childish. Vertical 9:16, no text, no UI, no watermark.",
    ),
    (
        "09",
        "Photo Rescue",
        "Восстановление старого или размытого фото",
        "Restore and enhance the uploaded low-resolution photo while preserving the exact identity, facial expression, body proportions and original composition. Remove compression artifacts, blur, noise, scratches and color damage. Recover realistic skin texture, natural hair detail, fabric texture and clean edges without inventing new features. Correct exposure and white balance, upscale to crisp 4K quality, photorealistic, no beauty-filter look, no text, no watermark.",
    ),
    (
        "10",
        "Cinematic Remaster",
        "Превращение обычного кадра в кино",
        "Remaster the uploaded frame into a premium cinematic still. Preserve the people, action, facial identity and camera angle. Improve clarity and dynamic range, add natural skin detail, realistic materials, controlled film grain, subtle depth of field and motivated cinematic lighting. Refine colors with a sophisticated film-grade palette while avoiding oversaturation and plastic skin. Sharp 4K finish, vertical 9:16, no text, no watermark.",
    ),
]


#: Имена файлов примеров. Номер связывает промпт с его картинкой.
SLUGS = {
    "01": "liquid-chrome",
    "02": "makoto-shinkai",
    "03": "nostalgic-bloom",
    "04": "punk-collage",
    "05": "paper-diorama",
    "06": "screentone-popart",
    "07": "painterly",
    "08": "sprite-art",
    "09": "photo-rescue",
    "10": "cinematic-remaster",
}

#: Что в формуле менять под свою задачу — по одной точке на промпт.
#: Пак без этого читается как набор заклинаний: скопировал, получил, всё.
#: С этим человек понимает, где у формулы ручка, и возвращается к ней снова.
TWEAKS = {
    "01": "polished liquid chrome → brushed gold или matte black rubber: приём тот же, материал другой.",
    "02": "luminous natural light → rainy night neon: сменится время суток, стиль останется.",
    "03": "pastel cyan-yellow-magenta light leaks → deep amber and green, и вместо девяностых получите семидесятые.",
    "04": "hot pink background → любой ваш фирменный цвет: коллаж соберётся вокруг него.",
    "05": "layered matte paper → corrugated cardboard или felt: материал переписывает всю сцену.",
    "06": "turquoise-yellow-black palette — самое заметное место формулы, ставьте туда свои три цвета.",
    "07": "confident visible brushstrokes → palette knife texture, и живопись станет плотнее.",
    "08": "1990s arcade → 8-bit NES или modern indie pixel: одна фраза меняет эпоху.",
    "09": "для пожелтевших архивных снимков добавьте в конец remove yellow color cast.",
    "10": "sophisticated film-grade palette → teal and orange blockbuster grade, если нужен голливудский вид.",
}

#: Исходник для пары «до и после». Две формулы чинят кадр, а не стилизуют его,
#: поэтому им подаётся специально испорченный вариант того же снимка — иначе
#: пара показала бы, что ничего не изменилось.
BEFORE_FILES = {number: "00-before.png" for number in SLUGS}
BEFORE_FILES["09"] = "00-before-damaged.jpg"
BEFORE_FILES["10"] = "00-before-flat.jpg"

#: Раздел, в который попадает промпт на обложке и в колонтитуле.
SECTIONS = {number: "Визуальные стили" for number in SLUGS}
for number in ("09", "10"):
    SECTIONS[number] = "Восстановление и качество"
