import {
  GeneratedContentResponse,
  CtaType,
  LeadMagnetInfo,
} from './types';
import { AiShowcaseStyle } from '../../types';
import { getClient, MODEL_ID, NO_THINKING } from './geminiClient';
import { getCaptionRules, getHookExamples, getHookStructure, JSON_FORMAT_INSTRUCTION, processVariations } from './prompts';
import { getMockViralContent } from './mockGenerators';

export type AiShowcaseGenerationMode = 'claude' | 'chatgpt' | 'gemini' | 'none' | 'all';
export type AiShowcaseContentResponse = {
  variations: Array<GeneratedContentResponse['variations'][number] & {
    visualStyle: AiShowcaseStyle;
  }>;
};

type AiShowcaseGenerationOptions = {
  topic: string;
  variationCount: number;
  codeword: string;
  logoMode: AiShowcaseGenerationMode;
};

type AiStoryGenerationOptions = {
  topic: string;
  variationCount: number;
  leadMagnet?: LeadMagnetInfo;
};

function compactAiStoryHook(value: string): string {
  const hook = value
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[:;,.]+$/, '')
    .trim();
  const words = hook.split(' ').filter(Boolean);
  if (words.length <= 8 && hook.length <= 68) return hook;
  return words.slice(0, 8).join(' ');
}

const forbiddenAiStoryCaptionPhrases = [
  'вертикальный кадр',
  'вертикального кадра',
  'горизонтальное видео',
  'в центре кадра',
  'hook сверху',
  'хук сверху',
  'всё по формуле',
  'все по формуле',
  '15-секундн',
  'цепляет за секунду',
  'правильная композиция',
  'эта ai-мини-история создана одним промптом',
  'текст сверху',
  'макет ролика',
  'формул',
];

function isStrongAiStoryCaption(caption: string, codeword: string): boolean {
  const normalized = caption.toLowerCase().replace(/ё/g, 'е');
  const normalizedCodeword = codeword.toLowerCase().replace(/ё/g, 'е');

  return caption.length >= 350
    && normalized.includes('seedance 2.0')
    && normalized.includes(normalizedCodeword)
    && !forbiddenAiStoryCaptionPhrases.some((phrase) => normalized.includes(phrase));
}

function getMockAiStoryContent(
  topic: string,
  variationCount: number,
  leadMagnet?: LeadMagnetInfo,
): GeneratedContentResponse {
  const codeword = leadMagnet?.codeword?.trim().toUpperCase() || 'ИИ';
  const hooks = [
    'Seedance 2 + 1 промпт',
    '1 промпт — готовая идея для Reels',
    'Этот Reel полностью создал ИИ',
    'Мини-фильм из одной идеи',
    'Нейросеть сняла это без камеры',
    'Такие Reels создаются одним промптом',
  ];
  const captions = [
    `Чтобы создать такой Reels, больше не нужны съёмочная команда, актёры и дни на монтаж. В Seedance 2.0 достаточно одного детального промпта, если вы умеете правильно описать героя, сцену, эмоцию и движение камеры.\n\nЯ записал для вас бесплатный мини-курс. Внутри — структура сильного промпта, настройка сцен и приёмы, которые помогут сделать AI-видео цельным, а не набором случайных кадров.\n\nНапишите «${codeword}» в комментариях или директ — отправлю мини-курс бесплатно.`,
    `Самая сложная часть в создании AI-Reels — не нажать кнопку «сгенерировать», а объяснить нейросети, что именно вы хотите увидеть. Один грамотно собранный промпт в Seedance 2.0 может задать весь сюжет: от атмосферы и персонажа до движения и финала.\n\nВ бесплатном мини-курсе я показал, из каких блоков собирать промпт, как сохранять одного героя между сценами и какие ошибки портят результат.\n\nНапишите «${codeword}» в комментариях или директ — и я пришлю вам урок.`,
    `Красивое AI-видео начинается не с дорогого софта, а с понятной идеи и точного текста для нейросети. В Seedance 2.0 можно собрать целую мини-историю из одного промпта — если в нём есть драматургия, визуальные детали и понятная динамика.\n\nЯ собрал этот процесс в бесплатный мини-курс: от первой идеи до готового промпта. Вы поймёте, что писать, в каком порядке и как доводить генерацию до нужного результата.\n\nОставьте слово «${codeword}» в комментариях или директ — отправлю доступ бесплатно.`,
    `Один сильный промпт способен заменить целую цепочку проб и случайных генераций. В Seedance 2.0 вы можете сразу задать персонажа, окружение, стиль, логику сцены и работу камеры. Главное — знать, как перевести свою идею на язык нейросети.\n\nИменно этому посвящён мой бесплатный мини-курс. После него у вас будет понятный шаблон промпта и пошаговый процесс для своих AI-Reels.\n\nНапишите «${codeword}» в комментариях или директ, и я отправлю вам мини-курс.`,
  ];

  return {
    variations: Array.from({ length: variationCount }, (_, index) => ({
      hook: hooks[index % hooks.length],
      caption: captions[index % captions.length],
    })),
  };
}

/** Creates short headline-led copy for landscape AI mini-stories inside 9:16 Reels. */
export const generateAiStoryReels = async ({
  topic,
  variationCount,
  leadMagnet,
}: AiStoryGenerationOptions): Promise<GeneratedContentResponse> => {
  const cleanTopic = topic.trim() || 'AI-мини-история для Reels';
  const codeword = leadMagnet?.codeword?.trim().toUpperCase() || 'ИИ';
  const leadMagnetContext = [leadMagnet?.title, leadMagnet?.description]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' — ');

  try {
    const client = getClient();
    const prompt = `
Ты — сильный direct-response копирайтер для Instagram Reels об AI-видео.
Исходная тема: "${cleanTopic}".
Лид-магнит: "${leadMagnetContext || 'бесплатный мини-курс по Seedance 2.0 и написанию промптов'}".
Создай ровно ${variationCount} заметно разных вариантов.

Правила hook:
- 2–8 слов, не более 68 символов;
- сложность читается за одну секунду;
- чередуй модель + промпт, результат, удивление, скорость и мини-фильм;
- допустимые конструкции: «Seedance 2 + 1 промпт», «1 промпт — готовая идея для Reels», «Этот Reel создал ИИ»;
- не повторяй примеры дословно во всех вариантах, не обещай гарантированные просмотры и не выдумывай цифры.

Правила caption:
- 450–850 символов, 3–4 коротких абзаца, без хэштегов;
- это продающий текст, а не техническое описание ролика;
- открой желанием аудитории создавать эффектные AI-Reels без съёмочной команды и сложного монтажа;
- объясни, что такие видео создаются в Seedance 2.0 с помощью одного грамотно собранного промпта;
- отдельным абзацем продай бесплатный мини-курс: «я записал для вас»; внутри — как писать промпты, задавать сцены, движение камеры, сохранять героя и исправлять ошибки;
- последний абзац — прямой CTA написать «${codeword}» в директ, чтобы получить мини-курс;
- не начинай CTA фразой «Хотите научиться?» и не пиши канцелярским языком;
- не описывай макет: запрещены фразы про вертикальный кадр, горизонтальное видео, текст сверху, hook, композицию и «всё по формуле»;
- не выдумывай кейсы, цифры и гарантии; не повторяй одинаковые фразы между вариантами.

Верни ТОЛЬКО JSON:
{"variations":[{"hook":"...","caption":"..."}]}`;

    const response = await client.chat.completions.create({
      model: MODEL_ID,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.95,
      response_format: { type: 'json_object' },
      extra_body: NO_THINKING,
    } as any);

    const variations = processVariations(response.choices?.[0]?.message?.content || '', variationCount)
      .map((variation) => ({
        hook: compactAiStoryHook(variation.hook),
        caption: variation.caption.trim(),
      }))
      .filter((variation) => variation.hook && isStrongAiStoryCaption(variation.caption, codeword))
      .slice(0, variationCount);

    return variations.length === variationCount
      ? { variations }
      : getMockAiStoryContent(cleanTopic, variationCount, leadMagnet);
  } catch (error) {
    console.warn('AI story generation failed, using focused fallback', error);
    return getMockAiStoryContent(cleanTopic, variationCount, leadMagnet);
  }
};

function compactShowcaseHook(value: string): string {
  const hook = value.replace(/\s+/g, ' ').trim();
  const words = hook.split(' ').filter(Boolean);
  if (words.length <= 16 && hook.length <= 105) return hook;

  for (const separator of [' — ', ' – ', '. ', ', ']) {
    const candidate = hook.split(separator)[0]?.trim();
    const candidateWords = candidate?.split(' ').filter(Boolean) || [];
    if (candidateWords.length >= 5 && candidateWords.length <= 16) {
      return candidate;
    }
  }

  return `${words.slice(0, 14).join(' ')}…`;
}

/**
 * Generates original copy for the AI Showcase. Unlike the legacy generators,
 * this function deliberately has no local fallback: the Showcase must never
 * claim that DeepSeek generated text when no request was completed.
 */
export const generateAiShowcaseContent = async ({
  topic,
  variationCount,
  codeword,
  logoMode,
}: AiShowcaseGenerationOptions): Promise<AiShowcaseContentResponse> => {
  const client = getClient();
  const cleanTopic = topic.trim();
  const cleanCodeword = codeword.trim().toUpperCase() || 'ПРОМПТ';

  if (!cleanTopic) {
    throw new Error('Укажите тему роликов для AI Showcase.');
  }

  const logoInstruction = logoMode === 'all'
    ? 'Если в заголовке прямо упоминается Claude, ChatGPT или Gemini — это допустимо. В остальных заголовках не упоминай нейросети только ради логотипа.'
    : logoMode === 'none'
      ? 'Не упоминай Claude, ChatGPT или Gemini в заголовках.'
      : `Сделай заголовки естественно связанными с ${logoMode === 'chatgpt' ? 'ChatGPT' : logoMode === 'gemini' ? 'Gemini' : 'Claude'}, но не повторяй название механически в каждом варианте.`;

  const prompt = `
Ты создаёшь оригинальные сценарии для вертикальных Instagram Reels в формате AI Showcase.

Тема/ниша: "${cleanTopic}".
Нужно подготовить ровно ${variationCount} заметно разных вариантов.

Для каждого варианта:
- hook: короткий сильный заголовок на видео на русском, СТРОГО 5–12 слов и не более 85 символов, без кликбейта и ложных обещаний;
- caption: оригинальное описание на русском длиной 300–900 символов, раскрывающее мысль ролика и завершающееся естественным CTA написать «${cleanCodeword}» в директ;
- не используй хэштеги, не копируй текст между вариантами.
- чередуй визуальные рецепты между вариантами. Поле visualStyle используй ТОЛЬКО из списка:
  - white-badge — короткий чёткий заголовок для белой плашки с чёрным текстом;
  - emoji-white — белый заголовок без плашки с одним уместным эмодзи (например ✨, 🤯, 👀);
  - figma-ai — заголовок в стиле POV, который естественно соединяет Figma и выбранную ИИ-модель. Для сайтов допустим формат вроде «POV: концепт сайта за $10K — Figma + Claude», но не выдавай вымышленную цену за подтверждённый кейс;
  - dark-card — контрастный заголовок для тёмной плашки;
  - plain-white — минималистичный белый текст поверх видео;
  - ai-card — тёмная плашка с логотипом выбранной модели.
- если вариантов 4 или больше, используй минимум white-badge, emoji-white, figma-ai и dark-card по одному разу; затем не повторяй один visualStyle подряд;
- чередуй конструкции заголовков: вопрос, POV, «клиент просит — результат», до/после, короткое объяснение процесса;
- перед отправкой JSON пересчитай слова в каждом hook и перепиши всё, что длиннее 12 слов;

Правило логотипов: ${logoInstruction}

Верни ТОЛЬКО валидный JSON без Markdown:
{
  "variations": [
    { "hook": "...", "caption": "...", "visualStyle": "white-badge" }
  ]
}`;

  const response = await client.chat.completions.create({
    model: MODEL_ID,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,
    response_format: { type: 'json_object' },
    extra_body: NO_THINKING,
  });

  const text = response.choices?.[0]?.message?.content?.trim() || '';
  if (!text) {
    throw new Error('DeepSeek вернул пустой ответ. Попробуйте ещё раз.');
  }

  let parsed: { variations?: unknown };
  try {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    parsed = JSON.parse(cleaned) as { variations?: unknown };
  } catch {
    throw new Error('DeepSeek вернул ответ в неверном формате. Попробуйте ещё раз.');
  }

  if (!Array.isArray(parsed.variations)) {
    throw new Error('DeepSeek не вернул список вариантов. Попробуйте ещё раз.');
  }

  const visualStyles = new Set<AiShowcaseStyle>([
    'white-badge',
    'emoji-white',
    'figma-ai',
    'dark-card',
    'plain-white',
    'ai-card',
  ]);

  const variations = parsed.variations
    .map((item) => {
      const value = item as { hook?: unknown; caption?: unknown; visualStyle?: unknown };
      return {
        hook: typeof value.hook === 'string' ? compactShowcaseHook(value.hook) : '',
        caption: typeof value.caption === 'string' ? value.caption.trim() : '',
        visualStyle: typeof value.visualStyle === 'string' && visualStyles.has(value.visualStyle as AiShowcaseStyle)
          ? value.visualStyle as AiShowcaseStyle
          : 'white-badge' as AiShowcaseStyle,
      };
    })
    .filter((variation) => variation.hook.length > 0 && variation.caption.length > 0)
    .slice(0, variationCount);

  if (variations.length === 0) {
    throw new Error('DeepSeek не создал пригодных вариантов. Измените тему и повторите попытку.');
  }

  return { variations } satisfies AiShowcaseContentResponse;
};

export const generateViralHooks = async (
  topic: string,
  variationCount: number = 3,
  tone: string = 'Provokacionnyj',
  ctaType: CtaType = 'instagram',
  leadMagnet?: LeadMagnetInfo
): Promise<GeneratedContentResponse> => {
  try {
    const client = getClient();
    const structure = getHookStructure(tone);
    const examples = getHookExamples(tone);
    const captionRules = getCaptionRules(tone, ctaType, leadMagnet);

    const prompt = `
Ты — эксперт по вирусным Reels/Shorts. Создай ${variationCount} вариантов хуков и описаний на тему "${topic}".

${structure}

ПРИМЕРЫ УСПЕШНЫХ ХУКОВ:
${examples}

${captionRules}

${JSON_FORMAT_INSTRUCTION}
`;

    const response = await client.chat.completions.create({
      model: MODEL_ID,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      response_format: { type: 'json_object' },
      extra_body: NO_THINKING,
    } as any);

    const text = response.choices?.[0]?.message?.content || '';
    const variations = processVariations(text, variationCount);

    if (variations.length === 0) {
      return getMockViralContent(topic, variationCount, ctaType, leadMagnet);
    }

    return { variations };
  } catch (err) {
    console.warn("AI generation failed, using fallback generator", err);
    return getMockViralContent(topic, variationCount, ctaType, leadMagnet);
  }
};

export const generateViralTopic = async (tone: string = 'Provokacionnyj'): Promise<string> => {
  try {
    const client = getClient();
    const prompt = `Предложи 1 вирусную актуальную тему для Instagram Reels в жанре "${tone}". Ответ верни одной строкой без кавычек.`;

    const response = await client.chat.completions.create({
      model: MODEL_ID,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      extra_body: NO_THINKING,
    } as any);

    return response.choices?.[0]?.message?.content?.trim() || "5 нейросетей для автоматизации блогинга в 2026 году";
  } catch {
    return "5 нейросетей для автоматизации блогинга в 2026 году";
  }
};

export const generateViralContentFromFrames = async (
  frames: string[],
  variationCount: number = 3,
  tone: string = 'Provokacionnyj',
  context = '',
  ctaType: CtaType = 'instagram',
  leadMagnet?: LeadMagnetInfo,
): Promise<GeneratedContentResponse> => {
  // The text-only DeepSeek endpoint cannot reliably inspect base64 frames.
  // Keep the frame-aware path explicit and avoid injecting megabytes of base64
  // into a text prompt. The first call uses a concise visual-analysis hint;
  // a vision-capable model can be wired here without changing the UI contract.
  const visualHint = frames.length > 0
    ? `В видео обнаружено ${frames.length} ключевых кадров. Сгенерируй идеи для короткого вертикального ролика, учитывая визуальную подачу.`
    : 'Видео не содержит доступных кадров для анализа.';
  const topic = [visualHint, context.trim()].filter(Boolean).join('\n');
  return generateViralHooks(topic, variationCount, tone, ctaType, leadMagnet);
};

export interface CtaOutroCaptionRequest {
  action: string;
  keyword: string;
  /** Kept for the visual outro; Reels captions use the dedicated short CTA below. */
  subtitle?: string;
  /** Handle or brand tag that leads the hashtag line, with or without '#'. */
  brandTag?: string;
  /** The concrete prompt pack delivered by the matching automation funnel. */
  topic?: string;
  count: number;
}

/** The Reels caption offer is intentionally separate from the Telegram funnel offer. */
export const REELS_PROMPT_PACK_OFFER =
  'пак из 1000+ готовых промптов для визуала';

export const REELS_FOLLOW_NOTICE =
  'Важно: сначала подпишись на меня, чтобы сообщение точно пришло в Direct.';

/** The bottom line on every rendered CTA card is fixed by the offer. */
export const CTA_OUTRO_SUBTITLE = 'и получи 1000+ готовых промптов для визуала';

const REELS_FORBIDDEN_OFFER_PATTERNS = [
  /(?:^|[^\p{L}\p{N}_])2\s+(?:бесплатн\w*\s+)?генерац/iu,
  /две\s+генерац/iu,
  /бесплатн\w*\s+генерац/iu,
  /протестируй\w*\s+бесплат/iu,
];

function normalizeCaptionKeyword(value: string): string {
  return value
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'промпт';
}

export function buildReelsCaptionCta(keyword: string): string {
  return ensureReelsFollowNotice(
    `ПИШИ «${normalizeCaptionKeyword(keyword)}» в директ — и получи ${REELS_PROMPT_PACK_OFFER}.`,
  );
}

export function ensureReelsFollowNotice(value: string): string {
  const normalized = value.toLowerCase().replace(/ё/g, 'е');
  return normalized.includes('подпишись на меня')
    ? value.trim()
    : `${value.trim()} ${REELS_FOLLOW_NOTICE}`;
}

/*
  The visual outro has one fixed offer, but the caption should not look like
  one copied template across a batch. These rewrites keep the trigger word and
  the promise intact while changing the call to action naturally.
*/
const REELS_CAPTION_CTA_VARIANTS = [
  (keyword: string) => `ПИШИ «${keyword}» в директ — и получи ${REELS_PROMPT_PACK_OFFER}.`,
  (keyword: string) => `Напиши «${keyword}» в личку — отправлю ${REELS_PROMPT_PACK_OFFER}.`,
  (keyword: string) => `Хочешь ${REELS_PROMPT_PACK_OFFER}? Напиши «${keyword}» в директ.`,
  (keyword: string) => `Отправь «${keyword}» в директ — пришлю ${REELS_PROMPT_PACK_OFFER}.`,
  (keyword: string) => `Пиши «${keyword}» в директ — забирай ${REELS_PROMPT_PACK_OFFER}.`,
  (keyword: string) => `Нужны промпты для визуала? Напиши «${keyword}» в директ — отправлю пак из 1000+.`,
  (keyword: string) => `Напиши «${keyword}» в личные сообщения и получи пак: 1000+ готовых промптов для визуала.`,
  (keyword: string) => `Чтобы забрать 1000+ готовых промптов для визуала, напиши «${keyword}» в директ.`,
  (keyword: string) => `Пиши кодовое слово «${keyword}» в директ — вышлю пак из 1000+ промптов для визуала.`,
  (keyword: string) => `Готовый пак из 1000+ промптов для визуала — по слову «${keyword}» в директ.`,
  (keyword: string) => `Отправь кодовое слово «${keyword}» в личку, и я пришлю 1000+ промптов для визуала.`,
  (keyword: string) => `Хочешь готовую базу для визуала? Напиши «${keyword}» в директ — внутри 1000+ промптов.`,
];

export function buildReelsCaptionCtaVariant(keyword: string, index = 0): string {
  const normalizedKeyword = normalizeCaptionKeyword(keyword);
  return ensureReelsFollowNotice(
    REELS_CAPTION_CTA_VARIANTS[
      Math.abs(index) % REELS_CAPTION_CTA_VARIANTS.length
    ](normalizedKeyword),
  );
}

function hasReelsCaptionCta(line: string, keyword: string): boolean {
  const normalizedLine = line.toLowerCase().replace(/ё/g, 'е');
  const normalizedKeyword = normalizeCaptionKeyword(keyword).toLowerCase().replace(/ё/g, 'е');
  return normalizedLine.includes(normalizedKeyword)
    && /1000\s*\+/u.test(normalizedLine)
    && normalizedLine.includes('промпт')
    && normalizedLine.includes('визуал')
    && !REELS_FORBIDDEN_OFFER_PATTERNS.some((pattern) => pattern.test(normalizedLine));
}

function normalizeReelsCaptionCtaLine(line: string, keyword: string, index: number): string {
  const normalized = line.replace(/\s+/g, ' ').trim();
  return hasReelsCaptionCta(normalized, keyword)
    ? ensureReelsFollowNotice(normalized)
    : buildReelsCaptionCtaVariant(keyword, index);
}

export interface CtaOutroCopyRequest {
  keyword: string;
  offer?: string;
  count: number;
}

export interface CtaOutroCopyVariant {
  actionText: string;
  subtitleText: string;
}

const CTA_OUTRO_HOOKS = [
  'Сделай так же',
  'Не трать лимиты',
  'Повтори этот результат',
  'Забери готовую формулу',
  'Создавай без угадываний',
  'Попробуй этот подход',
  'Сохрани время на тестах',
  'Начни с готовой базы',
  'Усиль свои генерации',
  'Получи точный результат',
  'Не начинай с нуля',
  'Собери свой AI-ролик',
  'Возьми рабочую структуру',
  'Повтори этот визуал',
  'Создавай увереннее',
  'Управляй результатом',
];

const CTA_OUTRO_BENEFITS = [
  CTA_OUTRO_SUBTITLE,
];

function stripCtaWriteWords(value: string): string {
  return value
    .replace(/[\n\r]+/g, ' ')
    .replace(/[«»"'`]/g, '')
    // JavaScript's `\b` is ASCII-oriented and does not reliably recognise
    // Cyrillic word boundaries. Match the surrounding non-letter characters
    // explicitly so an AI answer that already contains «ПИШИ» does not become
    // «ПИШИ — ПИШИ» after normalisation.
    .replace(/(^|[^\p{L}\p{N}_])(?:на)?пиши(?=$|[^\p{L}\p{N}_])/giu, '$1')
    .replace(/^[\s—–:,-]+/g, '')
    .replace(/[\s—–:,-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCtaOutroAction(value: string): string {
  const hook = stripCtaWriteWords(value)
    .split(' ')
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');
  return `${hook || 'Забери готовое'} — ПИШИ В ДИРЕКТ`;
}

function normalizeCaptionCtaAction(value: string): string {
  const clean = value.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  const hasWriteWord = /(^|[^\p{L}\p{N}_])(?:на)?пиши(?=$|[^\p{L}\p{N}_])/iu.test(clean);
  if (!hasWriteWord) return clean || 'Пиши в директ';
  const hook = stripCtaWriteWords(clean);
  return hook ? `${hook} — Пиши в директ` : 'Пиши в директ';
}

function buildCtaOutroCopyFallback(count: number): CtaOutroCopyVariant[] {
  const total = Math.max(1, Math.min(20, Math.round(count || 1)));
  const combinations = CTA_OUTRO_HOOKS.flatMap((hook, hookIndex) =>
    CTA_OUTRO_BENEFITS.map((subtitle, subtitleIndex) => ({
      actionText: normalizeCtaOutroAction(hook),
      subtitleText: subtitle,
      score: hookIndex * 7 + subtitleIndex * 11,
    })),
  ).sort((a, b) => a.score - b.score);
  const start = Math.floor(Math.random() * combinations.length);
  return Array.from({ length: total }, (_, index) => {
    const item = combinations[(start + index * 13) % combinations.length];
    return { actionText: item.actionText, subtitleText: item.subtitleText };
  });
}

/**
 * Creates the two variable lines used by the batch CTA card. The centre line
 * is the preset's code word, while every top line is forced to contain ПИШИ.
 */
export const generateCtaOutroCopyVariants = async (
  request: CtaOutroCopyRequest,
): Promise<CtaOutroCopyVariant[]> => {
  const total = Math.max(1, Math.min(20, Math.round(request.count || 1)));
  const fallback = buildCtaOutroCopyFallback(total);
  const keyword = request.keyword.trim() || 'ПРОМПТ';

  try {
    const client = getClient();
    const prompt = `
Ты создаёшь короткие CTA-концовки для Instagram Reels про готовые AI-промпты.
Подготовь ровно ${total} заметно разных пар текста.

На карточке всегда три строки:
1) actionText — короткий заход и обязательная концовка «ПИШИ В ДИРЕКТ»;
2) кодовое слово «${keyword}» — его возвращать не нужно;
3) subtitleText — всегда ровно «${CTA_OUTRO_SUBTITLE}».

ПРАВИЛА:
- actionText: 2–6 слов, обязательно заканчивается на «ПИШИ В ДИРЕКТ», до него допустимо тире;
- subtitleText: не меняй, всегда используй ровно «${CTA_OUTRO_SUBTITLE}»;
- меняй только actionText: экономия времени, понятная структура, готовая база, управление стилем, светом и композицией;
- не пиши «КОММЕНТАРИЙ», «напиши», «оставь», хэштеги, кавычки и эмодзи;
- не обещай доход, просмотры или гарантированный результат;
- пары не должны повторять начало или выгоду друг друга.

Верни только JSON:
{"variants":[{"actionText":"Сделай так же — ПИШИ","subtitleText":"${CTA_OUTRO_SUBTITLE}"}]}
`;
    const response = await client.chat.completions.create({
      model: MODEL_ID,
      messages: [{ role: 'user', content: prompt }],
      temperature: 1,
      response_format: { type: 'json_object' },
      extra_body: NO_THINKING,
    } as any);

    const text = response.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const rawVariants: unknown = parsed?.variants;
    if (!Array.isArray(rawVariants)) return fallback;

    const seen = new Set<string>();
    const usable = rawVariants.flatMap((item, index) => {
      if (!item || typeof item !== 'object') return [];
      const raw = item as Record<string, unknown>;
      if (typeof raw.actionText !== 'string' || typeof raw.subtitleText !== 'string') return [];
      const actionText = normalizeCtaOutroAction(raw.actionText);
      const subtitleText = CTA_OUTRO_SUBTITLE;
      const key = `${actionText}|${subtitleText}`.toLowerCase().replace(/ё/g, 'е');
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ actionText, subtitleText }];
    });

    return Array.from({ length: total }, (_, index) => usable[index] || fallback[index]);
  } catch (error) {
    console.warn('AI CTA copy unavailable, using varied built-in lines', error);
    return fallback;
  }
};

const DEFAULT_PROMPT_PACK_OFFER = 'готовый пак промптов под любые задачи';

/* Hashtag sets rotate so a batch of ten posts is not ten identical captions.
   Instagram treats a repeated caption across uploads as the same content. */
const OUTRO_TAG_SETS = [
  ['aivideo', 'art', 'contentcreation', 'digitalart'],
  ['aiart', 'reels', 'prompts', 'creative'],
  ['contentcreator', 'aitools', 'viral', 'aivisuals'],
  ['promptengineering', 'digitalart', 'reelsinstagram', 'futureart'],
  ['aicontent', 'creative', 'trending', 'generativeart'],
];

/*
  These are deliberately composable. Twenty visual angles × ten details give
  the local fallback 200 distinct openings, so uniqueness does not disappear
  when a user asks for a batch of 100 or the AI key is unavailable.
*/
const OUTRO_VISUAL_ANGLES = [
  'Хочешь создавать такие AI-визуалы без часов проб и случайных генераций',
  'Такой результат начинается с промпта, в котором уже продуманы ключевые детали',
  'Красивый AI-ролик — это не удача, а правильно собранный промпт',
  'Если нейросеть выдаёт случайный результат, чаще всего ей просто не хватает точной задачи',
  'Один сильный промпт способен превратить простую идею в готовую визуальную сцену',
  'Чтобы повторить такой эффект, не нужно начинать формулировку с нуля',
  'Самая долгая часть AI-генерации — найти слова, которые модель поймёт правильно',
  'Так выглядит результат, когда в промпте совпали герой, свет, материал и движение',
  'Готовая структура промпта экономит десятки бессмысленных генераций',
  'Нейросеть может дать сильный кадр с первой попытки, если точно поставить задачу',
  'Промпт решает больше, чем выбор случайного визуального пресета',
  'Вместо бесконечных тестов можно взять готовую формулу и адаптировать её под себя',
  'Каждый такой кадр начинается с понятной структуры, а не с набора красивых слов',
  'Сильный промпт помогает управлять атмосферой, камерой и деталями сцены',
  'Если хочется похожий результат, важнее всего знать, что именно написать нейросети',
  'Один готовый промпт может стать основой сразу для целой серии Reels',
  'Создавать AI-контент становится проще, когда перед глазами есть рабочие примеры',
  'Необязательно разбираться во всех настройках, если у тебя есть проверенная формулировка',
  'Правильный промпт сокращает путь от идеи до готового ролика',
  'Лучшие AI-визуалы начинаются с текста, который легко повторить и адаптировать',
];

const OUTRO_VISUAL_DETAILS = [
  'Я собрал рабочие формулировки в один пак — останется выбрать нужную и заменить детали под свою идею',
  'Внутри — готовые основы, которые можно копировать, адаптировать и сразу тестировать в своих генерациях',
  'Пак поможет быстрее получать управляемый результат и меньше тратить лимиты на неудачные попытки',
  'Ты получишь готовые примеры для разных образов, материалов, света и движения камеры',
  'Каждый промпт можно использовать как шаблон и собирать на его основе собственные сцены',
  'С ними проще перейти от случайных картинок к цельным AI-видео для контента',
  'Я уже собрал структуру и детали — тебе не придётся придумывать всё с чистого листа',
  'Это готовая база для новых Reels, визуальных экспериментов и идей для контента',
  'Возьми формулировки за основу и меняй только героя, стиль или окружение',
  'Так ты быстрее поймёшь логику сильного промпта и сможешь создавать свои варианты',
];

const OUTRO_VISUAL_NOTES = [
  'Сохрани формулу как основу и меняй только героя, материал или окружение — так серия кадров останется в одном стиле',
  'Для нового варианта достаточно заменить одну деталь: цвет, ракурс, фактуру или настроение',
  'Чем точнее описаны свет и материал, тем проще повторить визуальный эффект в другой сцене',
  'Такую структуру удобно адаптировать под обложку, продуктовый кадр или короткий AI-Reel',
  'Начни с готовой формулы, а потом добавь свои детали — это быстрее, чем собирать запрос из случайных слов',
  'Удачный промпт можно сохранить как шаблон и использовать для разных героев и сюжетов',
  'Меняй по одной детали за раз — так легче понять, что именно повлияло на результат',
  'Эта логика работает и для портрета, и для предметной сцены, и для визуала под контент',
  'Сначала задай стиль и свет, затем добавь героя и действие — нейросети проще читать такую структуру',
  'Готовая основа особенно полезна, когда нужно быстро собрать несколько визуалов в одной подаче',
];

const normalizeTag = (value: string): string =>
  '#' + value.trim().replace(/^#+/, '').replace(/\s+/g, '');

/**
 * The caption keeps the CTA and code word, but adds a unique visual opening.
 * That makes the offline fallback useful too — it is not ten copies of the
 * same line when the DeepSeek key is missing or the response is incomplete.
 */
export const buildCtaOutroCaption = (
  request: CtaOutroCaptionRequest,
  index: number,
): string => {
  const keyword = normalizeCaptionKeyword(request.keyword);
  const angle = OUTRO_VISUAL_ANGLES[index % OUTRO_VISUAL_ANGLES.length];
  const detail = OUTRO_VISUAL_DETAILS[
    Math.floor(index / OUTRO_VISUAL_ANGLES.length) % OUTRO_VISUAL_DETAILS.length
  ];
  const note = OUTRO_VISUAL_NOTES[
    Math.floor(index / (OUTRO_VISUAL_ANGLES.length * OUTRO_VISUAL_DETAILS.length)) % OUTRO_VISUAL_NOTES.length
  ];

  const ctaLine = buildReelsCaptionCtaVariant(keyword, index);

  const tags = [
    request.brandTag?.trim() ? normalizeTag(request.brandTag) : '',
    ...OUTRO_TAG_SETS[index % OUTRO_TAG_SETS.length].map((t) => normalizeTag(t)),
  ].filter(Boolean);

  return `${angle}.\n${detail}.\n${note}.\n${ctaLine}\n${tags.join(' ')}`;
};

/**
 * The model writes a scene-specific opening, then the fixed CTA and hashtags.
 * The response is de-duplicated locally because an LLM can still repeat a
 * phrase in a large batch even when the prompt says not to.
 */
export const generateCtaOutroCaptions = async (
  request: CtaOutroCaptionRequest,
): Promise<string[]> => {
  const fallback = Array.from({ length: request.count }, (_, i) =>
    buildCtaOutroCaption(request, i),
  );

  try {
    const client = getClient();
    const example = buildCtaOutroCaption(request, 0);
    const keyword = normalizeCaptionKeyword(request.keyword);

    const prompt = `
Ты direct-response копирайтер для Instagram. Напиши ровно ${request.count} продающих описаний к Reels, в которых показывают готовые AI-промпты и результаты их применения.

КОНТЕКСТ ВОРОНКИ (не копируй его оффер дословно в описание Reels):
${request.topic?.trim() || DEFAULT_PROMPT_PACK_OFFER}

ЦЕЛЬ КАЖДОГО ОПИСАНИЯ:
Заинтересовать результатом, показать пользу готовых промптов и коротко привести человека к кодовому слову.

ФОРМАТ КАЖДОГО ОПИСАНИЯ — РОВНО ПЯТЬ СТРОК:
1) продающий hook про результат, который дают хорошие AI-промпты;
2) конкретная польза пака промптов без пустых обещаний;
3) короткая практическая мысль о том, как адаптировать промпт или повторить визуальный приём;
4) короткий CTA с тем же смыслом, но живой формулировкой: кодовое слово «${keyword}», пак из 1000+ готовых промптов для визуала;
5) строка из 4–6 хэштегов через пробел.

ПРИМЕР:
${example}

ПРАВИЛА:
- Первые три строки вместе не длиннее 480 символов; они должны звучать как живой полезный Instagram-текст, а не как рекламный шаблон.
- Кодовое слово '${request.keyword}' обязательно в четвёртой строке; можно использовать кавычки или естественную фразу «напиши кодовое слово».
- В четвёртой строке обязательно сохрани 1000+, слова «промпт» и «визуал», но каждый вариант формулируй по-разному: «получи», «забери», «отправлю», «пришлю», «оставь слово» и т.д.
- В конце четвёртой строки всегда добавляй «${REELS_FOLLOW_NOTICE}».
- Не используй одну и ту же CTA-формулировку во всех вариантах и не копируй дословно пример.
- Каждый вариант должен быть уникальным: не повторяй начало, метафору, практический совет или связку слов.
- Меняй продающий угол между вариантами: экономия времени, меньше неудачных генераций, готовая структура, лёгкая адаптация, идеи для контента, управление стилем, светом и камерой.
- Не выдумывай цифры, гарантии, бренды и состав пака, кроме фиксированного оффера «1000+ готовых промптов», который должен быть в CTA.
- В описании Reels запрещены «2 генерации», «две генерации», «бесплатные генерации», «протестируй бесплатно» и любые похожие формулировки — это отдельный оффер воронки.
- Пиши естественно и конкретно, без слов «вариант», «ролик номер», «контекст серии» и технических описаний монтажа.
- Третья строка должна быть короткой и содержать только призыв с кодовым словом и фиксированный оффер из правила выше.
- Хэштеги разные в каждом варианте, без повторов внутри одного варианта.${
      request.brandTag ? `\n- Первым хэштегом всегда ${normalizeTag(request.brandTag)}.` : ''
    }${request.topic ? `\n- Тема ролика: ${request.topic}.` : ''}

Верни JSON: { "captions": ["строка1\\nстрока2\\nстрока3\\nстрока4", ...] }
`;

    const response = await client.chat.completions.create({
      model: MODEL_ID,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      response_format: { type: 'json_object' },
      extra_body: NO_THINKING,
    } as any);

    const text = response.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const captions: unknown = parsed?.captions;
    if (!Array.isArray(captions)) return fallback;

    const usable = captions
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.replace(/\r\n?/g, '\n').trim())
      .filter((c) => {
        const lines = c.split('\n').map((line) => line.trim()).filter(Boolean);
        const normalized = c.toLowerCase().replace(/ё/g, 'е');
        return lines.length >= 5
          && hasReelsCaptionCta(lines[3] || '', keyword)
          && lines[4]?.includes('#')
          && !REELS_FORBIDDEN_OFFER_PATTERNS.some((pattern) => pattern.test(normalized))
          && c.length < 600;
      });

    const seenCaptions = new Set<string>();
    const seenOpenings = new Set<string>();
    const normalizeForComparison = (value: string) =>
      value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

    return fallback.map((built, i) => {
      const candidate = usable[i];
      if (candidate) {
        const lines = candidate.split('\n').map((line) => line.trim()).filter(Boolean);
        lines[3] = normalizeReelsCaptionCtaLine(lines[3] || '', keyword, i);
        const normalizedCandidate = lines.join('\n');
        const captionKey = normalizeForComparison(normalizedCandidate);
        const openingKey = normalizeForComparison(lines.slice(0, 3).join(' '));
        if (!seenCaptions.has(captionKey) && !seenOpenings.has(openingKey)) {
          seenCaptions.add(captionKey);
          seenOpenings.add(openingKey);
          return normalizedCandidate;
        }
      }

      const fallbackLines = built.split('\n').map((line) => line.trim()).filter(Boolean);
      seenCaptions.add(normalizeForComparison(built));
      seenOpenings.add(normalizeForComparison(fallbackLines.slice(0, 3).join(' ')));
      return built;
    });
  } catch (err) {
    console.warn('AI captions unavailable, using the built-in pattern', err);
    return fallback;
  }
};
