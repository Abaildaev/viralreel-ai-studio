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
    '1 промпт = Reels на миллион',
    'Этот Reel полностью создал ИИ',
    'Мини-фильм за 15 секунд',
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
- допустимые конструкции: «Seedance 2 + 1 промпт», «1 промпт = Reels на миллион», «Этот Reel создал ИИ»;
- не повторяй примеры дословно во всех вариантах и не обещай гарантированные просмотры.

Правила caption:
- 450–850 символов, 3–4 коротких абзаца, без хэштегов;
- это продающий текст, а не техническое описание ролика;
- открой желанием аудитории создавать эффектные AI-Reels без съёмочной команды и сложного монтажа;
- объясни, что такие видео создаются в Seedance 2.0 с помощью одного грамотно собранного промпта;
- отдельным абзацем продай бесплатный мини-курс: «я записал для вас»; внутри — как писать промпты, задавать сцены, движение камеры, сохранять героя и исправлять ошибки;
- последний абзац — прямой CTA написать «${codeword}» в комментариях или директ, чтобы получить мини-курс;
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

    const variations = processVariations(response.choices[0]?.message?.content || '', variationCount)
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
- caption: оригинальное описание на русском длиной 300–900 символов, раскрывающее мысль ролика и завершающееся естественным CTA написать «${cleanCodeword}» в комментариях или директ;
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

    const text = response.choices[0]?.message?.content || '';
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

    return response.choices[0]?.message?.content?.trim() || "5 нейросетей для автоматизации блогинга в 2026 году";
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
