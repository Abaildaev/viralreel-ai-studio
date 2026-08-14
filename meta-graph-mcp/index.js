import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const APP_ID = process.env.META_APP_ID;
const APP_ACCESS_TOKEN = process.env.META_APP_ACCESS_TOKEN;
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v26.0';

if (!APP_ID || !APP_ACCESS_TOKEN) {
  throw new Error('META_APP_ID and META_APP_ACCESS_TOKEN must be configured.');
}

const graphBaseUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function stringify(data) {
  return JSON.stringify(data, null, 2);
}

function toolResult(data) {
  return {
    content: [{ type: 'text', text: stringify(data) }],
  };
}

function errorResult(error) {
  return {
    content: [{ type: 'text', text: stringify({ error }) }],
    isError: true,
  };
}

async function graphRequest(path, { method = 'GET', params = {} } = {}) {
  const url = new URL(`${graphBaseUrl}/${path.replace(/^\//, '')}`);
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    const normalized = Array.isArray(value) ? value.join(',') : String(value);
    if (method === 'GET' || method === 'DELETE') url.searchParams.set(key, normalized);
    else body.set(key, normalized);
  }

  if (method === 'GET' || method === 'DELETE') url.searchParams.set('access_token', APP_ACCESS_TOKEN);
  else body.set('access_token', APP_ACCESS_TOKEN);

  const response = await fetch(url, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: method === 'POST' ? body : undefined,
  });

  const data = await response.json().catch(() => ({ error: { message: 'Meta returned a non-JSON response.' } }));
  if (!response.ok || data.error) {
    const message = data.error?.message ?? `Meta Graph API returned HTTP ${response.status}`;
    const code = data.error?.code;
    throw new Error(code ? `${message} (code ${code})` : message);
  }
  return data;
}

const server = new McpServer({
  name: 'Meta Graph App Manager',
  version: '1.0.0',
}, {
  instructions: 'Manage the configured Meta app only. Never request or expose access tokens. Read operations are safe. Webhook changes affect the live Meta application and need user confirmation.',
});

server.registerTool('meta_app_info', {
  title: 'Get Meta app information',
  description: 'Returns basic information for the configured Meta application.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
}, async () => {
  try {
    return toolResult(await graphRequest(APP_ID, {
      params: { fields: 'id,name,link,namespace,category,company' },
    }));
  } catch (error) {
    return errorResult(error.message);
  }
});

server.registerTool('meta_app_token_status', {
  title: 'Check Meta app access token',
  description: 'Checks whether the configured app access token is valid without returning it.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
}, async () => {
  try {
    const data = await graphRequest('debug_token', {
      params: { input_token: APP_ACCESS_TOKEN },
    });
    const { app_id, application, is_valid, type, scopes } = data.data ?? {};
    return toolResult({ app_id, application, is_valid, type, scopes });
  } catch (error) {
    return errorResult(error.message);
  }
});

server.registerTool('meta_webhooks_list', {
  title: 'List Meta webhooks',
  description: 'Lists webhook subscriptions configured for the Meta application.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
}, async () => {
  try {
    return toolResult(await graphRequest(`${APP_ID}/subscriptions`));
  } catch (error) {
    return errorResult(error.message);
  }
});

server.registerTool('meta_webhook_subscribe', {
  title: 'Create or update Meta webhook subscription',
  description: 'Creates or updates a webhook subscription for the configured Meta app. The callback must be an HTTPS endpoint that Meta can verify.',
  inputSchema: z.object({
    object: z.string().regex(/^[a-z_]+$/, 'Use a Meta webhook object name, for example instagram or page.'),
    callback_url: z.string().url().refine((value) => new URL(value).protocol === 'https:', 'callback_url must use HTTPS.'),
    verify_token: z.string().min(16).max(256),
    fields: z.array(z.string().regex(/^[a-z_]+$/)).min(1).max(100),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false },
}, async (input) => {
  try {
    return toolResult(await graphRequest(`${APP_ID}/subscriptions`, {
      method: 'POST',
      params: input,
    }));
  } catch (error) {
    return errorResult(error.message);
  }
});

server.registerTool('meta_webhook_unsubscribe', {
  title: 'Delete Meta webhook subscription',
  description: 'Deletes the configured Meta app webhook subscription for one object.',
  inputSchema: z.object({
    object: z.string().regex(/^[a-z_]+$/, 'Use a Meta webhook object name.'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: true },
}, async ({ object }) => {
  try {
    return toolResult(await graphRequest(`${APP_ID}/subscriptions`, {
      method: 'DELETE',
      params: { object },
    }));
  } catch (error) {
    return errorResult(error.message);
  }
});

await server.connect(new StdioServerTransport());
