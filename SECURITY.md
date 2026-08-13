# Security policy

Report vulnerabilities with GitHub's private security advisory feature for this repository. Do not open a public issue for an unpatched credential leak or vulnerability.

The tracker is read-only and must never be given a wallet private key. Runtime deployments need only a public wallet address and, optionally, Telegram delivery credentials.

If a Telegram token is committed or posted publicly, revoke it through `@BotFather`, replace it in the runtime secret store, and remove the exposed value from the current branch. Treat a token as compromised even if it was visible only briefly.
