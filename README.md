# Hyperliquid Order Tracker

A small Node.js service that watches one Hyperliquid wallet and sends a Telegram alert when a large order opens. It uses Hyperliquid's `orderUpdates` WebSocket for low-latency events and periodically reconciles against the public `openOrders` API so reconnects do not lose state.

The service is read-only. It needs no wallet key or Hyperliquid credential.

## Behavior

- Alerts on open orders whose remaining size multiplied by limit price reaches `LARGE_ORDER_THRESHOLD`.
- Uses live `allMids` values only when an order has no usable limit price.
- Deduplicates with the wallet address and Hyperliquid order ID.
- Persists notification state atomically in `seenOrders.json` by default.
- Records an order only after Telegram delivery succeeds. Failed deliveries retry on reconciliation.
- Reconnects with exponential backoff and sends WebSocket heartbeats.
- Runs in log-only mode when both Telegram variables are blank.

This tracks orders, not completed trades. If the intended signal is executed fills, subscribe to Hyperliquid's `userFills` feed instead.

## Requirements

- Node.js 22 or newer
- npm
- A Telegram bot token and destination chat ID for Telegram delivery

## Setup

```bash
git clone https://github.com/RdelatowerPR/hyperliquidTracker.git
cd hyperliquidTracker
npm install
```

Copy `.env.example` to `.env`, then set at least `TARGET_ADDRESS`:

```dotenv
TARGET_ADDRESS=0x1111111111111111111111111111111111111111
LARGE_ORDER_THRESHOLD=50000
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Create Telegram bots through `@BotFather`. Keep the token only in `.env` or the secret store used by the deployment platform. Never put it in a tracked file.

Start the service:

```bash
npm start
```

## Configuration

| Variable | Default | Purpose |
| --- | ---: | --- |
| `TARGET_ADDRESS` | required | Wallet to monitor |
| `LARGE_ORDER_THRESHOLD` | `50000` | Minimum remaining order value in USD |
| `TELEGRAM_BOT_TOKEN` | blank | Telegram bot token; set with `TELEGRAM_CHAT_ID` |
| `TELEGRAM_CHAT_ID` | blank | Telegram destination; set with `TELEGRAM_BOT_TOKEN` |
| `ALERT_EXISTING_ON_STARTUP` | `true` | Alert once for qualifying orders already open on first start |
| `ALERT_ORDER_CLOSURES` | `false` | Also report fill/cancel/reject updates for previously alerted orders |
| `SEND_STARTUP_MESSAGE` | `false` | Send a startup notice through the configured notifier |
| `RECONCILE_INTERVAL_MS` | `30000` | REST recovery interval |
| `REQUEST_TIMEOUT_MS` | `10000` | HTTP timeout |
| `HEARTBEAT_INTERVAL_MS` | `30000` | WebSocket application heartbeat interval |
| `MAX_RECONNECT_DELAY_MS` | `30000` | Reconnect backoff ceiling |
| `STATE_RETENTION_MS` | `604800000` | Deduplication-state retention, seven days by default |
| `STATE_FILE` | `seenOrders.json` | Runtime state path |
| `DEBUG_MODE` | `false` | Extra connection and reconciliation logs |

## Deployment

Docker Compose provides an always-on deployment with persistent notification state:

```bash
docker compose up -d --build
docker compose logs -f tracker
```

For PM2:

```bash
pm2 start npm --name hyperliquid-tracker -- start
pm2 save
```

GitHub stores the source and runs CI; it does not host this long-running process. Deploy it on an always-on machine or container platform.

## Development

```bash
npm test
npm run check
npm run audit
```

The test suite uses Node's built-in test runner and makes no network calls. CI runs tests and rejects high or critical production dependency advisories.

## Security

Do not commit `.env`, `keys.txt`, Telegram tokens, chat IDs, wallet private keys, or runtime state. This tracker never needs a wallet private key. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

MIT
