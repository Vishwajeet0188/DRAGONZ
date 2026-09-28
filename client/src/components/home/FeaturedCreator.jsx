// Home: spotlight on one featured creator — banner, reach per platform, live button and latest uploads.
import { ArrowRight, Crown, Play, Radio } from 'lucide-react';
import { compact, safeUrl, timeAgo } from '../../lib/format.js';
import { PLATFORM_META } from '../../lib/platforms.js';
import { trackClick } from '../../lib/site.js';
import { Avatar } from '../ui/Avatar.jsx';
import { LiveBadge, PlatformChip } from '../ui/Bits.jsx';
import { Button } from '../ui/Button.jsx';

function Reach({ platforms }) {
  const counted = platforms.filter((p) => p.followerCount > 0 && PLATFORM_META[p.platform]);
  if (!counted.length) return null;
  const total = counted.reduce((s, p) => s + p.followerCount, 0);
  return (
    <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
      {counted.length > 1 && (
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">Total reach</dt>
          <dd className="font-display text-3xl font-bold text-dragon-300">{compact(total)}</dd>
        </div>
      )}
      {counted.map((p) => {
        const meta = PLATFORM_META[p.platform];
        return (
          <div key={p.platform}>
            <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-ink-400">
              <meta.Icon className="h-3 w-3" style={{ color: meta.color }} aria-hidden="true" /> {meta.label} {meta.noun}
            </dt>
            <dd className="font-display text-3xl font-bold text-ink-100">{compact(p.followerCount)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function RecentVideos({ videos, name }) {
  if (!videos?.length) return null;
  return (
    <div className="lg:border-l lg:border-ink-700/70 lg:pl-8">
      <p className="mb-3 font-display text-xs font-bold uppercase tracking-[0.2em] text-ink-400">Latest from {name}</p>
      <ul className="space-y-3">
        {videos.map((v) => {
          const meta = PLATFORM_META[v.platform];
          const href = safeUrl(v.url);
          return (
            <li key={v.id}>
              <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('video', v.id)}
                className="group flex gap-3 rounded-xl p-1.5 transition hover:bg-ink-800/70">
                <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-ink-800">
                  {safeUrl(v.thumbnailUrl) && <img src={v.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
                  <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100" aria-hidden="true"><Play className="h-6 w-6 fill-white text-white" /></span>
                </div>
                <div className="min-w-0 py-0.5">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink-100 group-hover:text-white">{v.title}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-400">
                    {meta && <meta.Icon className="h-3 w-3" style={{ color: meta.color }} aria-hidden="true" />}
                    {v.viewCount ? `${compact(v.viewCount)} views · ` : ''}{timeAgo(v.publishedAt)}
                  </p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FeaturedCreator({ member }) {
  if (!member) return null;
  const accent = member.accentColor ?? '#d9a514';
  const banner = safeUrl(member.bannerUrl);
  const liveUrl = safeUrl(member.live?.url);
  const hasVideos = member.recentVideos?.length > 0;

  return (
    <section className="container-page py-10 sm:py-14" aria-labelledby="fc-h">
      <div className="card relative overflow-hidden border-dragon-500/25">
        {/* backdrop: creator banner (dimmed) or accent glow */}
        {banner && <img src={banner} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover opacity-25" aria-hidden="true" />}
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/40" aria-hidden="true" />
        <div className="scales absolute inset-0 opacity-60" style={{ background: `radial-gradient(70% 110% at 0% 0%, ${accent}33, transparent 60%)` }} aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-dragon-400/70 to-transparent" aria-hidden="true" />

        <div className={`relative grid gap-10 p-6 sm:p-10 ${hasVideos ? 'lg:grid-cols-[1.35fr_1fr]' : ''}`}>
          <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
            <div className="relative w-fit">
              <div className="absolute -inset-3 rounded-3xl blur-2xl" style={{ background: `${accent}40` }} aria-hidden="true" />
              <Avatar src={member.avatarUrl} name={member.displayName} accent={accent} size="xl" live={Boolean(member.live)} className="relative" />
              {member.live && <LiveBadge platform={member.live.platform} className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap" />}
            </div>
            <div className="min-w-0">
              <p className="eyebrow mb-2 flex items-center gap-1.5"><Crown className="h-3.5 w-3.5" aria-hidden="true" /> Featured creator</p>
              <h2 id="fc-h" className="text-4xl font-bold uppercase leading-none sm:text-6xl">{member.displayName}</h2>
              <p className="mt-2 text-ink-300"><span className="font-semibold text-dragon-300">{member.rank}</span>{member.rpCharacter ? ` · plays ${member.rpCharacter}` : ''}</p>
              {member.tagline && <p className="mt-3 font-display text-lg italic text-ink-200">“{member.tagline}”</p>}
              {member.bio && <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-relaxed text-ink-300">{member.bio}</p>}
              <Reach platforms={member.platforms} />
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {liveUrl && (
                  <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-live px-4 text-sm font-semibold text-white shadow-[0_8px_28px_-10px_var(--color-live)] hover:brightness-110">
                    <Radio className="h-4 w-4" /> Watch live
                  </a>
                )}
                <Button to={`/members/${member.slug}`} variant={liveUrl ? 'secondary' : 'primary'}>View profile <ArrowRight className="h-4 w-4" /></Button>
                <div className="flex flex-wrap gap-1.5">{member.platforms.map((p) => <PlatformChip key={p.platform} {...p} size="sm" />)}</div>
              </div>
            </div>
          </div>
          <RecentVideos videos={member.recentVideos} name={member.displayName} />
        </div>
      </div>
    </section>
  );
}
