# Hyperliquid Order Tracker

A read-only Node.js service that watches one Hyperliquid wallet and sends a Telegram alert when a large order opens.

The tracker uses Hyperliquid's `orderUpdates` WebSocket for low-latency events and periodically reconciles against the public `openOrders` endpoint to recover from disconnects. It never places orders and never needs a wallet key or Hyperliquid credential.

## What it tracks

- Open orders, not completed trades or position changes.
- An order qualifies when `remaining size × limit price` is at least `LARGE_ORDER_THRESHOLD`.
- When no usable limit price is present, the current `allMids` value for that exact Hyperliquid coin identifier is used.
- Each qualifying wallet/order ID pair is alerted once. Failed Telegram deliveries are not marked complete, so reconciliation can retry them.
- Optional terminal alerts report later fills, cancellations, and rejections for orders that produced an open-order alert.

If the intended signal is executed trades, position opens, or position changes, this service needs a different event source such as Hyperliquid's `userFills` feed.

## Requirements

- Node.js 22 or newer
- npm
- A public Hyperliquid wallet address
- Optional Telegram bot token and destination chat ID

## Quick start

```bash
git clone https://github.com/RdelatowerPR/hyperliquidTracker.git
cd hyperliquidTracker
npm ci
```

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

At minimum, replace the zero address:

```dotenv
TARGET_ADDRESS=0x1111111111111111111111111111111111111111
LARGE_ORDER_THRESHOLD=50000
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Leaving both Telegram settings blank enables log-only mode, which is useful for the first run.

```bash
npm start
```

A healthy start looks like this:

```text
[info] Tracking 0x… for open orders worth at least $50,000.
[info] Telegram credentials absent; using log-only mode.
[info] Connected to Hyperliquid orderUpdates WebSocket.
```

Receiving zero open orders is normal when the configured wallet has no orders resting on Hyperliquid.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `TARGET_ADDRESS` | required | Non-zero, 42-character wallet or sub-account address to monitor |
| `LARGE_ORDER_THRESHOLD` | `50000` | Minimum remaining order value in USD |
| `TELEGRAM_BOT_TOKEN` | blank | Telegram bot token; set together with `TELEGRAM_CHAT_ID` |
| `TELEGRAM_CHAT_ID` | blank | Telegram destination; set together with `TELEGRAM_BOT_TOKEN` |
| `ALERT_EXISTING_ON_STARTUP` | `true` | Alert once for qualifying orders already open on the first run |
| `ALERT_ORDER_CLOSURES` | `false` | Report terminal updates for previously alerted orders |
| `SEND_STARTUP_MESSAGE` | `false` | Send a startup notice through the configured notifier |
| `DEBUG_MODE` | `false` | Enable connection and reconciliation diagnostics |
| `RECONCILE_INTERVAL_MS` | `30000` | REST recovery interval; minimum 5 seconds |
| `REQUEST_TIMEOUT_MS` | `10000` | HTTP request timeout; minimum 1 second |
| `HEARTBEAT_INTERVAL_MS` | `30000` | WebSocket application heartbeat; minimum 10 seconds |
| `MAX_RECONNECT_DELAY_MS` | `30000` | Exponential reconnect backoff ceiling |
| `STATE_RETENTION_MS` | `604800000` | Retention for terminal deduplication records; open records are retained |
| `STATE_FILE` | `seenOrders.json` | Atomic runtime state path |
| `HYPERLIQUID_INFO_ENDPOINT` | mainnet `/info` | REST endpoint override for tests or another network |
| `HYPERLIQUID_WS_ENDPOINT` | mainnet `/ws` | WebSocket endpoint override for tests or another network |

Boolean values accept `true`/`false`, `yes`/`no`, `on`/`off`, or `1`/`0`. The service exits at startup when required configuration is invalid or only one Telegram credential is present.

## Always-on deployment

Docker Compose persists deduplication state in a named volume:

```bash
docker compose up -d --build
docker compose logs -f tracker
```

For PM2:

```bash
pm2 start npm --name hyperliquid-tracker -- start
pm2 save
```

GitHub stores the source and runs CI; it does not host this long-running service. Deploy it on an always-on machine or container platform.

See [Operations](docs/OPERATIONS.md) for Telegram setup, deployment, upgrades, backups, rollback, monitoring, and troubleshooting.

## Design and reliability

The tracker deliberately combines streaming and polling:

```text
orderUpdates WebSocket ─┐
                       ├─> threshold + dedup ─> Telegram/log ─> atomic state
openOrders + allMids ───┘
     periodic recovery
```

It reconnects with jittered exponential backoff, sends heartbeats, retries transient REST and Telegram failures, and records delivery state only after a notification succeeds. Read [Architecture](docs/ARCHITECTURE.md) for component boundaries, event flow, state semantics, and known limits.

## Development

```bash
npm test
npm run check
npm run audit
```

The 18-test suite uses Node's built-in test runner and makes no network calls. GitHub Actions runs syntax checks, tests, and a production dependency audit for every push and pull request.

See [Contributing](CONTRIBUTING.md) before changing alert semantics or network behavior, and [Changelog](CHANGELOG.md) for release-level changes.

## Security

Never commit `.env`, `keys.txt`, Telegram credentials, chat IDs, wallet private keys, or runtime state. This tracker never needs a wallet private key. See [Security policy](SECURITY.md) for private reporting and credential-response guidance.

## License

[MIT](LICENSE)
