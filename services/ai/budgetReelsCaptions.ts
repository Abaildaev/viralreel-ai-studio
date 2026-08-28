import { getClient, MODEL_ID, NO_THINKING } from './deepseekClient';

export type BudgetCaptionRequest = {
  codeword: string;
  count: number;
};

const OPENINGS = [
  'Большая зарплата не спасает, если деньги уходят без плана.',
  'Бюджет начинает работать, когда у каждой суммы появляется задача.',
  'Контроль расходов — это не запреты, а понимание своих приоритетов.',
  'Финансовая подушка начинается не с крупной суммы, а с понятной системы.',
  'Деньги перестают исчезать, когда бюджет видно целиком на одном экране.',
];

const INSIGHTS = [
  'Сначала фиксирую обязательные расходы, затем желания и только после этого распределяю накопления.',
  'Таблица помогает заранее увидеть перегруженную категорию и скорректировать её до конца месяца.',
  'Когда расходы разбиты по категориям, планировать покупки и накопления становится намного проще.',
  'Даже простой еженедельный контроль показывает, какие траты повторяются и не приносят пользы.',
  'Главное — регулярно обновлять цифры и сравнивать план с фактическими расходами.',
];

const HASHTAGS = [
  '#бюджет #финансы #деньги #накопления',
  '#личныефинансы #учетрасходов #финансоваяграмотность #бюджет',
  '#планирование #финансы #экономия #денежныепривычки',
  '#семейныйбюджет #деньги #финансовыйплан #накопления',
  '#контрольрасходов #бюджет #личныефинансы #финансоваяцель',
];

export function normalizeBudgetCodeword(value: string): string {
  return value.replace(/[«»"'\n\r]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

export function buildBudgetReelsCaption(codeword: string, index: number): string {
  const keyword = normalizeBudgetCodeword(codeword) || 'БЮДЖЕТ';
  return `${OPENINGS[index % OPENINGS.length]}\n\n${INSIGHTS[index % INSIGHTS.length]}\n\nНапиши «${keyword}» в комментариях — отправлю готовый шаблон бюджета в Direct.\n\n${HASHTAGS[index % HASHTAGS.length]}`;
}

function hasGenderPlaceholder(value: string): boolean {
  const normalized = value.toLowerCase().replace(/ё/g, 'е');
  return /\([а-я]{1,4}\)|\b[а-я]+\/[а-я]+\b|сделал\s*\(?а\)?|готов\s*\(?а\)?/.test(normalized);
}

function isUsableCaption(value: string, keyword: string): boolean {
  const normalized = value.toUpperCase().replace(/Ё/g, 'Е');
  return value.length >= 180
    && value.length <= 900
    && normalized.includes(`«${keyword}»`)
    && !hasGenderPlaceholder(value);
}

export async function generateBudgetReelsCaptions(
  request: BudgetCaptionRequest,
): Promise<string[]> {
  const count = Math.max(1, Math.min(20, request.count));
  const keyword = normalizeBudgetCodeword(request.codeword) || 'БЮДЖЕТ';
  const fallback = Array.from({ length: count }, (_, index) =>
    buildBudgetReelsCaption(keyword, index),
  );

  try {
    const client = getClient();
    const prompt = `
Ты — direct-response копирайтер для Instagram-блога о личных финансах. Напиши ровно ${count} заметно разных описаний для Reels с наглядной таблицей распределения месячного бюджета.

ЦЕЛЬ:
Дать короткую полезную мысль о планировании денег и привести человека к бесплатному шаблону бюджета через кодовое слово.

ФОРМАТ КАЖДОГО ОПИСАНИЯ:
1) сильный, но правдивый hook;
2) 1–2 коротких абзаца с конкретной пользой: категории расходов, план и факт, накопления или финансовая подушка;
3) отдельный CTA: написать точное кодовое слово «${keyword}» в комментариях, после чего автор отправит шаблон в Direct;
4) последняя строка — 4–6 релевантных хэштегов.

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
- Пиши естественно по-русски, без канцелярита и пустых обещаний.
- Автор — мужчина. Если используешь первое лицо в прошедшем времени, пиши только мужскую форму: «сделал», «начал», «понял», «сэкономил».
- Категорически запрещены формы с вариантами пола: «сделал(а)», «готов(а)», «начал/а», скобки или косая черта с окончанием.
- Лучше использовать нейтральные фразы, где пол автора вообще не требуется.
- Во всех описаниях используй только кодовое слово «${keyword}». Не заменяй его на «таблица», «хочу», «старт», «финансы» или другое слово.
- Кодовое слово обязательно пиши в русских кавычках: «${keyword}».
- Не выдумывай доход, срок, проценты экономии, личный кейс или гарантированный результат.
- Не повторяй одинаковые первые фразы и CTA дословно.
- Длина одного описания — 250–700 символов.

Верни только JSON:
{"captions":["описание 1","описание 2"]}
`;

    const response = await client.chat.completions.create({
      model: MODEL_ID,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      response_format: { type: 'json_object' },
      extra_body: NO_THINKING,
    } as any);

    const raw = response.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const captions = Array.isArray(parsed?.captions) ? parsed.captions : [];
    const usable = captions
      .filter((caption: unknown): caption is string => typeof caption === 'string')
      .map((caption: string) => caption.replace(/\r\n?/g, '\n').trim())
      .filter((caption: string) => isUsableCaption(caption, keyword));

    return fallback.map((built, index) => usable[index] || built);
  } catch (error) {
    console.warn('Budget caption generation failed, using safe templates', error);
    return fallback;
  }
}
