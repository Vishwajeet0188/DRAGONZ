// Small HTTP helper for third-party APIs: timeouts, bounded retries with backoff, typed errors.
// Never logs URLs with query strings (YouTube keys live there) or auth headers.

export class ProviderError extends Error {
  constructor(provider, message, { status, retryable = false, code } = {}) {
    super(`${provider}: ${message}`);
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} provider  label for errors
 * @param {string|URL} url
 * @param {RequestInit & {retries?: number, timeoutMs?: number, fetchImpl?: typeof fetch}} opts
 */
export async function fetchJson(provider, url, opts = {}) {
  const { retries = 2, timeoutMs = 10_000, fetchImpl = fetch, ...init } = opts;
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (attempt < retries) { await sleep(500 * 2 ** attempt++); continue; }
      throw new ProviderError(provider, `network error (${err.name})`, { retryable: true });
    }
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 200) }; }

    if (res.ok) return body;

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after')) * 1000 || 750 * 2 ** attempt;
      attempt++;
      await sleep(Math.min(retryAfter, 10_000));
      continue;
    }
    // Surface the provider's own reason (e.g. YouTube "quotaExceeded"), never the request URL.
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? body?.message ?? body?.error ?? res.statusText;
    throw new ProviderError(provider, `HTTP ${res.status} ${typeof reason === 'string' ? reason : ''}`.trim(), { status: res.status, retryable, code: reason });
  }
}

export const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
