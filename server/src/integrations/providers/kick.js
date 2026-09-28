// Kick provider — official Kick Dev Public API (https://docs.kick.com).
//   • App Access Token: POST https://id.kick.com/oauth/token (client_credentials)
//   • GET https://api.kick.com/public/v1/channels?slug=a&slug=b  (up to 50 slugs per call)
//     → data[].stream { is_live, viewer_count, thumbnail, start_time }, stream_title, broadcaster_user_id
// Kick's public API has no endpoint for past broadcasts/VODs, so Kick "videos" stay admin-managed.
// SECURITY: the channel payload can include the stream key/ingest URL — we only ever copy the
// specific public fields below and never log or store the raw response.
import { fetchJson, chunk, ProviderError } from '../http.js';

const API = 'https://api.kick.com/public/v1';
const TOKEN_URL = 'https://id.kick.com/oauth/token';
const SLUG_RE = /^[a-z0-9_-]{1,25}$/;

export function parseKickSlug(account) {
  try {
    const u = new URL(account.url);
    const seg = u.pathname.split('/').filter(Boolean)[0];
    if (seg && SLUG_RE.test(seg.toLowerCase())) return seg.toLowerCase();
  } catch { /* use handle */ }
  const h = String(account.handle ?? '').trim().replace(/^@/, '').toLowerCase();
  return SLUG_RE.test(h) ? h : null;
}

const validDate = (s) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) && d.getUTCFullYear() > 2000 ? d : null;
};

export function createKickProvider({ clientId, clientSecret, fetchImpl = fetch }) {
  let token = null;
  let tokenExpires = 0;

  async function appToken(force = false) {
    if (!force && token && Date.now() < tokenExpires) return token;
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
    const r = await fetchJson('kick', TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      fetchImpl,
    });
    if (!r.access_token) throw new ProviderError('kick', 'token response had no access_token');
    token = r.access_token;
    tokenExpires = Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60_000;
    return token;
  }

  async function getChannels(slugs) {
    const url = new URL(`${API}/channels`);
    for (const s of slugs) url.searchParams.append('slug', s);
    const call = async (t) => fetchJson('kick', url, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' }, fetchImpl });
    try {
      return await call(await appToken());
    } catch (err) {
      if (err.status === 401) return call(await appToken(true)); // token revoked/expired early
      throw err;
    }
  }

  /** Subscribe to livestream start/stop webhooks for these broadcasters (webhook URL is set in your Kick app settings). */
  async function subscribeLivestreamEvents(broadcasterIds) {
    const t = await appToken();
    const out = [];
    for (const id of broadcasterIds) {
      try {
        await fetchJson('kick', `${API}/events/subscriptions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ broadcaster_user_id: Number(id), method: 'webhook', events: [{ name: 'livestream.status.updated', version: 1 }] }),
          fetchImpl,
          retries: 1,
        });
        out.push({ id, ok: true });
      } catch (err) {
        out.push({ id, ok: false, error: err.message });
      }
    }
    return out;
  }

  async function getPublicKey() {
    const r = await fetchJson('kick', `${API}/public-key`, { fetchImpl, retries: 1 });
    return r?.data?.public_key ?? null;
  }

  return {
    subscribeLivestreamEvents,
    getPublicKey,
    platform: 'KICK',
    label: 'Kick',
    configured: Boolean(clientId && clientSecret),

    async sync(accounts) {
      const result = { accounts: [], videos: [], live: [], checkedAccountIds: [] };
      const bySlug = new Map();
      for (const acc of accounts) {
        const slug = parseKickSlug(acc);
        if (!slug) { result.accounts.push({ id: acc.id, error: 'Could not read a Kick channel slug from the handle/URL' }); continue; }
        bySlug.set(slug, [...(bySlug.get(slug) ?? []), acc]);
      }

      for (const slugs of chunk([...bySlug.keys()], 50)) {
        const r = await getChannels(slugs);
        const found = new Map((r.data ?? []).map((c) => [String(c.slug).toLowerCase(), c]));
        for (const slug of slugs) {
          const ch = found.get(slug);
          for (const acc of bySlug.get(slug)) {
            if (!ch) { result.accounts.push({ id: acc.id, error: `No Kick channel found for "${slug}"` }); continue; }
            result.accounts.push({ id: acc.id, externalId: String(ch.broadcaster_user_id) });
            result.checkedAccountIds.push(acc.id);
            const s = ch.stream ?? {};
            if (s.is_live) {
              const knownStart = validDate(s.start_time);
              const startedAt = knownStart ?? new Date();
              result.live.push({
                accountId: acc.id,
                memberId: acc.memberId,
                // The public API exposes no livestream id here; broadcaster + start time is unique per broadcast.
                externalId: `${ch.broadcaster_user_id}:${startedAt.getTime()}`,
                stableId: Boolean(knownStart), // engine reuses the ongoing row when the start time is unknown
                title: String(ch.stream_title || `${slug} is live on Kick`).slice(0, 200),
                url: `https://kick.com/${slug}`,
                thumbnailUrl: typeof s.thumbnail === 'string' && s.thumbnail.startsWith('https://') ? s.thumbnail : null,
                viewerCount: Number.isFinite(s.viewer_count) ? s.viewer_count : null,
                startedAt,
              });
            }
          }
        }
      }
      return result;
    },
  };
}
