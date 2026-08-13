# Operations runbook

## 1. Prepare credentials

The tracker needs only a public wallet address. Telegram delivery additionally needs a bot token and destination chat ID.

1. Create or rotate a bot through Telegram's verified `@BotFather` account.
2. Send the new bot one message from the destination chat.
3. Put the token in a temporary environment variable, not in the command text:

   ```powershell
   $env:TELEGRAM_BOT_TOKEN = Read-Host 'Telegram token'
   Invoke-RestMethod "https://api.telegram.org/bot$env:TELEGRAM_BOT_TOKEN/getUpdates"
   ```

4. Read `result[].message.chat.id` from the response.
5. Store both values in the deployment's secret store or its untracked `.env` file.
6. Clear the temporary shell value:

   ```powershell
   Remove-Item Env:TELEGRAM_BOT_TOKEN
   ```

Never use a wallet private key. A Telegram token that has appeared in Git, an issue, logs, chat, or a screenshot must be revoked rather than reused.

## 2. Configure

Create `.env` from the example and restrict access to the file according to the host operating system.

```powershell
Copy-Item .env.example .env
```

Required production values:

```dotenv
TARGET_ADDRESS=0x1111111111111111111111111111111111111111
LARGE_ORDER_THRESHOLD=50000
TELEGRAM_BOT_TOKEN=<new token>
TELEGRAM_CHAT_ID=<destination id>
```

Start in log-only mode by leaving both Telegram values blank. Never set only one of them; startup validation rejects an incomplete pair.

`TARGET_ADDRESS` must be the actual master or sub-account whose orders should be queried. An agent/API-wallet address normally returns empty account data.

## 3. Validate before deployment

```bash
npm ci
npm run check
npm run audit
```

Start the service interactively once:

```bash
npm start
```

Confirm all three conditions:

- The process remains running.
- Logs contain `Connected to Hyperliquid orderUpdates WebSocket`.
- There is no repeated REST, WebSocket, configuration, or Telegram error.

Zero open orders is a valid result. Use `DEBUG_MODE=true` temporarily to see reconciliation counts.

## 4. Deploy with Docker Compose

The included Compose service loads `.env`, restarts unless stopped, and stores `seenOrders.json` in the `tracker-state` named volume.

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 tracker
```

Follow logs:

```bash
docker compose logs -f tracker
```

Stop without deleting state:

```bash
docker compose down
```

Do not use `docker compose down --volumes` unless intentionally discarding deduplication history. Losing state can repeat alerts for orders that are still open.

## 5. Deploy with PM2

From a checkout that contains the private `.env` file:

```bash
pm2 start npm --name hyperliquid-tracker -- start
pm2 save
pm2 status hyperliquid-tracker
pm2 logs hyperliquid-tracker
```

Configure the documented PM2 startup integration for the host platform so the saved process returns after reboot.

## 6. Upgrade

Before upgrading, confirm the target repository and branch and back up runtime state.

Docker Compose:

```bash
git pull --ff-only
npm ci
npm run check
docker compose up -d --build
docker compose logs --tail=100 tracker
```

PM2:

```bash
git pull --ff-only
npm ci
npm run check
pm2 restart hyperliquid-tracker --update-env
pm2 logs hyperliquid-tracker --lines 100
```

## 7. Back up and restore state

For a native or PM2 deployment, stop the service and copy `STATE_FILE`. Restore it to the same path before restarting.

For Docker Compose, inspect the named volume:

```bash
docker volume inspect hyperliquidtracker_tracker-state
```

The exact Compose project prefix may differ. Back up the volume using the host's standard Docker volume procedure. Keep the backup private because it contains the public target address, order IDs, and notification metadata.

## 8. Roll back

1. Stop the process.
2. Keep the current `.env` and state file/volume.
3. Check out the last verified commit or image.
4. Reinstall exactly from its lockfile with `npm ci` or rebuild the container.
5. Start the process and verify connection/reconciliation logs.

Do not restore the old committed `keys.txt`, old `node_modules`, or a revoked Telegram token during rollback.

## 9. Monitoring signals

Healthy signals:

```text
[info] Tracking 0x…
[info] Connected to Hyperliquid orderUpdates WebSocket.
[debug] REST reconciliation returned N open order(s).
```

Actionable signals:

| Log | Meaning | Response |
| --- | --- | --- |
| `[fatal] TARGET_ADDRESS…` | Missing or invalid required configuration | Correct `.env`; restart |
| `must either both be set or both be blank` | Incomplete Telegram credential pair | Set or clear both values |
| `WebSocket closed… reconnecting` once | Normal periodic disconnect | No action if connection returns |
| Repeated WebSocket close/error | Network, DNS, proxy, or endpoint problem | Test host connectivity and endpoint override |
| Repeated REST timeout/429/5xx | API/network pressure | Restore connectivity; consider a longer reconciliation interval |
| Telegram HTTP 400/401/403 | Invalid/revoked token, bad chat ID, blocked bot | Rotate/correct credentials and restart |
| `Invalid state file moved…` | Corrupt state recovered | Preserve backup; expect possible repeat alerts |

## 10. Troubleshooting

### No alerts

- Confirm the service is watching the correct master or sub-account address.
- Confirm the wallet has a resting open order; completed fills do not qualify.
- Confirm `limit price × remaining size` reaches the threshold.
- Enable `DEBUG_MODE=true` and check the reconciliation count.
- Use log-only mode to separate Hyperliquid detection from Telegram delivery.

### Duplicate alert after a restart

- Confirm `STATE_FILE` points to persistent storage.
- For Docker, confirm the named volume is mounted at `/data`.
- Look for a `.corrupt-<timestamp>` state backup.
- Confirm the state volume/file was not removed during deployment.

### Telegram delivery fails

- Revoke and replace any token that was ever public.
- Ensure the user or group has started/added the bot and has not blocked it.
- Re-run `getUpdates` privately and confirm the destination chat ID.
- Never paste the token into an issue or application log.

### Process exits immediately

- Use Node.js 22 or newer.
- Run `npm ci` to install dependencies from the lockfile.
- Read the `[fatal]` configuration message.
- Do not reuse a globally broken npm wrapper; invoke the npm installation associated with the active Node.js runtime.
