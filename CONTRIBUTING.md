# Contributing

## Local checks

Use Node.js 22 or newer and install exactly from the lockfile:

```bash
npm ci
npm run check
npm run audit
```

Tests use Node's built-in test runner and must not contact Hyperliquid or Telegram. Inject fake `fetch` and WebSocket implementations for network behavior.

## Change guidelines

- Keep the tracker read-only. Do not add signing keys or exchange actions.
- Preserve delivery-before-deduplication ordering so failed alerts remain retryable.
- Preserve REST reconciliation when modifying WebSocket behavior.
- Treat Hyperliquid coin strings as identifiers; do not maintain hard-coded `@…` mappings.
- Validate new environment variables in `src/config.js`, add them to `.env.example`, and document them in `README.md`.
- Add regression coverage for alert semantics, retry behavior, state changes, and malformed input.
- Do not commit `.env`, runtime state, logs, `node_modules`, chat IDs, or tokens.

## Pull requests

Keep pull requests focused and explain any change to alert semantics or persisted state. CI must pass syntax checks, tests, and the production dependency audit.

Report unpatched security problems privately according to [SECURITY.md](SECURITY.md), not in a public issue.
