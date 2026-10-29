// Kick provider — official Public API for channel/live data, plus Kick's unofficial
// website API for past VODs. The website endpoint is not officially supported and
// may change or be blocked by Kick at any time.
import { fetchJson, chunk, ProviderError } from '../http.js';

const API = 'https://api.kick.com/public/v1';
const TOKEN_URL = 'https://id.kick.com/oauth/token';
const WEB_API = 'https://kick.com/api/v2';
const SLUG_RE = /^[a-z0-9_-]{1,25}$/;
const MAX_VODS_PER_CHANNEL = 24;

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

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.videos)) return payload.videos;
  if (Array.isArray(payload?.data?.videos)) return payload.data.videos;
  return [];
}

function normalizeVod(v, slug) {
  const id = v?.uuid ?? v?.id ?? v?.video_id ?? v?.livestream_id;
  if (id == null) return null;
  const title = String(v?.session_title ?? v?.title ?? v?.livestream?.session_title ?? `${slug} on Kick`).trim().slice(0, 200);
  const rawUrl = v?.video_url ?? v?.url ?? v?.canonical_url;
  const url = typeof rawUrl === 'string' && rawUrl.startsWith('https://')
    ? rawUrl
    : `https://kick.com/${slug}/videos/${encodeURIComponent(String(v?.uuid ?? id))}`;
  const thumbnail = v?.thumbnail?.url ?? v?.thumbnail_url ?? v?.thumbnail ?? v?.livestream?.thumbnail;
  const createdAt = v?.created_at ?? v?.start_time ?? v?.started_at ?? v?.livestream?.created_at;
  const durationRaw = v?.duration ?? v?.duration_seconds ?? v?.livestream?.duration;
  const durationSec = Number.isFinite(Number(durationRaw)) && Number(durationRaw) >= 0 ? Math.round(Number(durationRaw)) : null;
  const viewsRaw = v?.views ?? v?.view_count ?? v?.viewer_count;
  const viewCount = Number.isFinite(Number(viewsRaw)) && viewsRaw != null ? Math.max(0, Math.round(Number(viewsRaw))) : null;
  return {
    externalId: String(id),
    title,
    url,
    thumbnailUrl: typeof thumbnail === 'string' && thumbnail.startsWith('https://') ? thumbnail : null,
    publishedAt: validDate(createdAt),
    durationSec,
    viewCount,
  };
}

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
      if (err.status === 401) return call(await appToken(true));
      throw err;
    }
  }

  // Unofficial Kick website endpoint. Kick may change its response or block requests.
  async function getPastVideos(slug) {
    const url = `${WEB_API}/channels/${encodeURIComponent(slug)}/videos`;
    const payload = await fetchJson('kick', url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Referer: `https://kick.com/${slug}`,
      },
      fetchImpl,
      retries: 1,
      timeoutMs: 12_000,
    });
    return asArray(payload).slice(0, MAX_VODS_PER_CHANNEL)
      .map((v) => normalizeVod(v, slug))
      .filter(Boolean);
  }

  /** Subscribe to livestream start/stop webhooks for these broadcasters. */
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
                externalId: `${ch.broadcaster_user_id}:${startedAt.getTime()}`,
                stableId: Boolean(knownStart),
                title: String(ch.stream_title || `${slug} is live on Kick`).slice(0, 200),
                url: `https://kick.com/${slug}`,
                thumbnailUrl: typeof s.thumbnail === 'string' && s.thumbnail.startsWith('https://') ? s.thumbnail : null,
                viewerCount: Number.isFinite(s.viewer_count) ? s.viewer_count : null,
                startedAt,
              });
            }

            // Fetch past broadcasts independently; a VOD failure must not prevent live sync.
            try {
              const vods = await getPastVideos(slug);
              for (const vod of vods) {
                result.videos.push({
                  accountId: acc.id,
                  memberId: acc.memberId,
                  externalId: vod.externalId,
                  title: vod.title,
                  url: vod.url,
                  thumbnailUrl: vod.thumbnailUrl,
                  publishedAt: vod.publishedAt,
                  durationSec: vod.durationSec,
                  viewCount: vod.viewCount,
                });
              }
            } catch (err) {
              // Keep the account sync usable even if Kick's unofficial VOD endpoint fails.
              result.accounts.push({ id: acc.id, warning: `Past Kick videos could not be fetched: ${err.message}` });
            }
          }
        }
      }
      return result;
    },
  };
}
