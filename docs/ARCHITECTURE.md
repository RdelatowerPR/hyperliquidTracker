# Architecture

## Scope

The service monitors one public Hyperliquid account for large resting orders. It is intentionally read-only and single-wallet. It does not sign actions, place trades, calculate position PnL, or infer executed trade intent.

## Data flow

```text
Hyperliquid WebSocket
  orderUpdates(user)
          │
          ├── open ───────────────┐
          └── terminal update ─┐  │
                              │  │
Hyperliquid REST              │  │
  openOrders(user) ───────────┼──┤
  allMids() ─ market fallback │  │
                              ▼  ▼
                       TrackerService
                  normalize → value → threshold
                              │
                     wallet + oid dedup
                              │
                    Telegram or log-only
                              │ success
                              ▼
                    atomic JSON state file
```

The WebSocket supplies low-latency order changes. REST reconciliation runs at startup, after every successful WebSocket connection, and on the configured interval. That recovery path catches qualifying orders missed while disconnected.

## Components

| Component | Responsibility |
| --- | --- |
| `tracker.js` | Process entry point, logging, signal handling, and dependency wiring |
| `src/config.js` | Environment parsing, defaults, URL validation, and fail-fast checks |
| `src/hyperliquid.js` | REST requests, transient retry policy, order valuation, and deduplication keys |
| `src/tracker-service.js` | Startup, reconciliation, WebSocket lifecycle, filtering, delivery ordering, and shutdown |
| `src/telegram.js` | Telegram Bot API delivery, rate-limit handling, retry, and log-only fallback |
| `src/state-store.js` | Corruption recovery, terminal-record pruning, serialized atomic writes |
| `src/formatter.js` | Stable, plain-text notification formatting |

## Alert semantics

An open order qualifies when:

```text
price > 0
remaining size > 0
price × remaining size >= LARGE_ORDER_THRESHOLD
```

`limitPx` is authoritative when present. `allMids[order.coin]` is only a fallback. Coin identifiers are never remapped; for example, a spot identifier such as `@1` remains `@1` and is not treated as the BTC perpetual.

The deduplication key is:

```text
lowercase target address + ":" + Hyperliquid order ID
```

The service marks an `open` alert only after delivery succeeds. A failed delivery remains eligible on the next REST reconciliation. Duplicate WebSocket and REST observations are therefore harmless.

## State lifecycle

The state file has versioned JSON data:

```json
{
  "version": 1,
  "orders": {
    "0xabc…:123": {
      "statuses": { "open": 1760000000000 },
      "updatedAt": 1760000000000,
      "metadata": { "source": "websocket" }
    }
  }
}
```

Writes go to a process-specific temporary file and are renamed over the destination. Writes are serialized to prevent older snapshots from winning a race.

Open-only records are retained so a long-lived order cannot alert again after the terminal retention window. Records with a terminal status become eligible for pruning after `STATE_RETENTION_MS`.

If the state file is invalid, startup moves it to `STATE_FILE.corrupt-<timestamp>` and starts with empty state. Existing qualifying orders may alert again after that recovery because prior delivery history is unavailable.

## Failure behavior

- WebSocket disconnect: reconnect with jittered exponential backoff; reconcile after connection.
- Quiet WebSocket: application `ping` messages keep the connection active.
- REST timeout, HTTP 429, or server error: retry up to three attempts.
- Telegram timeout, HTTP 429, or server error: retry up to three attempts, honoring `retry_after` when supplied.
- Permanent Telegram error: do not record delivery; retry during later reconciliation.
- Startup Telegram notice failure: log a warning and keep tracking.
- Invalid required configuration: exit immediately with a nonzero status.
- `SIGINT` or `SIGTERM`: stop timers, close the socket, and flush state.

## Known limits

- One target address per process.
- Alerts resting open orders, not fills or positions.
- REST reconciliation cannot reconstruct terminal status for an order that opened and closed entirely while the service was offline. It can recover only orders still open.
- `ALERT_ORDER_CLOSURES` depends on receiving a terminal WebSocket update after the open order has been recorded.
- There is no inbound HTTP server or remote health endpoint. Operational health comes from process supervision and logs.
