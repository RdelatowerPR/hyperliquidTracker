'use strict';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TelegramNotifier {
  constructor({
    botToken = '',
    chatId = '',
    fetchImpl = globalThis.fetch,
    logger = console,
    sleepImpl = sleep,
    timeoutMs = 10_000,
  } = {}) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.sleepImpl = sleepImpl;
    this.timeoutMs = timeoutMs;
  }

  get enabled() {
    return Boolean(this.botToken && this.chatId);
  }

  async send(text) {
    if (!this.enabled) {
      this.logger.info(`[alert:log-only]\n${text}`);
      return { delivery: 'log' };
    }

    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(
          `https://api.telegram.org/bot${this.botToken}/sendMessage`,
          {
            body: JSON.stringify({
              chat_id: this.chatId,
              disable_web_page_preview: true,
              text,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            signal: controller.signal,
          },
        );
        const body = await response.json().catch(() => ({}));
        if (response.ok && body.ok) return { delivery: 'telegram', messageId: body.result?.message_id };

        const error = new Error(
          `Telegram API returned HTTP ${response.status}${body.description ? `: ${body.description}` : '.'}`,
        );
        error.retryable = response.status === 429 || response.status >= 500;
        error.retryAfterMs = Number(body.parameters?.retry_after || 0) * 1_000;
        throw error;
      } catch (error) {
        lastError = error.name === 'AbortError' ? new Error(`Telegram request timed out after ${this.timeoutMs}ms.`) : error;
        const retryable = error.name === 'AbortError' || error.retryable || error instanceof TypeError;
        if (!retryable || attempt === 3) break;
        const delayMs = error.retryAfterMs || 500 * 2 ** (attempt - 1);
        this.logger.warn(`Telegram delivery failed; retrying in ${delayMs}ms (attempt ${attempt}/3).`);
        await this.sleepImpl(delayMs);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }
}

module.exports = { TelegramNotifier };
