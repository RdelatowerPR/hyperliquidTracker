# Changelog

All notable changes are documented here.

## 2.0.0 - 2026-08-13

### Security

- Removed the committed Telegram credential file and runtime state from the current tree.
- Removed committed `node_modules` and replaced the vulnerable HTTP/Telegram dependency chain.
- Added secret-safe configuration examples, a security policy, Dependabot configuration, and CI dependency auditing.

### Changed

- Replaced polling-only detection with Hyperliquid `orderUpdates` plus periodic REST recovery.
- Replaced stale hard-coded prices and incorrect `@…` mappings with exact order prices and live `allMids` fallback.
- Added validated environment configuration, retry/time-out behavior, heartbeat and reconnect handling, stable order-ID deduplication, and atomic state persistence.
- Added Docker Compose deployment with persistent state and graceful process shutdown.

### Quality

- Added offline unit coverage for configuration, pricing, retries, state corruption/recovery, Telegram delivery, deduplication, and failure recovery.
- Added architecture, operations, contributing, security, and deployment documentation.

## 1.0.0 - 2025-03-12

- Initial polling-based Hyperliquid open-order tracker with Telegram alerts.
