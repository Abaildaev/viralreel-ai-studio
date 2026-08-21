export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
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
  const browserAvailable = typeof window !== 'undefined';
  const userApiKey = browserAvailable
    ? localStorage.getItem('deepseek_api_key')
    : null;
  const apiKey = userApiKey?.trim() || '';
  if (!browserAvailable && !apiKey) {
    throw new Error('API ключ DeepSeek недоступен.');
  }
  const credentialSource = apiKey || 'server-credential';

  if (!client || currentApiKey !== credentialSource) {
    client = {
      chat: {
        completions: {
          create: async (request) => {
            // `extra_body` is a compatibility convention used by OpenAI SDKs.
            // This lightweight fetch client must merge those fields into the
            // actual DeepSeek request body itself.
            const { extra_body, ...requestBody } = request;
            const payload = { ...requestBody, ...extra_body };

            if (!apiKey) {
              const { data, error } = await supabase.functions.invoke('deepseek-credential', {
                body: { action: 'complete', request: payload },
              });
              if (error || data?.error) {
                throw new Error(
                  data?.error
                    || error?.message
                    || 'Защищённый ключ DeepSeek недоступен.',
                );
              }
              return data;
            }

            const response = await fetch('https://api.deepseek.com/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(payload),
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
    currentApiKey = credentialSource;
  }

  return client;
}

export const MODEL_ID = 'deepseek-v4-pro';
export const NO_THINKING = { thinking: { type: 'disabled' } };
import { supabase } from '../../lib/supabase';
