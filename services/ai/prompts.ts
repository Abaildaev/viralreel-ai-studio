import { CtaType, LeadMagnetInfo, GeneratedContentResponse } from './types';

export const JSON_FORMAT_INSTRUCTION = `
ФОРМАТ ОТВЕТА: Ты ОБЯЗАН вернуть ТОЛЬКО валидный JSON объект (без markdown, без \`\`\`json, без пояснений). Формат:
{
  "variations": [
    { "hook": "заголовок текст", "caption": "описание текст" }
  ]
}
`;

export const PROVOCATIVE_HOOK_EXAMPLES = `
1. Я делала это каждый день — пока не нашла более простой шаг:
2. Почему понятная идея иногда сильнее сложного монтажа:
3. Три сигнала, что вашему Reels нужна другая подача:
4. Что меняется, если убрать один привычный шаг из контент-плана:
5. Вы тратите время не там: проверьте этот этап перед публикацией:
6. Маленькая правка, которая делает сценарий заметно понятнее:
7. Почему один и тот же формат работает по-разному для разных аудиторий:
8. Если ваш контент не сохраняют, начните с этой проверки:
`;

export const SELLING_HOOK_EXAMPLES = `
1. Пока все пробуют нейросети по отдельности, я собрала удобную связку для Reels:
2. Как вести канал без съёмок: понятный процесс от идеи до публикации:
3. Как превратить полезный материал в цифровой продукт за выходные:
4. Что проверить перед запуском анонимного Telegram-канала:
5. Как посчитать экономику идеи до того, как потратить на неё бюджет:
6. Не любите сниматься? Вот сценарий Reels, который можно собрать без лица:
7. Пять удалённых задач, которые можно начать изучать с ноутбуком и Wi-Fi:
8. Как восстановить контент-процесс, если у вас остались только телефон и неделя:
9. Как автоматизировать повторяющиеся шаги и освободить время для контента:
10. Как оценить новую нишу до того, как в неё зайдут конкуренты:
`;

export const EDUCATIONAL_HOOK_EXAMPLES = `
1. 10 бесплатных нейросетей, которые помогают закрыть задачи дизайна, текста и планирования:
2. 5 книг по психологии влияния, которые дают материал для осмысленного контент-плана:
3. Где бесплатно получить навыки для старта на фрилансе: подборка открытых курсов:
4. 7 ниш на удалёнке, которые стоит изучить перед первым проектом:
5. 15 Telegram-каналов с вакансиями и практическими заданиями для новичков:
6. Промпт, который превращает ChatGPT в помощника для пошагового плана обучения:
7. Как попросить нейросеть помочь с резюме и проверить его перед откликом:
8. 3 функции Notion для более спокойного планирования недели:
9. Связка из двух AI-инструментов для быстрой первичной аналитики:
10. Запрос к ИИ, который помогает составить план практики английского:
`;

export const PROVOCATIVE_HOOK_STRUCTURE = `
СТРУКТУРА ВИРУСНОГО ЗАГОЛОВКА — ПРОВОКАЦИОННЫЙ ТОН:
1. АВТОРИТЕТНЫЙ ИСТОЧНИК или ПРЯМОЕ ОБРАЩЕНИЕ в начале
2. ШОКИРУЮЩЕЕ УТВЕРЖДЕНИЕ или ПАРАДОКС
3. КОНКРЕТНЫЕ ЧИСЛА или КОНКРЕТНАЯ ГРУППА
4. ЭМОЦИОНАЛЬНЫЙ ТРИГГЕР в скобках
5. ЗАГЛАВНЫЕ БУКВЫ для ключевых слов — 1-2 слова максимум
6. ДВОЕТОЧИЕ В КОНЦЕ — ВСЕГДА заканчивай заголовок двоеточием ":"
`;

export const BUSINESS_HOOK_STRUCTURE = `
СТРУКТУРА ЗАГОЛОВКА:
1. ТЕМАТИКА — выбирай одну из: ИИ, Безликий заработок, Секреты богатых, Удаленка
2. ФОРМАТ И ПРИЕМЫ: "Пока все X, я...", Противопоставление, Скрытые знания, FOMO
3. КОНКРЕТНЫЕ ЦИФРЫ И СУММЫ
4. ЗАГЛАВНЫЕ БУКВЫ для ключевых слов
5. ДВОЕТОЧИЕ В КОНЦЕ — заканчивай заголовок двоеточием ":"
`;

export function getHookStructure(tone: string): string {
  if (tone === 'Obrazovatelnyj' || tone === 'Prodajushchij') return BUSINESS_HOOK_STRUCTURE;
  return PROVOCATIVE_HOOK_STRUCTURE;
}

export function getHookExamples(tone: string): string {
  if (tone === 'Obrazovatelnyj') return EDUCATIONAL_HOOK_EXAMPLES;
  if (tone === 'Prodajushchij') return SELLING_HOOK_EXAMPLES;
  return PROVOCATIVE_HOOK_EXAMPLES;
}

export const HOOK_LENGTH_RULE = "ДЛИНА ЗАГОЛОВКА: СТРОГО до 20 СЛОВ МАКСИМУМ. Не длиннее 20 слов.";

export const getCaptionRules = (tone: string, ctaType: CtaType = 'instagram', leadMagnet?: LeadMagnetInfo) => {
  let ctaInstruction = '';
  if (ctaType === 'codeword' && leadMagnet) {
    ctaInstruction = `CTA: В конце описания попроси написать кодовое слово «${leadMagnet.codeword}» в комментарии или директ. За это они получат: "${leadMagnet.title} — ${leadMagnet.description}".`;
  } else if (ctaType === 'codeword') {
    ctaInstruction = `CTA: В конце описания попроси написать КОДОВОЕ СЛОВО в комментарии или директ.`;
  } else if (ctaType === 'instagram') {
    ctaInstruction = `CTA: В конце описания призови подписаться на инстаграм.`;
  } else {
    ctaInstruction = `CTA: В конце описания попроси подписаться на ТГ канал.`;
  }

  return `
ТРЕБОВАНИЯ К ОПИСАНИЮ (CAPTION):
- Тон: ${tone}
- Объём: 450–900 символов, включая пробелы.
- Структура: 2–4 коротких абзаца, разделённых пустой строкой.
- Пиши грамотным естественным русским языком: пробел между каждым словом, нормальная пунктуация, без слов-заглушек, бессмысленных фраз и набора символов.
- Не выдавай предположения за факты: не придумывай исследования, отзывы, доходы, дефицит кадров, гарантии результата и точные цифры без источника или данных пользователя.
- Не используй медицинские, финансовые или юридические обещания и не создавай искусственный дефицит («успей до…»), если он не подтверждён.
- ${ctaInstruction}
${HOOK_LENGTH_RULE}
`;
};

function normalizeCaption(value: unknown): string {
  if (typeof value !== 'string') return '';

  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/[\t\f\v\u00a0 ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isReadableCaption(caption: string): boolean {
  const words = caption.match(/[A-Za-zА-Яа-яЁё0-9]+/g) || [];
  const hasRunOnWord = /[A-Za-zА-Яа-яЁё]{35,}/.test(caption);
  return caption.length >= 120 && words.length >= 20 && !hasRunOnWord;
}

export function processVariations(text: string, _countTarget: number): GeneratedContentResponse['variations'] {
  let variations: GeneratedContentResponse['variations'] = [];
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();
    
    const parsed = JSON.parse(cleaned) as GeneratedContentResponse;
    variations = parsed.variations || [];
  } catch (e) {
    console.error("JSON Parse Error", e);
    return [];
  }

  return variations.map((v) => {
    let cleanCaption = normalizeCaption(v.caption)
      .replace(/#[a-zA-Zа-яА-Я0-9_]+/g, '')
      .trim();

    if (cleanCaption.length > 2000) {
      const safeCut = cleanCaption.substring(0, 2000).lastIndexOf('.');
      cleanCaption = safeCut > 0 ? cleanCaption.substring(0, safeCut + 1) : cleanCaption.substring(0, 1997) + "...";
    }

    let cleanHook = typeof v.hook === 'string' ? v.hook.trim() : '';
    cleanHook = cleanHook.replace(/Читайте ниже/i, "").replace(/Ответ в описании/i, "").trim();
    cleanHook = cleanHook.replace(/^["']|["']$/g, '');

    const hookWords = cleanHook.split(/\s+/);
    if (hookWords.length > 20) {
      cleanHook = hookWords.slice(0, 20).join(' ');
    }

    if (!/[?!:]$/.test(cleanHook)) {
      cleanHook = cleanHook.replace(/[.\s]+$/, "") + ":";
    }
    if (cleanHook.endsWith("::")) cleanHook = cleanHook.slice(0, -1);

    return { hook: cleanHook, caption: cleanCaption };
  }).filter((variation) => variation.hook.length > 0 && isReadableCaption(variation.caption));
}
