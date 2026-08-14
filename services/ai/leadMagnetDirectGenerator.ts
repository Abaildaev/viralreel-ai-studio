import { getClient, MODEL_ID, NO_THINKING } from './deepseekClient';

type DirectMessageOptions = {
  title: string;
  description: string;
  keywords: string[];
  buttonText: string;
};

function parseVariants(value: string | null | undefined): string[] {
  if (!value) return [];
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    const variants = Array.isArray(parsed) ? parsed : parsed.variants;
    if (!Array.isArray(variants)) return [];
    return variants
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .filter((item) => item.length >= 20 && item.length <= 500)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/** Produces editable Direct-message alternatives; it never sends a message itself. */
export async function generateLeadMagnetDirectVariants({
  title,
  description,
  keywords,
  buttonText,
}: DirectMessageOptions): Promise<string[]> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: MODEL_ID,
    temperature: 0.85,
    extra_body: NO_THINKING,
    messages: [{
      role: 'system',
      content: `Ты копирайтер для Instagram Direct. Создавай короткие, живые сообщения после комментария с кодовым словом. Верни строго JSON: {"variants":["...","...","..."]}.\n\nПравила: ровно 3 заметно разных варианта на русском; каждое 1–3 коротких предложения, 50–350 символов; дружелюбно и без канцелярита; сообщи, что обещанный материал уже здесь; мягко пригласи нажать кнопку «${buttonText || 'Получить материал'}»; не вставляй URL, хэштеги, приветствие по имени и не выдумывай факты.`,
    }, {
      role: 'user',
      content: `Название лид-магнита: ${title || 'Бесплатный материал'}\nОписание: ${description || 'не указано'}\nКодовые слова: ${keywords.filter(Boolean).join(', ') || 'не указаны'}`,
    }],
  });

  const variants = parseVariants(response.choices?.[0]?.message?.content);
  if (variants.length < 3) {
    throw new Error('ИИ не подготовил три корректных варианта. Попробуйте ещё раз.');
  }
  return variants;
}
