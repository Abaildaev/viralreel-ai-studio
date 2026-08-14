import { AiSalesAgentConfig, AiSalesMessage, SalesAgentGoal, SalesAgentTone } from '../types';
import { getClient, MODEL_ID, NO_THINKING } from './ai/deepseekClient';
import { supabase } from '../lib/supabase';

/*
  The agent's configuration lives in `ai_sales_agents`, not in this browser.

  It used to sit in localStorage, which meant the server had no idea the agent
  existed and it could never answer a real Direct message — the whole feature
  was a simulator. The Edge Function reads the same row, so what you configure
  here is what the account actually says.
*/

const AGENT_COLUMNS =
  'id,instagram_account_id,agent_name,tone,goal,business_description,custom_instructions,' +
  'target_action_prompt,products,objections,handoff_keywords,max_consecutive_replies,is_enabled';

export const DEFAULT_SALES_AGENT_CONFIG: AiSalesAgentConfig = {
  id: 'default-agent',
  agentName: 'Алина',
  tone: 'friendly_expert',
  goal: 'consultation',
  businessDescription:
    'Агентство автоматизации Instagram и продюсирования вирусных Reels. Помогаем экспертам и бизнесу привлекать целевых подписчиков и лидов на автопилоте.',
  products: [
    {
      id: 'p1',
      name: 'Базовый тариф «Быстрый Старт»',
      price: '19 900 ₽',
      description: 'Готовый шаблон автоворонки Comment-to-DM, 30 вирусных сценариев Reels и видео-инструкция.',
      features: ['Доступ к AI Студии', '30 готовых хуков и шаблонов', 'Интеграция с Direct'],
      link: 'https://mysite.ru/start',
    },
  ],
  objections: [
    {
      id: 'o1',
      objection: 'Дорого / нет денег',
      suggestedAnswer:
        'Понимаю вас! Поэтому у нас есть беспроцентная рассрочка, которая окупается уже с первых 2-3 клиентов из Reels. Хотите покажу кейс ученика из похожей ниши?',
    },
    {
      id: 'o2',
      objection: 'У меня нет времени снимать видео',
      suggestedAnswer:
        'Именно для этого мы используем автогенерацию и шаблоны с плашками нейросетей — ролик собирается за 5 минут без сложного монтажа.',
    },
    {
      id: 'o3',
      objection: 'Я подумаю',
      suggestedAnswer:
        'Конечно, это важное решение! А над чем именно хотите подумать — по формату программы или по окупаемости?',
    },
  ],
  targetActionPrompt:
    'Предложи записаться на бесплатный 15-минутный стратегический разбор профиля в Telegram: @your_telegram',
  customInstructions:
    'Отвечай лаконично, живо, 2-3 предложениями (как реальный человек в Direct). Задавай вовлекающий встречный вопрос в конце каждого сообщения.',
  handoffKeywords: ['человек', 'менеджер', 'оператор', 'живой', 'позови'],
  maxConsecutiveReplies: 5,
  // Off until the owner deliberately turns it on: enabling this starts sending
  // messages to real people from their account, unattended.
  isEnabled: false,
};

interface AgentRow {
  id: string;
  instagram_account_id: string | null;
  agent_name: string;
  tone: SalesAgentTone;
  goal: SalesAgentGoal;
  business_description: string;
  custom_instructions: string;
  target_action_prompt: string;
  products: AiSalesAgentConfig['products'];
  objections: AiSalesAgentConfig['objections'];
  handoff_keywords: string[];
  max_consecutive_replies: number;
  is_enabled: boolean;
}

function rowToConfig(row: AgentRow): AiSalesAgentConfig {
  return {
    id: row.id,
    instagram_account_id: row.instagram_account_id,
    agentName: row.agent_name,
    tone: row.tone,
    goal: row.goal,
    businessDescription: row.business_description,
    customInstructions: row.custom_instructions,
    targetActionPrompt: row.target_action_prompt,
    products: row.products ?? [],
    objections: row.objections ?? [],
    handoffKeywords: row.handoff_keywords ?? [],
    maxConsecutiveReplies: row.max_consecutive_replies,
    isEnabled: row.is_enabled,
  };
}

function configToRow(config: AiSalesAgentConfig, userId: string) {
  return {
    user_id: userId,
    instagram_account_id: config.instagram_account_id ?? null,
    agent_name: config.agentName,
    tone: config.tone,
    goal: config.goal,
    business_description: config.businessDescription,
    custom_instructions: config.customInstructions,
    target_action_prompt: config.targetActionPrompt,
    products: config.products,
    objections: config.objections,
    handoff_keywords: config.handoffKeywords,
    max_consecutive_replies: config.maxConsecutiveReplies,
    is_enabled: config.isEnabled,
  };
}

/**
 * Loads the agent for one account, falling back to the user's account-agnostic
 * config — the same precedence the webhook applies, so the editor shows the row
 * that will actually answer.
 */
export async function loadSalesAgentConfig(
  accountId: string | null,
): Promise<AiSalesAgentConfig> {
  const { data, error } = await supabase
    .from('ai_sales_agents')
    .select(AGENT_COLUMNS)
    .or(
      accountId
        ? `instagram_account_id.eq.${accountId},instagram_account_id.is.null`
        : 'instagram_account_id.is.null',
    );

  if (error || !data?.length) {
    return { ...DEFAULT_SALES_AGENT_CONFIG, instagram_account_id: accountId };
  }

  const rows = data as unknown as AgentRow[];
  const preferred =
    rows.find((row) => row.instagram_account_id === accountId) ??
    rows.find((row) => row.instagram_account_id === null);

  return preferred
    ? rowToConfig(preferred)
    : { ...DEFAULT_SALES_AGENT_CONFIG, instagram_account_id: accountId };
}

export async function saveSalesAgentConfig(
  config: AiSalesAgentConfig,
  userId: string,
): Promise<{ error: Error | null }> {
  const payload = configToRow(config, userId);

  // The partial unique indexes make account-scoped and default rows distinct,
  // so upsert has to be told which conflict it is resolving.
  const { error } = await supabase.from('ai_sales_agents').upsert(payload, {
    onConflict: config.instagram_account_id ? 'user_id,instagram_account_id' : 'user_id',
  });

  return { error: error ? new Error(error.message) : null };
}

function buildSystemPrompt(config: AiSalesAgentConfig): string {
  const toneDescriptions: Record<SalesAgentTone, string> = {
    friendly_expert: 'Дружелюбный, поддерживающий эксперт. Общайся легко, тепло, на «ты».',
    energetic_mentor: 'Энергичный наставник. Акцент на быстрый результат и действия.',
    concise_consultant: 'Сдержанный, лаконичный консультант. Краткие ответы по фактам.',
    premium_concierge: 'Премиальный заботливый консьерж. Вежливо, на «вы», деликатно.',
  };

  const goalDescriptions: Record<SalesAgentGoal, string> = {
    consultation: 'Цель: квалифицировать клиента и предложить бесплатный разбор.',
    direct_sale: 'Цель: закрыть сомнения и отправить ссылку на оплату.',
    collect_contact: 'Цель: получить контакт лида (Telegram или телефон).',
    lead_qualification: 'Цель: задать 2-3 квалифицирующих вопроса и определить, подходит ли продукт.',
  };

  const products = config.products
    .map(
      (p) =>
        `- ${p.name}: Цена ${p.price}. Описание: ${p.description}. Ссылка: ${p.link || 'по запросу'}. Преимущества: ${p.features.join(', ')}`,
    )
    .join('\n');

  const objections = config.objections
    .map((o) => `- Возражение «${o.objection}»: ${o.suggestedAnswer}`)
    .join('\n');

  return `Ты — ИИ-продавец и ассистент по имени ${config.agentName} в Instagram Direct.

О КОМПАНИИ И БИЗНЕСЕ:
${config.businessDescription}

СТИЛЬ ОБЩЕНИЯ:
${toneDescriptions[config.tone]}

ГЛАВНАЯ ЦЕЛЬ ДИАЛОГА:
${goalDescriptions[config.goal]}
Целевое действие: ${config.targetActionPrompt}

ПРОДУКТОВАЯ ЛИНЕЙКА И ЦЕНЫ:
${products || '— не заполнено, не выдумывай тарифы'}

БАЗА ЗНАНИЙ И ОБРАБОТКА ВОЗРАЖЕНИЙ:
${objections || '— не заполнено'}

ИНДИВИДУАЛЬНЫЕ ИНСТРУКЦИИ:
${config.customInstructions}

ПРАВИЛА И ОГРАНИЧЕНИЯ:
1. Пиши как живой человек в Instagram Direct: коротко, 1-3 предложения.
2. Всегда заканчивай сообщение одним понятным вовлекающим вопросом.
3. Не придумывай несуществующие тарифы, скидки или гарантии.
4. Если клиент прямо просит человека, вежливо ответь, что подключаешь специалиста.`;
}

export function detectMessageIntent(
  text: string,
  config: AiSalesAgentConfig,
): AiSalesMessage['detectedIntent'] {
  const lower = text.toLowerCase();

  if (config.handoffKeywords.some((kw) => kw && lower.includes(kw.toLowerCase()))) {
    return 'handoff_request';
  }
  if (['купить', 'оплатить', 'реквизиты', 'счет', 'счёт', 'ссылку на оплату', 'беру', 'готов'].some((m) => lower.includes(m))) {
    return 'ready_to_buy';
  }
  if (['дорого', 'нет денег', 'подумаю', 'сомневаюсь', 'нет времени', 'гарантии'].some((m) => lower.includes(m))) {
    return 'objection';
  }
  if (['привет', 'здравствуйте', 'добрый день', 'добрый вечер', 'хай', 'салам'].some((m) => lower.includes(m))) {
    return 'greeting';
  }
  return 'question';
}

/**
 * Generates a reply for the on-screen simulator only, using the browser's own
 * BYOK key. Real Direct messages are answered by the Edge Function with the
 * server key — see supabase/functions/_shared/sales-agent.ts.
 */
export async function generateSalesAgentReply(
  history: AiSalesMessage[],
  config: AiSalesAgentConfig,
): Promise<{ reply: string; intent: AiSalesMessage['detectedIntent'] }> {
  const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
  const userText = lastUserMsg?.content || '';
  const intent = detectMessageIntent(userText, config);

  if (intent === 'handoff_request') {
    return {
      reply: `Передаю диалог нашему менеджеру 🙌 Он подключится в ближайшее время. Если вопрос срочный: ${config.targetActionPrompt}`,
      intent: 'handoff_request',
    };
  }

  const client = getClient();
  const response = await client.chat.completions.create({
    model: MODEL_ID,
    messages: [
      { role: 'system' as const, content: buildSystemPrompt(config) },
      ...history.map((m) => ({
        role: (m.role === 'agent' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
    ],
    temperature: 0.7,
    extra_body: NO_THINKING,
  });

  const reply = response.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error('Модель не вернула ответ. Проверьте ключ DeepSeek в настройках.');
  }

  return { reply, intent };
}
