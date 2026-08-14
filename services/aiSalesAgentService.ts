import { AiSalesAgentConfig, AiSalesMessage, SalesAgentGoal, SalesAgentTone } from '../types';
import { getClient, MODEL_ID, NO_THINKING } from './ai/geminiClient';

const STORAGE_KEY = 'ai_sales_agent_config';

export const DEFAULT_SALES_AGENT_CONFIG: AiSalesAgentConfig = {
  id: 'default-agent',
  agentName: 'Алина',
  tone: 'friendly_expert',
  goal: 'consultation',
  businessDescription: 'Агентство автоматизации Instagram и продюсирования вирусных Reels. Помогаем экспертам и бизнесу привлекать целевых подписчиков и лидов на автопилоте.',
  products: [
    {
      id: 'p1',
      name: 'Базовый тариф «Быстрый Старт»',
      price: '19 900 ₽',
      description: 'Готовый шаблон автоворонки Comment-to-DM, 30 вирусных сценариев Reels и видео-инструкция.',
      features: ['Доступ к AI Студии', '30 готовых хуков и шаблонов', 'Интеграция с Direct'],
      link: 'https://mysite.ru/start',
    },
    {
      id: 'p2',
      name: 'Наставничество «Reels на Миллион»',
      price: '59 000 ₽ (или рассрочка 4 900 ₽/мес)',
      description: '2 месяца персональной работы: разработка позиционирования, создание контент-стратегии и настройка ИИ-продавца под ключ.',
      features: ['Персональный разбор профиля', 'Настройка ИИ-продавца под ключ', 'Гарантия окупаемости в договоре'],
      link: 'https://mysite.ru/vip',
    },
  ],
  objections: [
    {
      id: 'o1',
      objection: 'Дорого / нет денег',
      suggestedAnswer: 'Понимаю вас! Поэтому у нас есть беспроцентная рассрочка от 4 900 ₽ в месяц, которая окупается уже с первых 2-3 клиентов из Reels. Хотите покажу кейс ученика из похожей ниши?',
    },
    {
      id: 'o2',
      objection: 'У меня нет времени снимать видео',
      suggestedAnswer: 'Именно для этого мы используем автогенерацию и шаблоны с плашками нейросетей — ролик собирается за 5 минут без сложного монтажа и говорящей головы.',
    },
    {
      id: 'o3',
      objection: 'Я подумаю',
      suggestedAnswer: 'Конечно, это важное решение! А над чем именно хотите подумать — по формату программы или по окупаемости? Могу кратко ответить на ключевые вопросы.',
    },
  ],
  targetActionPrompt: 'Предложи записаться на бесплатный 15-минутный стратегический разбор профиля в Telegram: @alym_digital',
  customInstructions: 'Отвечай лаконично, живо, 2-3 предложениями (как реальный человек в Direct). Задавай вовлекающий встречный вопрос в конце каждого сообщения. Не используй громоздкие канцеляризмы. Если клиент готов — давай прямую ссылку или контакт.',
  handoffKeywords: ['человек', 'менеджер', 'оператор', 'живой', 'позови', 'позвони'],
  maxConsecutiveReplies: 5,
  isEnabled: true,
};

export function loadSalesAgentConfig(): AiSalesAgentConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_SALES_AGENT_CONFIG, ...JSON.parse(saved) };
    }
  } catch {
    // fallback
  }
  return DEFAULT_SALES_AGENT_CONFIG;
}

export function saveSalesAgentConfig(config: AiSalesAgentConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

/**
 * Builds the system prompt for the AI Closer based on the knowledge base and guardrails.
 */
function buildSystemPrompt(config: AiSalesAgentConfig): string {
  const toneDescriptions: Record<SalesAgentTone, string> = {
    friendly_expert: 'Дружелюбный, поддерживающий эксперт. Общайся легко, тепло, на «ты», вдохновляй и помогай.',
    energetic_mentor: 'Энергичный наставник и мотиватор. Акцент на быстрый результат, системность и действия.',
    concise_consultant: 'Сдержанный, лаконичный консультант. Краткие ответы по фактам, структурированные тезисы.',
    premium_concierge: 'Премиальный заботливый консьерж. Вежливо, на «вы», персонализировано и деликатно.',
  };

  const goalDescriptions: Record<SalesAgentGoal, string> = {
    consultation: 'Цель: мягко квалифицировать клиента (узнать нишу и текущую точку А) и предложить записаться на бесплатный разбор/консультацию.',
    direct_sale: 'Цель: ответить на вопросы по тарифам, закрыть сомнения и отправить ссылку на оплату подходящего тарифа.',
    collect_contact: 'Цель: получить контактные данные лида (ник в Telegram или номер телефона для WhatsApp).',
    lead_qualification: 'Цель: задать 2-3 квалифицирующих вопроса (ниша, опыт, бюджет) и определить, подходит ли продукт.',
  };

  const productsList = config.products
    .map(
      (p) =>
        `- ${p.name}: Цена ${p.price}. Описание: ${p.description}. Ссылка: ${p.link || 'по запросу'}. Преимущества: ${p.features.join(', ')}`
    )
    .join('\n');

  const objectionsList = config.objections
    .map((o) => `- Возражение «${o.objection}»: рекомендуемый ответ/смысл: ${o.suggestedAnswer}`)
    .join('\n');

  return `Ты — ИИ-продавец и ассистент по имени ${config.agentName} в Instagram Direct.

О КОМПАНИИ И БИЗНЕСЕ:
${config.businessDescription}

СТИЛЬ ОБЩЕНИЯ (TONE OF VOICE):
${toneDescriptions[config.tone]}

ГЛАВНАЯ ЦЕЛЬ ДИАЛОГА:
${goalDescriptions[config.goal]}
Целевое действие: ${config.targetActionPrompt}

ПРОДУКТОВАЯ ЛИНЕЙКА И ЦЕНЫ:
${productsList}

БАЗА ЗНАНИЙ И ОБРАБОТКА ВОЗРАЖЕНИЙ:
${objectionsList}

ИНДИВИДУАЛЬНЫЕ ИНСТРУКЦИИ:
${config.customInstructions}

ПРАВИЛА И ОГРАНИЧЕНИЯ:
1. Пиши как живой человек в Instagram Direct: коротко, 1-3 предложения. Не пиши длинные простыни текста.
2. Всегда заканчивай сообщение одним понятным вовлекающим вопросом.
3. Не придумывай несуществующие тарифы или скидки, которых нет в списке выше.
4. Если клиент прямо просит человека или менеджера (слова: ${config.handoffKeywords.join(', ')}), вежливо ответь, что подключаешь живого специалиста, и не навязывай автоответ.`;
}

/**
 * Detects intent from the incoming message
 */
export function detectMessageIntent(
  text: string,
  config: AiSalesAgentConfig
): AiSalesMessage['detectedIntent'] {
  const lower = text.toLowerCase();

  // Check for handoff
  if (config.handoffKeywords.some((kw) => lower.includes(kw.toLowerCase()))) {
    return 'handoff_request';
  }

  // Check for buying intent
  if (
    lower.includes('купить') ||
    lower.includes('оплатить') ||
    lower.includes('реквизиты') ||
    lower.includes('счет') ||
    lower.includes('ссылку на оплату') ||
    lower.includes('беру') ||
    lower.includes('готов')
  ) {
    return 'ready_to_buy';
  }

  // Check for objection
  if (
    lower.includes('дорого') ||
    lower.includes('нет денег') ||
    lower.includes('подумаю') ||
    lower.includes('сомневаюсь') ||
    lower.includes('нет времени') ||
    lower.includes('гарантии')
  ) {
    return 'objection';
  }

  // Check for greeting
  if (
    lower.includes('привет') ||
    lower.includes('здравствуйте') ||
    lower.includes('добрый день') ||
    lower.includes('добрый вечер') ||
    lower === 'хай' ||
    lower === 'салам'
  ) {
    return 'greeting';
  }

  return 'question';
}

/**
 * Generates an AI response for the conversation history
 */
export async function generateSalesAgentReply(
  history: AiSalesMessage[],
  config: AiSalesAgentConfig
): Promise<{ reply: string; intent: AiSalesMessage['detectedIntent'] }> {
  const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
  const userText = lastUserMsg?.content || '';
  const intent = detectMessageIntent(userText, config);

  // If client asked for a human manager
  if (intent === 'handoff_request') {
    return {
      reply: `Передаю диалог нашему менеджеру 🙌 Он подключится в течение нескольких минут. Если вопрос срочный, можете также написать напрямую: ${config.targetActionPrompt}`,
      intent: 'handoff_request',
    };
  }

  // Try LLM generation via DeepSeek / Gemini client
  try {
    const client = getClient();
    const systemPrompt = buildSystemPrompt(config);

    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m) => ({
        role: (m.role === 'agent' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
    ];

    const response = await client.chat.completions.create({
      model: MODEL_ID,
      messages: chatMessages,
      temperature: 0.7,
      extra_body: NO_THINKING,
    });

    const reply = response.choices?.[0]?.message?.content?.trim();
    if (reply) {
      return { reply, intent };
    }
  } catch (err: any) {
    console.warn('AI Sales Agent LLM fallback triggered:', err?.message);
  }

  // High-converting smart fallback heuristics if API key is not configured or offline
  let fallbackReply = '';
  const lower = userText.toLowerCase();

  if (intent === 'greeting') {
    fallbackReply = `Привет! Рад знакомству 🙌 Подскажите, вы сейчас развиваете личный блог или проект для бизнеса?`;
  } else if (lower.includes('сколько') || lower.includes('цена') || lower.includes('стоимость') || lower.includes('тариф')) {
    const primary = config.products[0] || { name: 'Базовый тариф', price: '19 900 ₽' };
    fallbackReply = `У нас есть формат «${primary.name}» за ${primary.price}, а также индивидуальное наставничество с гарантией результата. Рассказать подробнее, что входит в программу?`;
  } else if (intent === 'objection') {
    const matchedObj = config.objections.find((o) =>
      lower.includes(o.objection.toLowerCase().split(' ')[0])
    );
    if (matchedObj) {
      fallbackReply = matchedObj.suggestedAnswer;
    } else {
      fallbackReply = `Отличный вопрос! Чтобы подобрать лучший вариант именно под вашу ситуацию, ${config.targetActionPrompt}. Удобно будет списаться?`;
    }
  } else if (intent === 'ready_to_buy') {
    const product = config.products[0];
    fallbackReply = `Отлично! Вы можете оформить участие по ссылке: ${product?.link || 'https://mysite.ru'}. Либо напишите ваш контакт в Telegram, и мы пришлем вам доступ сразу после оплаты!`;
  } else {
    fallbackReply = `Да, именно эту задачу мы помогаем решить! Подскажите, какой сейчас средний охват на ваших Reels, или только начинаете выкладывать?`;
  }

  return { reply: fallbackReply, intent };
}
