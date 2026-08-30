/*
  Первое сообщение в Direct, написанное под конкретного человека.

  Шаблон, уходящий четыреста раз в неделю, одинаков во всех четырёхстах
  доставках — а Instagram прячет в «Скрытые запросы» именно то, что выглядит
  штампованным. Здесь модель переписывает только текст: кнопка, ссылка и
  вложение собираются прежним кодом и остаются в точности теми же.

  Модель не решает, что отправить, и не общается с человеком — этим занят
  ИИ-продавец в sales-agent.ts. Она делает одно: пересказывает готовое
  предложение своими словами, зная имя собеседника и его комментарий.
*/

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL_ID = "deepseek-v4-flash";

/** Длинный Direct обрезается Instagram и сам по себе читается как рассылка. */
const MAX_OPENER_CHARS = 600;

export interface OpenerBrief {
  /** Заголовок лид-магнита — что человек получит. */
  title: string;
  /** Описание, если владелец его заполнил. */
  description: string;
  /** Готовые варианты — образец тона, а не текст для копирования. */
  examples: string[];
  /** Имя, если оно прошло проверку в personalize.ts. */
  name: string | null;
  /** Комментарий, которым человек попросил материал. */
  comment: string;
  /** Надпись на кнопке — модель зовёт нажать именно её. */
  buttonTitle: string;
}

/**
 * Собирает инструкцию для модели.
 *
 * Вынесено отдельно от запроса, чтобы формулировки можно было проверить
 * тестом: промпт — такая же часть поведения продукта, как код рядом.
 */
export function buildOpenerPrompt(brief: OpenerBrief): string {
  const lines = [
    "Ты ведёшь Instagram-аккаунт и отвечаешь в Direct человеку, который",
    "только что попросил материал в комментариях под твоим Reels.",
    "",
    `Материал: ${brief.title}`,
  ];

  if (brief.description.trim()) lines.push(`Подробности: ${brief.description.trim()}`);
  if (brief.comment.trim()) lines.push(`Его комментарий: «${brief.comment.trim()}»`);

  lines.push(
    "",
    brief.name
      ? `Обратись по имени: ${brief.name}. Ровно один раз, в начале.`
      : "Имя неизвестно — не выдумывай его и не обращайся никак.",
    "",
    "Правила:",
    "1. Два-три коротких предложения, живым языком, на «ты».",
    brief.buttonTitle.trim()
      ? `2. Не вставляй ссылок. Позови нажать кнопку «${brief.buttonTitle.trim()}» — она уже есть рядом с сообщением.`
      : "2. Не вставляй ссылок. Позови нажать кнопку рядом с сообщением.",
    "3. Не обещай ничего, чего нет в описании материала.",
    "4. Без приветствий вроде «Здравствуйте» и без подписи.",
    "5. Только текст сообщения, без кавычек и пояснений.",
  );

  if (brief.examples.length > 0) {
    lines.push("", "Примеры тона, писать нужно иначе, но в этом духе:");
    for (const example of brief.examples.slice(0, 2)) {
      lines.push(`— ${example.replace(/\s+/g, " ").slice(0, 200)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Возвращает null, когда модель недоступна или ответила пустым.
 *
 * Ошибка здесь ничего не стоит: вызывающий код отправляет заготовленный
 * вариант. Персонализация — улучшение, а не условие доставки.
 */
export async function generateDirectOpener(
  apiKey: string | null,
  brief: OpenerBrief,
): Promise<string | null> {
  if (!apiKey) return null;

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: "system", content: buildOpenerPrompt(brief) }],
        temperature: 0.9,
        /*
          300 было впритык: два-три предложения на русском — это уже
          120-200 токенов, а если провайдер считает в бюджет ещё и скрытое
          рассуждение (reasoning), ответ обрезается до пустого content ещё
          до того, как модель успевает написать сам текст.
        */
        max_tokens: 500,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("Opener model error", data?.error?.message ?? response.status);
      return null;
    }

    const choice = data?.choices?.[0];
    const text = String(choice?.message?.content ?? "")
      .replace(/^["«»']+|["«»']+$/g, "")
      .trim();

    if (!text) {
      /*
        Пусто, но ответ 200 — модель либо срезана по max_tokens (обычно
        видно по finish_reason: "length"), либо часть провайдеров кладёт
        текст в reasoning_content, а content оставляет пустым. Раньше это
        падало в шаблон без единого следа в логах — теперь видно, что именно
        произошло.
      */
      console.error(
        "Opener returned empty content",
        JSON.stringify({
          finish_reason: choice?.finish_reason,
          has_reasoning_content: Boolean(choice?.message?.reasoning_content),
        }),
      );
      return null;
    }

    /*
      Модель иногда всё же вставляет ссылку, несмотря на запрет. Такое
      сообщение отправлять нельзя: ссылка в тексте — ровно тот признак, из-за
      которого переписку и прячут, а кнопка ниже делает её лишней.
    */
    if (/https?:\/\/|t\.me\//i.test(text)) {
      console.error("Opener text contained a link, discarded", text.slice(0, 120));
      return null;
    }

    return text.slice(0, MAX_OPENER_CHARS);
  } catch (error) {
    console.error("Opener request failed", error);
    return null;
  }
}
