# Security policy

## Supported version

Security fixes target the current `main` branch. Older commits are unsupported.

## Private reporting

Use GitHub's private security advisory feature for this repository. Do not open a public issue for an unpatched credential leak or vulnerability. Include the affected commit, reproduction conditions, impact, and a suggested mitigation when available.

## Credential boundary

The tracker is read-only and must never be given a wallet private key, seed phrase, Hyperliquid signing key, or exchange API agent key. Runtime deployments need only:

- a public wallet address;
- an optional Telegram bot token; and
- an optional Telegram destination chat ID.

Keep Telegram credentials in an untracked `.env` file or the deployment platform's secret store. Avoid placing tokens in command arguments, screenshots, logs, issues, or chat messages.

## Exposure response

If a Telegram token is committed or posted publicly:

1. Revoke it through Telegram's verified `@BotFather` account.
2. Create a replacement token.
3. Update the runtime secret store and restart the service.
4. Remove the exposed value from the current branch.
5. Check GitHub secret-scanning results and close any public disclosure issue only after rotation.
6. Consider a coordinated history rewrite if eliminating the value from Git history is required. Rotation remains mandatory because history rewriting cannot remove third-party clones, caches, or forks.

The credential removed in version 2.0 was recorded by GitHub secret scanning as revoked. Its historical presence must not be treated as authorization to reuse or test it.
