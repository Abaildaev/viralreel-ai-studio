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
1. Я считала себя «хронической неудачницей», пока не поняла одну вещь. Не повторяй мою ошибку:
2. Квантовая физика доказала, что везение — это не случайность (и причина этого шокирует даже ученых):
3. Перед большими деньгами Вселенная всегда дает эти 3 знака. Если проигнорируешь их — поток закроется на годы:
4. Ученые обнаружили: Человеческая ДНК может меняться под воздействием слов. Никогда не говори это:
5. Деньги — это не материя. Это энергия определенной частоты. Вот как настроить на нее свой мозг:
6. Отпусти — и всё придёт: ПАРАДОКС ОТПУСКАНИЯ (Карл Юнг о самом сложном законе жизни):
7. Как социальные сети заставляют вас ненавидеть своего мужа (и вы даже не замечаете, когда это началось):
8. МИЛЛЕНИАЛЫ-эмигранты, вы вообще понимаете, что мы сделали невозможное? Если ты с 1981 по 1996 и живёшь не там, где родился — это про тебя:
`;

export const SELLING_HOOK_EXAMPLES = `
1. Пока все просто играются с нейросетями, я собрала связку из 3 бесплатных ИИ, которая приносит мне пассивные 50$ в день:
2. Мой «безликий» YouTube-канал приносит больше, чем работа в офисе. Всё, что нужно: телефон и 1 час в день:
3. Продала один и тот же PDF-файл 400 раз. Как создать цифровой товар за выходные и забыть о нем, получая оплаты на автомате:
4. POV: Ты перестала бояться, завела анонимный Telegram-канал и через месяц заработала первую 1000$ на рекламе:
5. Пока все обещают тебе 200К на вб и картинках, я нашла единственный рабочий способ сделать эти 200К в январе:
6. Не снимай Reels, если стесняешься. Pinterest + эта секретная схема = 300к целевого трафика без лица:
7. Мой офис сегодня — на Бали, завтра — в Дубае. 5 профессий, для которых нужен только ноутбук и Wi-Fi:
8. Отбери у меня все деньги, связи и соцсети. Дай мне неделю и телефон — и я снова выйду на 100к. Вот мой алгоритм:
9. Формула «ленивого богатства»: как настроить систему так, чтобы деньги приходили на карту, пока ты спишь:
10. Это окно возможностей закроется к концу 2026. Ниша, где можно сделать капитал с нуля, пока не пришли корпорации:
`;

export const EDUCATIONAL_HOOK_EXAMPLES = `
1. 10 бесплатных нейросетей, которые полностью заменят тебе команду из дизайнера, копирайтера и ассистента. Сохраняй:
2. 5 книг по психологии влияния, после которых твое мышление и подход к деньгам изменятся навсегда:
3. Где бесплатно получить навыки, за которые на фрилансе платят от $1000? Секретная подборка открытых курсов:
4. 7 неочевидных ниш на удаленке, где прямо сейчас огромный дефицит кадров и можно стартовать с нуля:
5. База из 15 телеграм-каналов, где каждый день публикуют вакансии для новичков без опыта. Забирай:
6. Один этот промпт превращает ChatGPT в твоего личного ментора, который распишет пошаговый план развития в любой профессии:
7. Как заставить нейросеть написать тебе резюме, с которым берут в топ-компании даже без опыта (сохрани алгоритм):
8. 3 скрытые функции Notion, которые освободят тебе до 15 часов в неделю. Выстраиваем идеальную систему планирования:
9. Перестань гуглить часами. Эта связка из двух ИИ-инструментов собирает любую аналитику за 3 минуты:
10. Секретный запрос к ИИ, который помогает выучить английский в 3 раза быстрее традиционных курсов:
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
