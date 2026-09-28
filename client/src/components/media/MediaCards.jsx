import { useState } from 'react';
import { Link } from 'react-router';
import { Eye, Play, Users } from 'lucide-react';
import { PLATFORM_META } from '../../lib/platforms.js';
import { compact, duration, safeUrl, timeAgo } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.jsx';
import { trackClick } from '../../lib/site.js';
import { LiveBadge } from '../ui/Bits.jsx';

/** 16:9 media frame; falls back to a branded scale pattern when there is no thumbnail. */
export function Thumb({ src, accent = '#d9a514', platform, children, title }) {
  const [failed, setFailed] = useState(false);
  const url = safeUrl(src);
  const meta = PLATFORM_META[platform];
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-ink-800">
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
      ) : (
        <div className="scales absolute inset-0" style={{ background: `radial-gradient(120% 90% at 20% 0%, ${accent}55, transparent 60%), linear-gradient(160deg, #15151b, #0b0b0f)` }}>
          <div className="absolute inset-0 grid place-items-center">
            {meta && <meta.Icon className="h-10 w-10 opacity-30" style={{ color: meta.color }} aria-hidden="true" />}
          </div>
          {title && <p className="absolute inset-x-3 bottom-3 line-clamp-2 font-display text-base font-bold leading-tight text-white/85">{title}</p>}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      {children}
    </div>
  );
}

export function VideoCard({ video, showFeatured = false }) {
  const m = video.member;
  const meta = PLATFORM_META[video.platform];
  return (
    <a href={safeUrl(video.url)} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('video', video.id)} className="group block focus-visible:outline-offset-4" aria-label={`${video.title} by ${m?.displayName} on ${meta?.label} (opens in new tab)`}>
      <Thumb src={video.thumbnailUrl} accent={m?.accentColor} platform={video.platform}>
        {video.durationSec ? <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">{duration(video.durationSec)}</span> : null}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
          {meta && <meta.Icon className="h-3 w-3" style={{ color: meta.color }} aria-hidden="true" />} {meta?.label}
        </span>
        {showFeatured && video.isFeatured && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-dragon-400 px-1.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider text-ink-950 shadow">★ Featured</span>
        )}
        <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-dragon-500/90 shadow-[var(--shadow-glow)]"><Play className="h-5 w-5 translate-x-0.5 fill-white text-white" /></span>
        </span>
      </Thumb>
      <div className="mt-3 flex gap-3">
        {m && <Avatar src={m.avatarUrl} name={m.displayName} accent={m.accentColor} size="sm" />}
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-sans text-sm font-semibold leading-snug tracking-normal text-ink-100 group-hover:text-white">{video.title}</h3>
          <p className="mt-1 text-xs text-ink-400">
            {m?.displayName} · {timeAgo(video.publishedAt)}
            {video.viewCount ? <> · <Eye className="inline h-3 w-3" aria-hidden="true" /> {compact(video.viewCount)}</> : null}
          </p>
        </div>
      </div>
    </a>
  );
}

export function LiveCard({ stream }) {
  const m = stream.member;
  return (
    <div className="group card card-hover overflow-hidden p-2">
      <a href={safeUrl(stream.url)} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${m?.displayName} live on ${PLATFORM_META[stream.platform]?.label} (opens in new tab)`}>
        <Thumb src={stream.thumbnailUrl} accent={m?.accentColor} platform={stream.platform}>
          <LiveBadge platform={stream.platform} className="absolute left-2 top-2" />
          {stream.viewerCount != null && (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              <Users className="h-3 w-3" aria-hidden="true" /> {compact(stream.viewerCount)}
            </span>
          )}
        </Thumb>
      </a>
      <div className="flex items-center gap-3 p-2 pt-3">
        <Avatar src={m?.avatarUrl} name={m?.displayName} accent={m?.accentColor} size="sm" live />
        <div className="min-w-0 flex-1">
          <Link to={`/members/${m?.slug}`} className="font-display text-base font-bold text-ink-100 hover:text-dragon-300">{m?.displayName}</Link>
          <p className="truncate text-xs text-ink-300">{stream.title}</p>
        </div>
      </div>
    </div>
  );
}
