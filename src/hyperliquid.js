'use strict';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postInfo(
  endpoint,
  payload,
  { fetchImpl = globalThis.fetch, logger = console, timeoutMs = 10_000, attempts = 3, sleepImpl = sleep } = {},
) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        body: JSON.stringify(payload),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'hyperliquid-tracker/2.0',
        },
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(`Hyperliquid API returned HTTP ${response.status}.`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error.name === 'AbortError' ? new Error(`Hyperliquid request timed out after ${timeoutMs}ms.`) : error;
      const retryable = error.name === 'AbortError' || error.retryable || error instanceof TypeError;
      if (!retryable || attempt === attempts) break;
      const delayMs = 500 * 2 ** (attempt - 1);
      logger.warn(`Hyperliquid request failed; retrying in ${delayMs}ms (attempt ${attempt}/${attempts}).`);
      await sleepImpl(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function fetchOpenOrders(config, options = {}) {
  const result = await postInfo(
    config.infoEndpoint,
    { type: 'openOrders', user: config.targetAddress },
    { timeoutMs: config.requestTimeoutMs, ...options },
  );
  if (!Array.isArray(result)) throw new Error('Hyperliquid returned an invalid openOrders response.');
  return result;
}

async function fetchAllMids(config, options = {}) {
  const result = await postInfo(
    config.infoEndpoint,
    { type: 'allMids' },
    { timeoutMs: config.requestTimeoutMs, ...options },
  );
  if (!result || Array.isArray(result) || typeof result !== 'object') {
    throw new Error('Hyperliquid returned an invalid allMids response.');
  }
  return result;
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function calculateOrderMetrics(order, mids = {}, { preferOriginalSize = false } = {}) {
  if (!order || typeof order !== 'object') return null;
  const price = positiveNumber(order.limitPx) || positiveNumber(mids[order.coin]);
  const preferredSize = preferOriginalSize ? order.origSz : order.sz;
  const size = positiveNumber(preferredSize) || positiveNumber(order.origSz);
  if (!price || !size) return null;
  return { notional: price * size, price, size };
}

function createOrderKey(address, oid) {
  if (oid === undefined || oid === null || oid === '') throw new Error('Order update is missing oid.');
  return `${address.toLowerCase()}:${oid}`;
}

module.exports = {
  calculateOrderMetrics,
  createOrderKey,
  fetchAllMids,
  fetchOpenOrders,
  postInfo,
};
