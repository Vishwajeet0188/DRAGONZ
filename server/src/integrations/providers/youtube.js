// YouTube provider — official YouTube Data API v3, API key only (public data).
//
// Quota-aware design (default 10,000 units/day; each call below costs 1 unit):
//   • channels.list?forHandle   — once per channel, only until its channel ID is stored
//   • channels.list?id=…        — 1 unit per 50 channels per run (subscribers, uploads playlist)
//   • playlistItems.list        — 1 unit per channel per run (latest uploads, incl. live broadcasts)
//   • videos.list?id=…          — 1 unit per 50 videos per run (details + live status)
// search.list is deliberately NOT used: it has its own tiny daily allowance.
import { fetchJson, chunk, ProviderError } from '../http.js';

const API = 'https://www.googleapis.com/youtube/v3';
const CHANNEL_ID_RE = /^UC[\w-]{22}$/;

/** Accepts "@handle", "handle", or a youtube.com URL; returns {channelId?, handle?}. */
export function parseYouTubeRef(account) {
  if (account.externalId && CHANNEL_ID_RE.test(account.externalId)) return { channelId: account.externalId };
  try {
    const u = new URL(account.url);
    const byId = u.pathname.match(/\/channel\/(UC[\w-]{22})/);
    if (byId) return { channelId: byId[1] };
    const byHandle = u.pathname.match(/\/@([\w.\-]{3,30})/);
    if (byHandle) return { handle: byHandle[1] };
  } catch { /* fall through to handle */ }
  const h = String(account.handle ?? '').trim().replace(/^@/, '');
  return /^[\w.\-]{3,30}$/.test(h) ? { handle: h } : {};
}

/** ISO-8601 duration (PT1H2M3S) → seconds. */
export function isoDurationToSeconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return null;
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s || null;
}

const bestThumb = (t = {}) => (t.maxres ?? t.standard ?? t.high ?? t.medium ?? t.default)?.url ?? null;
const num = (v) => (v == null || v === '' ? null : Number(v));

export function createYouTubeProvider({ apiKey, fetchImpl = fetch, videosPerChannel = 6 }) {
  let unitsUsed = 0;
  const get = (path, params) => {
    const url = new URL(`${API}/${path}`);
    for (const [k, v] of Object.entries({ ...params, key: apiKey })) url.searchParams.set(k, v);
    unitsUsed += 1;
    return fetchJson('youtube', url, { fetchImpl });
  };

  return {
    platform: 'YOUTUBE',
    label: 'YouTube',
    configured: Boolean(apiKey),

    /** @param {Array<{id, memberId, handle, url, externalId}>} accounts */
    async sync(accounts) {
      unitsUsed = 0;
      const result = { accounts: [], videos: [], live: [], checkedAccountIds: [], unitsUsed: 0 };
      if (!accounts.length) return result;

      // 1) Resolve channel IDs (cached in DB after the first successful run).
      const resolved = [];
      for (const acc of accounts) {
        const ref = parseYouTubeRef(acc);
        if (ref.channelId) { resolved.push({ acc, channelId: ref.channelId }); continue; }
        if (!ref.handle) { result.accounts.push({ id: acc.id, error: 'Could not read a channel handle or ID from the handle/URL' }); continue; }
        try {
          const r = await get('channels', { part: 'id', forHandle: `@${ref.handle}` });
          const channelId = r.items?.[0]?.id;
          if (channelId) resolved.push({ acc, channelId });
          else result.accounts.push({ id: acc.id, error: `No YouTube channel found for @${ref.handle}` });
        } catch (err) {
          if (err.status === 403) throw err; // bad key / quota — abort the whole provider run
          result.accounts.push({ id: acc.id, error: err.message });
        }
      }

      // 2) Channel details in batches of 50: subscribers + uploads playlist.
      const channelInfo = new Map();
      for (const ids of chunk(resolved.map((r) => r.channelId), 50)) {
        const r = await get('channels', { part: 'snippet,statistics,contentDetails', id: ids.join(','), maxResults: 50 });
        for (const c of r.items ?? []) channelInfo.set(c.id, c);
      }

      // 3) Latest uploads per channel (live broadcasts appear here while live).
      const videoOwner = new Map(); // videoId → account
      for (const { acc, channelId } of resolved) {
        const info = channelInfo.get(channelId);
        if (!info) { result.accounts.push({ id: acc.id, error: 'Channel not found (deleted or private?)' }); continue; }
        const stats = info.statistics ?? {};
        result.accounts.push({
          id: acc.id,
          externalId: channelId,
          followerCount: stats.hiddenSubscriberCount ? undefined : num(stats.subscriberCount),
        });
        const uploads = info.contentDetails?.relatedPlaylists?.uploads;
        if (!uploads) { result.checkedAccountIds.push(acc.id); continue; }
        try {
          const r = await get('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: videosPerChannel });
          for (const it of r.items ?? []) videoOwner.set(it.contentDetails.videoId, acc);
          result.checkedAccountIds.push(acc.id);
        } catch (err) {
          if (err.status === 404) { result.checkedAccountIds.push(acc.id); continue; } // channel has no uploads yet
          if (err.status === 403) throw err;
          result.accounts.push({ id: acc.id, error: err.message });
        }
      }

      // 4) Video details + live status in batches of 50.
      for (const ids of chunk([...videoOwner.keys()], 50)) {
        const r = await get('videos', { part: 'snippet,contentDetails,statistics,liveStreamingDetails', id: ids.join(','), maxResults: 50 });
        for (const v of r.items ?? []) {
          const acc = videoOwner.get(v.id);
          const sn = v.snippet ?? {};
          const live = v.liveStreamingDetails ?? {};
          const base = { accountId: acc.id, memberId: acc.memberId, externalId: v.id, title: (sn.title ?? '').slice(0, 200), url: `https://www.youtube.com/watch?v=${v.id}`, thumbnailUrl: bestThumb(sn.thumbnails) };
          if (sn.liveBroadcastContent === 'live') {
            result.live.push({ ...base, viewerCount: num(live.concurrentViewers), startedAt: new Date(live.actualStartTime ?? sn.publishedAt) });
          } else if (sn.liveBroadcastContent === 'none') {
            result.videos.push({ ...base, durationSec: isoDurationToSeconds(v.contentDetails?.duration), viewCount: num(v.statistics?.viewCount), publishedAt: new Date(live.actualStartTime ?? sn.publishedAt) });
          }
          // 'upcoming' (scheduled premieres/streams) is ignored for now.
        }
      }

      result.unitsUsed = unitsUsed;
      return result;
    },
  };
}

export { ProviderError };
