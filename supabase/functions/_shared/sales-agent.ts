/*
  The AI sales agent, server side.

  This is the half that answers real Direct messages. The browser keeps its own
  copy for the simulator, and the two must agree: if the prompt or the intent
  rules drift apart, the simulator starts lying about what the account will
  actually say to a customer.

  Each user keeps their own DeepSeek key in encrypted server-side storage. It
  never reaches the browser after saving; the webhook decrypts it just before
  making a model request.
*/

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL_ID = "deepseek-v4-flash";

/** Instagram truncates long DMs and they read as spam. */
const MAX_REPLY_CHARS = 900;

export type SalesAgentTone =
  | "friendly_expert"
  | "energetic_mentor"
  | "concise_consultant"
  | "premium_concierge";

export type SalesAgentGoal =
  | "consultation"
  | "direct_sale"
  | "collect_contact"
  | "lead_qualification";

export type DetectedIntent =
  | "question"
  | "objection"
  | "ready_to_buy"
  | "handoff_request"
  | "greeting";

export interface SalesAgentProduct {
  name: string;
  price: string;
  description: string;
  features?: string[];
  link?: string;
}

export interface SalesAgentObjection {
  objection: string;
  suggestedAnswer: string;
}

export interface SalesAgentRow {
  id: string;
  user_id: string;
  instagram_account_id: string | null;
  agent_name: string;
  tone: SalesAgentTone;
  goal: SalesAgentGoal;
  business_description: string;
  custom_instructions: string;
  target_action_prompt: string;
  products: SalesAgentProduct[];
  objections: SalesAgentObjection[];
  handoff_keywords: string[];
  max_consecutive_replies: number;
  is_enabled: boolean;
}

export const SALES_AGENT_COLUMNS =
  "id,user_id,instagram_account_id,agent_name,tone,goal,business_description," +
  "custom_instructions,target_action_prompt,products,objections,handoff_keywords," +
  "max_consecutive_replies,is_enabled";

export interface TranscriptMessage {
  role: "user" | "agent";
  content: string;
}

const TONE_DESCRIPTIONS: Record<SalesAgentTone, string> = {
  friendly_expert:
    "Дружелюбный, поддерживающий эксперт. Общайся легко, тепло, на «ты», вдохновляй и помогай.",
  energetic_mentor:
    "Энергичный наставник и мотиватор. Акцент на быстрый результат, системность и действия.",
  concise_consultant:
    "Сдержанный, лаконичный консультант. Краткие ответы по фактам, структурированные тезисы.",
  premium_concierge:
    "Премиальный заботливый консьерж. Вежливо, на «вы», персонализировано и деликатно.",
};

const GOAL_DESCRIPTIONS: Record<SalesAgentGoal, string> = {
  consultation:
    "Цель: мягко квалифицировать клиента (узнать нишу и текущую точку А) и предложить записаться на бесплатный разбор.",
  direct_sale:
    "Цель: ответить на вопросы по тарифам, закрыть сомнения и отправить ссылку на оплату подходящего тарифа.",
  collect_contact:
    "Цель: получить контактные данные лида (ник в Telegram или номер телефона для WhatsApp).",
  lead_qualification:
    "Цель: задать 2-3 квалифицирующих вопроса (ниша, опыт, бюджет) и определить, подходит ли продукт.",
};

const BUYING_MARKERS = ["купить", "оплатить", "реквизиты", "счет", "счёт", "ссылку на оплату", "беру", "готов"];
const OBJECTION_MARKERS = ["дорого", "нет денег", "подумаю", "сомневаюсь", "нет времени", "гарантии"];
const GREETING_MARKERS = ["привет", "здравствуйте", "добрый день", "добрый вечер", "хай", "салам"];

export function detectMessageIntent(text: string, handoffKeywords: string[]): DetectedIntent {
  const lower = text.toLowerCase();

  if (handoffKeywords.some((keyword) => keyword && lower.includes(keyword.toLowerCase()))) {
    return "handoff_request";
  }
  if (BUYING_MARKERS.some((marker) => lower.includes(marker))) return "ready_to_buy";
  if (OBJECTION_MARKERS.some((marker) => lower.includes(marker))) return "objection";
  if (GREETING_MARKERS.some((marker) => lower.includes(marker))) return "greeting";
  return "question";
}

export function buildSystemPrompt(agent: SalesAgentRow): string {
  const products = (agent.products ?? [])
    .map(
      (product) =>
        `- ${product.name}: Цена ${product.price}. Описание: ${product.description}. ` +
        `Ссылка: ${product.link || "по запросу"}. Преимущества: ${(product.features ?? []).join(", ")}`,
    )
    .join("\n");

  const objections = (agent.objections ?? [])
    .map((item) => `- Возражение «${item.objection}»: ${item.suggestedAnswer}`)
    .join("\n");

  return `Ты — ИИ-продавец и ассистент по имени ${agent.agent_name} в Instagram Direct.

О КОМПАНИИ И БИЗНЕСЕ:
${agent.business_description}

СТИЛЬ ОБЩЕНИЯ:
${TONE_DESCRIPTIONS[agent.tone]}

ГЛАВНАЯ ЦЕЛЬ ДИАЛОГА:
${GOAL_DESCRIPTIONS[agent.goal]}
Целевое действие: ${agent.target_action_prompt}

ПРОДУКТОВАЯ ЛИНЕЙКА И ЦЕНЫ:
${products || "— не заполнено, не выдумывай тарифы"}

БАЗА ЗНАНИЙ И ОБРАБОТКА ВОЗРАЖЕНИЙ:
${objections || "— не заполнено"}

ИНДИВИДУАЛЬНЫЕ ИНСТРУКЦИИ:
${agent.custom_instructions}

ПРАВИЛА И ОГРАНИЧЕНИЯ:
1. Пиши как живой человек в Instagram Direct: коротко, 1-3 предложения. Не пиши простыни текста.
2. Всегда заканчивай сообщение одним понятным вовлекающим вопросом.
3. Не придумывай несуществующие тарифы, скидки или гарантии, которых нет выше.
4. Не обещай сроки и результаты, которых нет в базе знаний.
5. Если клиент прямо просит человека или менеджера, вежливо ответь, что подключаешь специалиста.`;
}

/** Returns null when the model is unreachable or answers with nothing usable. */
async function callDeepSeek(
  apiKey: string | null,
  systemPrompt: string,
  transcript: TranscriptMessage[],
): Promise<string | null> {
  if (!apiKey) return null;

  const messages = [
    { role: "system", content: systemPrompt },
    ...transcript.map((message) => ({
      role: message.role === "agent" ? "assistant" : "user",
      content: message.content,
    })),
  ];

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages,
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("DeepSeek error", data?.error?.message ?? response.status);
      return null;
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    return reply ? reply.slice(0, MAX_REPLY_CHARS) : null;
  } catch (error) {
    console.error("DeepSeek request failed", error);
    return null;
  }
}

export interface AgentDecision {
  /** Absent when the agent decided to stay silent. */
  reply: string | null;
  intent: DetectedIntent;
  /** True when this turn hands the thread to a human and ends automation. */
  handOff: boolean;
  /** Why nothing was sent, for the event log. */
  skippedReason?: string;
}

/**
 * Decides what — if anything — the agent says next.
 *
 * Silence is a valid and frequent outcome: past the reply cap, after a handoff,
 * or when the model is unavailable. There is no canned fallback on purpose. The
 * browser simulator has one so a demo still moves without a key, but sending a
 * guessed sales line to a real customer under the account's name is worse than
 * saying nothing and letting a human pick it up.
 */
export async function decideAgentReply(
  agent: SalesAgentRow,
  transcript: TranscriptMessage[],
  incomingText: string,
  alreadyHandedOff: boolean,
  apiKey: string | null,
): Promise<AgentDecision> {
  const intent = detectMessageIntent(incomingText, agent.handoff_keywords ?? []);

  if (alreadyHandedOff) {
    return { reply: null, intent, handOff: false, skippedReason: "Диалог передан человеку" };
  }

  if (intent === "handoff_request") {
    const contact = agent.target_action_prompt?.trim();
    return {
      reply:
        "Передаю диалог нашему менеджеру 🙌 Он подключится в ближайшее время." +
        (contact ? ` Если вопрос срочный: ${contact}` : ""),
      intent,
      handOff: true,
    };
  }

  const agentTurns = transcript.filter((message) => message.role === "agent").length;
  if (agentTurns >= agent.max_consecutive_replies) {
    return {
      reply: null,
      intent,
      handOff: true,
      skippedReason: `Достигнут лимит ответов (${agent.max_consecutive_replies}) — нужен человек`,
    };
  }

  if (!apiKey) {
    return { reply: null, intent, handOff: false, skippedReason: "Ключ DeepSeek не сохранён в Настройках" };
  }

  const reply = await callDeepSeek(apiKey, buildSystemPrompt(agent), [
    ...transcript,
    { role: "user", content: incomingText },
  ]);

  if (!reply) {
    return { reply: null, intent, handOff: false, skippedReason: "Модель недоступна — ответ не отправлен" };
  }

  return { reply, intent, handOff: false };
}
