# Meta Graph MCP

Local MCP server for the configured Meta app. It uses the app access token from the macOS Keychain and never exposes it through tools or source code.

Available tools:

- `meta_app_info` — app name and basic metadata;
- `meta_app_token_status` — verifies the token without revealing it;
- `meta_webhooks_list` — lists configured subscriptions;
- `meta_webhook_subscribe` — creates or updates a subscription;
- `meta_webhook_unsubscribe` — removes a subscription.

The runner expects a Keychain entry named `codex-meta-graph-avtoins` for the local macOS account. Do not place the app access token in this repository, `.env.local`, or the Codex configuration.
