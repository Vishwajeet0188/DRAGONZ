import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Crosshair, Play, Target, Flame, Shield } from 'lucide-react';
import { api } from '../lib/api.js';
import { safeUrl } from '../lib/format.js';
import { PLATFORM_META } from '../lib/platforms.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { Avatar } from '../components/ui/Avatar.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';

/** Combat-styled POV thumbnail that links out to the clip. */
function PovCard({ pov }) {
  const url = safeUrl(pov.url);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="group/pov relative block aspect-video overflow-hidden rounded-lg border border-ink-700 bg-ink-950 transition hover:border-red-500/60">
      {safeUrl(pov.thumbnailUrl)
        ? <img src={pov.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-500 group-hover/pov:scale-105" />
        : <div className="grid h-full w-full place-items-center bg-[radial-gradient(70%_100%_at_50%_0%,rgb(239_68_68/.18),transparent_65%),linear-gradient(160deg,#1a1210,#0b0b0d)]"><Crosshair className="h-8 w-8 text-red-500/40" /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" aria-hidden="true" />
      <span className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-red-600/80 text-white opacity-90 shadow-[0_0_24px_-4px_rgb(239_68_68/.8)] transition group-hover/pov:scale-110">
        <Play className="h-5 w-5 translate-x-0.5 fill-white" />
      </span>
      <p className="absolute inset-x-0 bottom-0 line-clamp-1 p-2.5 text-xs font-semibold text-white">{pov.title}</p>
    </a>
  );
}

function ShooterCard({ s }) {
  const accent = /^#[0-9a-f]{6}$/i.test(s.accentColor) ? s.accentColor : '#ef4444';
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-red-500/20 bg-ink-900/70 shadow-[0_20px_60px_-30px_rgb(0_0_0/.8)] backdrop-blur-sm transition duration-300 hover:border-red-500/50 hover:shadow-[0_28px_70px_-26px_rgb(239_68_68/.45)]">
      {/* banner */}
      <div className="relative h-36 overflow-hidden sm:h-40">
        {safeUrl(s.bannerUrl)
          ? <img src={s.bannerUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-[1.03]" />
          : (
            <div className="h-full w-full bg-[radial-gradient(90%_140%_at_80%_0%,rgb(239_68_68/.28),transparent_60%),linear-gradient(160deg,#1a1210,#0b0b0d)]" aria-hidden="true">
              {/* tactical default: scanline grid + big faded callsign initial */}
              <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgb(239_68_68/.06)_0_1px,transparent_1px_22px)]" />
              <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/.03)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/.03)_1px,transparent_1px)] bg-[length:26px_26px]" />
              <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 font-display text-[7rem] font-extrabold leading-none text-white/[0.04]">{(s.displayName || '?').charAt(0).toUpperCase()}</span>
            </div>
          )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/50 to-transparent" aria-hidden="true" />
        {/* tactical corner ticks */}
        <Crosshair className="absolute right-4 top-4 h-8 w-8 text-red-400/40" aria-hidden="true" />
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-ink-950/70 px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-red-300 backdrop-blur">
          <Target className="h-3.5 w-3.5" /> {s.rank || 'Shooter'}
        </span>
      </div>

      <div className="relative -mt-12 px-5 pb-5 sm:px-6">
        <div className="flex items-end gap-4">
          <span className="rounded-2xl ring-4 ring-ink-900" style={{ boxShadow: `0 0 0 2px ${accent}` }}>
            <Avatar src={s.avatarUrl} name={s.displayName} accent={accent} size="lg" className="!h-20 !w-20 !rounded-2xl" />
          </span>
          <div className="min-w-0 pb-1">
            <h2 className="font-display text-2xl font-extrabold uppercase leading-none text-white sm:text-3xl">{s.displayName}</h2>
            {s.rpCharacter && <p className="mt-1 text-sm text-ink-300">as {s.rpCharacter}</p>}
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 text-sm font-medium text-red-200"><Flame className="mt-0.5 h-4 w-4 shrink-0 text-red-400" /> {s.tagline || 'Front-line Dragonz shooter.'}</p>

        {/* combat stats */}
        {s.stats?.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {s.stats.map((st, i) => (
              <div key={i} className="rounded-xl border border-ink-700 bg-ink-950/60 px-3 py-2.5 text-center">
                <p className="font-display text-2xl font-extrabold leading-none text-white">{st.value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-red-300/80">{st.label}</p>
              </div>
            ))}
          </div>
        )}

        {s.bio && <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-ink-300">{s.bio}</p>}

        {/* POV clips */}
        <div className="mt-5">
          <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400"><Play className="h-3.5 w-3.5 text-red-400" /> POV clips</p>
          {s.povs?.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {s.povs.map((p) => <PovCard key={p.id} pov={p} />)}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-ink-700 bg-ink-950/40 px-4 py-5 text-sm text-ink-500">
              <Crosshair className="h-5 w-5 shrink-0 text-red-500/40" /> No POV clips posted yet.
            </div>
          )}
        </div>

        {/* footer: platforms + profile */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink-700/70 pt-4">
          {(s.platforms ?? []).map((p) => {
            const meta = PLATFORM_META[p.platform];
            const url = safeUrl(p.url);
            if (!meta || !url) return null;
            return (
              <a key={p.platform} href={url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs font-semibold text-ink-200 hover:border-red-500/50 hover:text-white">
                <meta.Icon className="h-3.5 w-3.5" style={{ color: meta.color }} /> {meta.label}
              </a>
            );
          })}
          <Link to={`/members/${s.slug}`} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-red-300 hover:text-white">Full profile →</Link>
        </div>
      </div>
    </article>
  );
}

export default function Shooters() {
  usePageTitle('Shooters');
  const q = useQuery({ queryKey: ['shooters'], queryFn: () => api.get('/shooters').then((r) => r.data) });

  return (
    <div className="relative">
      {/* aggressive red backdrop for the top of the page */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(70%_100%_at_50%_0%,rgb(239_68_68/.14),transparent_62%),linear-gradient(180deg,#1a1012,transparent)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
      </div>

      <div className="container-page relative py-12">
        <header className="mb-10 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-red-500/40 bg-ink-950/70 shadow-[0_0_40px_-10px_rgb(239_68_68/.6)]"><Crosshair className="h-7 w-7 text-red-400" aria-hidden="true" /></span>
          <p className="eyebrow mt-4 !text-red-400">Front line</p>
          <h1 className="mt-1 font-display text-5xl font-extrabold uppercase sm:text-7xl">The <span className="text-red-500">Shooters</span></h1>
          <p className="mx-auto mt-3 max-w-xl text-ink-300">The Dragonz who take the fight to rival gangs. Their callsigns, combat record and best POV clips.</p>
        </header>

        {q.isPending ? (
          <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
        ) : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data.length === 0 ? (
          <EmptyState icon={Shield} title="No shooters yet">Shooters added by admins will appear here with their stats and POV clips.</EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {q.data.map((s) => <ShooterCard key={s.id} s={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}
