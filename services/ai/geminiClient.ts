type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  response_format?: { type: 'json_object' | 'text' };
  extra_body?: Record<string, unknown>;
};

export type DeepSeekClient = {
  chat: {
    completions: {
      create: (request: ChatCompletionRequest) => Promise<{
        choices?: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
};

let client: DeepSeekClient | null = null;
let currentApiKey: string | null = null;

export function getClient(): DeepSeekClient {
  const userApiKey = typeof window !== 'undefined'
    ? localStorage.getItem('deepseek_api_key')
    : null;
  // The frontend only accepts the user's own BYOK key. Never read a server
  // secret from a Vite bundle or browser runtime.
  const apiKey = userApiKey || '';

  if (!apiKey) {
    throw new Error('API ключ DeepSeek не найден. Добавьте его в настройках (иконка шестеренки).');
  }

  if (!client || currentApiKey !== apiKey) {
    client = {
      chat: {
        completions: {
          create: async (request) => {
            // `extra_body` is a compatibility convention used by OpenAI SDKs.
            // This lightweight fetch client must merge those fields into the
            // actual DeepSeek request body itself.
            const { extra_body, ...requestBody } = request;
            const response = await fetch('https://api.deepseek.com/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({ ...requestBody, ...extra_body }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(data?.error?.message || `DeepSeek API error (${response.status})`);
            }
            return data;
          },
        },
      },
    };
    currentApiKey = apiKey;
  }

  return client;
}

export const MODEL_ID = 'deepseek-v4-pro';
export const NO_THINKING = { thinking: { type: 'disabled' } };
