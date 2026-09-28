// Small fetch client: same-origin cookies, CSRF header on unsafe methods, typed errors.
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  /** Map field-level validation details to { field: message }. */
  get fieldErrors() {
    return Object.fromEntries((this.details ?? []).map((d) => [d.field, d.message]));
  }
}

let csrfToken = null;
async function getCsrf(force = false) {
  if (csrfToken && !force) return csrfToken;
  const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  csrfToken = (await res.json()).data.csrfToken;
  return csrfToken;
}

async function request(method, url, body, { retry = true, keepalive = false } = {}) {
  const unsafe = method !== 'GET';
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = { Accept: 'application/json' };
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'; // browser sets multipart boundary itself
  if (unsafe) headers['X-CSRF-Token'] = await getCsrf();

  let res;
  try {
    res = await fetch(`/api${url}`, { method, headers, credentials: 'same-origin', keepalive, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach Dragonz Central. Check your connection.');
  }

  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // CSRF token may have rotated (e.g. cookie cleared) — refresh once and retry.
    if (unsafe && res.status === 403 && retry && /security token/i.test(json?.error?.message ?? '')) {
      await getCsrf(true);
      return request(method, url, body, { retry: false, keepalive });
    }
    // Session gone (signed out elsewhere / expired): tell the app so it drops the cached user.
    if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('dz:unauthorized'));
    const e = json.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'Something went wrong', e.details);
  }
  return json;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url, body) => request('DELETE', url, body),
  /** multipart upload (FormData) */
  upload: (url, formData) => request('POST', url, formData),
  /** fire-and-forget beacon; never throws */
  beacon: (url, body) => request('POST', url, body, { keepalive: true }).catch(() => {}),
};

export const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const str = s.toString();
  return str ? `?${str}` : '';
};
