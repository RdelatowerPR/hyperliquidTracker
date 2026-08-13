'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function emptyState() {
  return { orders: {}, version: 1 };
}

class StateStore {
  constructor(filePath, { logger = console, now = () => Date.now() } = {}) {
    this.filePath = filePath;
    this.logger = logger;
    this.now = now;
    this.state = emptyState();
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || !parsed.orders || typeof parsed.orders !== 'object') {
        throw new Error('Unsupported state format.');
      }
      this.state = parsed;
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.state = emptyState();
        return;
      }
      const backup = `${this.filePath}.corrupt-${this.now()}`;
      try {
        await fs.rename(this.filePath, backup);
        this.logger.warn(`Invalid state file moved to ${path.basename(backup)}.`);
      } catch (renameError) {
        this.logger.warn(`Invalid state file could not be backed up: ${renameError.message}`);
      }
      this.state = emptyState();
    }
  }

  get(orderKey) {
    return this.state.orders[orderKey];
  }

  has(orderKey, status) {
    return Boolean(this.state.orders[orderKey]?.statuses?.[status]);
  }

  record(orderKey, status, metadata = {}) {
    const now = this.now();
    const existing = this.state.orders[orderKey] || { statuses: {} };
    existing.statuses ||= {};
    existing.statuses[status] = now;
    existing.updatedAt = now;
    existing.metadata = { ...(existing.metadata || {}), ...metadata };
    this.state.orders[orderKey] = existing;
  }

  prune(retentionMs) {
    const cutoff = this.now() - retentionMs;
    let removed = 0;
    for (const [key, entry] of Object.entries(this.state.orders)) {
      const statuses = Object.keys(entry.statuses || {});
      const hasTerminalStatus = statuses.some((status) => status !== 'open');
      // Keep an order that has only ever been observed as open. This avoids
      // re-alerting a long-lived order after the retention window expires.
      if (statuses.includes('open') && !hasTerminalStatus) continue;
      if (!entry.updatedAt || entry.updatedAt < cutoff) {
        delete this.state.orders[key];
        removed += 1;
      }
    }
    return removed;
  }

  async save() {
    const snapshot = `${JSON.stringify(this.state, null, 2)}\n`;
    this.writeQueue = this.writeQueue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporary, snapshot, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, this.filePath);
    });
    return this.writeQueue;
  }
}

module.exports = { StateStore, emptyState };
