'use strict';

const { buildOrderMessage } = require('./formatter');
const {
  calculateOrderMetrics,
  createOrderKey,
  fetchAllMids,
  fetchOpenOrders,
} = require('./hyperliquid');

class TrackerService {
  constructor({
    config,
    fetchImpl = globalThis.fetch,
    logger = console,
    notifier,
    random = Math.random,
    stateStore,
    WebSocket,
  }) {
    if (!config || !notifier || !stateStore || !WebSocket) {
      throw new Error('TrackerService requires config, notifier, stateStore, and WebSocket.');
    }
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.notifier = notifier;
    this.random = random;
    this.stateStore = stateStore;
    this.WebSocket = WebSocket;
    this.heartbeatTimer = null;
    this.lastMids = {};
    this.processing = new Set();
    this.reconcileRunning = false;
    this.reconcileTimer = null;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.running = false;
    this.socket = null;
    this.stopping = false;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    await this.stateStore.load();

    try {
      await this.reconcile({ initial: true });
    } catch (error) {
      this.logger.warn(`Initial REST reconciliation failed: ${error.message}`);
    }

    this.connectWebSocket();
    this.reconcileTimer = setInterval(() => {
      void this.reconcile().catch((error) => this.logger.warn(`REST reconciliation failed: ${error.message}`));
    }, this.config.reconcileIntervalMs);

    if (this.config.sendStartupMessage) {
      try {
        await this.notifier.send(
          `Hyperliquid tracker started for ${this.config.targetAddress}. Threshold: $${this.config.largeOrderThreshold.toLocaleString('en-US')}.`,
        );
      } catch (error) {
        this.logger.warn(`Startup notification failed; tracking remains active: ${error.message}`);
      }
    }
  }

  apiOptions() {
    return { fetchImpl: this.fetchImpl, logger: this.logger };
  }

  async reconcile({ initial = false } = {}) {
    if (this.reconcileRunning || this.stopping) return;
    this.reconcileRunning = true;
    try {
      const ordersPromise = fetchOpenOrders(this.config, this.apiOptions());
      const midsPromise = fetchAllMids(this.config, this.apiOptions()).catch((error) => {
        this.logger.warn(`Could not refresh market prices: ${error.message}`);
        return this.lastMids;
      });
      const [orders, mids] = await Promise.all([ordersPromise, midsPromise]);
      this.lastMids = mids;
      this.logger.debug(`REST reconciliation returned ${orders.length} open order(s).`);

      for (const order of orders) {
        await this.handleOpenOrder(order, { initial, source: 'reconcile' });
      }

      const removed = this.stateStore.prune(this.config.stateRetentionMs);
      if (removed) {
        this.logger.debug(`Pruned ${removed} expired state record(s).`);
        await this.stateStore.save();
      }
    } finally {
      this.reconcileRunning = false;
    }
  }

  async handleOpenOrder(order, { initial = false, source = 'websocket' } = {}) {
    const metrics = calculateOrderMetrics(order, this.lastMids);
    if (!metrics) {
      this.logger.warn(`Skipping order ${order?.oid ?? 'without oid'}: price or size is invalid.`);
      return;
    }
    if (metrics.notional < this.config.largeOrderThreshold) return;

    const orderKey = createOrderKey(this.config.targetAddress, order.oid);
    if (this.processing.has(orderKey) || this.stateStore.has(orderKey, 'open')) return;
    this.processing.add(orderKey);
    try {
      if (initial && !this.config.alertExistingOnStartup) {
        this.stateStore.record(orderKey, 'open', { metrics, seeded: true, source });
        await this.stateStore.save();
        return;
      }

      const message = buildOrderMessage({
        address: this.config.targetAddress,
        metrics,
        order,
        status: 'open',
      });
      await this.notifier.send(message);
      this.stateStore.record(orderKey, 'open', { metrics, source });
      await this.stateStore.save();
      this.logger.info(`Recorded large ${order.coin} order ${order.oid} (${source}).`);
    } finally {
      this.processing.delete(orderKey);
    }
  }

  async handleOrderUpdate(update) {
    const order = update?.order;
    const status = String(update?.status || '').toLowerCase();
    if (!order || !status) {
      this.logger.warn('Ignoring malformed orderUpdates payload.');
      return;
    }
    if (status === 'open') {
      await this.handleOpenOrder(order, { source: 'websocket' });
      return;
    }

    const orderKey = createOrderKey(this.config.targetAddress, order.oid);
    const existing = this.stateStore.get(orderKey);
    if (!existing || this.stateStore.has(orderKey, status)) return;

    if (this.config.alertOrderClosures && this.stateStore.has(orderKey, 'open')) {
      const metrics =
        calculateOrderMetrics(order, this.lastMids, { preferOriginalSize: true }) || existing.metadata?.metrics;
      if (metrics) {
        await this.notifier.send(
          buildOrderMessage({ address: this.config.targetAddress, metrics, order, status }),
        );
      }
    }
    this.stateStore.record(orderKey, status, { source: 'websocket' });
    await this.stateStore.save();
  }

  connectWebSocket() {
    if (this.stopping) return;
    try {
      const socket = new this.WebSocket(this.config.wsEndpoint);
      this.socket = socket;

      socket.on('open', () => {
        this.reconnectAttempt = 0;
        socket.send(
          JSON.stringify({
            method: 'subscribe',
            subscription: { type: 'orderUpdates', user: this.config.targetAddress },
          }),
        );
        this.startHeartbeat(socket);
        this.logger.info('Connected to Hyperliquid orderUpdates WebSocket.');
        void this.reconcile().catch((error) => this.logger.warn(`Reconnect reconciliation failed: ${error.message}`));
      });

      socket.on('message', (raw) => {
        void this.handleSocketMessage(raw).catch((error) =>
          this.logger.warn(`Could not process WebSocket message: ${error.message}`),
        );
      });

      socket.on('error', (error) => {
        this.logger.warn(`Hyperliquid WebSocket error: ${error.message}`);
      });

      socket.on('close', (code) => {
        this.stopHeartbeat();
        if (this.socket === socket) this.socket = null;
        if (!this.stopping) {
          this.logger.warn(`Hyperliquid WebSocket closed with code ${code}; reconnecting.`);
          this.scheduleReconnect();
        }
      });
    } catch (error) {
      this.logger.warn(`Could not open Hyperliquid WebSocket: ${error.message}`);
      this.scheduleReconnect();
    }
  }

  async handleSocketMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      throw new Error('Hyperliquid sent invalid JSON.');
    }

    if (message.channel === 'subscriptionResponse' || message.channel === 'pong') {
      this.logger.debug(`WebSocket channel: ${message.channel}.`);
      return;
    }
    if (message.channel !== 'orderUpdates') return;

    const data = message.data;
    const updates = Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : [data];
    for (const update of updates) {
      await this.handleOrderUpdate(update);
    }
  }

  startHeartbeat(socket) {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ method: 'ping' }));
      }
    }, this.config.heartbeatIntervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  scheduleReconnect() {
    if (this.stopping || this.reconnectTimer) return;
    const exponential = Math.min(
      1_000 * 2 ** this.reconnectAttempt,
      this.config.maxReconnectDelayMs,
    );
    const delayMs = Math.round(exponential * (0.8 + this.random() * 0.4));
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, delayMs);
  }

  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    this.running = false;
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconcileTimer = null;
    this.reconnectTimer = null;
    this.stopHeartbeat();

    const socket = this.socket;
    this.socket = null;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) {
      try {
        socket.close(1000, 'shutdown');
      } catch (error) {
        this.logger.warn(`Could not close WebSocket cleanly: ${error.message}`);
      }
    }
    await this.stateStore.save();
  }
}

module.exports = { TrackerService };
