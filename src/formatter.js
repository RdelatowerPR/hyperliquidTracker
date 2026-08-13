'use strict';

function formatUsd(value) {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: value >= 1_000 ? 0 : 2,
    style: 'currency',
  }).format(value);
}

function formatSize(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value);
}

function buildOrderMessage({ address, metrics, order, status = 'open' }) {
  const isOpen = status === 'open';
  const side = order.side === 'B' ? 'BUY' : 'SELL';
  const title = isOpen ? 'LARGE OPEN ORDER' : `ORDER ${status.toUpperCase()}`;
  return [
    `🚨 ${title}`,
    '',
    `${order.coin || 'UNKNOWN'} · ${side}`,
    `Size: ${formatSize(metrics.size)}`,
    `Price: ${formatUsd(metrics.price)}`,
    `Notional: ${formatUsd(metrics.notional)}`,
    `Order ID: ${order.oid}`,
    '',
    `https://app.hyperliquid.xyz/explorer/address/${address}`,
  ].join('\n');
}

module.exports = { buildOrderMessage, formatSize, formatUsd };
