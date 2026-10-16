import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Crosshair, Play, Target, Flame, Shield } from 'lucide-react';
import { api } from '../lib/api.js';
import { safeUrl } from '../lib/format.js';
import { PLATFORM_META } from '../lib/platforms.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { Avatar } from '../components/ui/Avatar.jsx';
import { BrandMark } from '../components/ui/Logo.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';

/* ── Animated combat backdrop: breathing/roaring dragon, bullet tracers, embers, HUD scanlines ── */
const TRACERS = [
  { top: '14%', dur: '2.1s', delay: '0s', w: 200 },
  { top: '31%', dur: '1.6s', delay: '0.7s', w: 150 },
  { top: '47%', dur: '2.5s', delay: '1.4s', w: 240 },
  { top: '63%', dur: '1.9s', delay: '0.3s', w: 170 },
  { top: '78%', dur: '2.3s', delay: '1.1s', w: 210 },
  { top: '89%', dur: '1.7s', delay: '2s', w: 140 },
];
const EMBERS = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 61) % 100}%`, dur: `${6 + (i % 5) * 1.3}s`, delay: `${(i % 7) * 0.9}s`,
  dx: `${(i % 2 ? 1 : -1) * (10 + (i % 4) * 14)}px`, size: i % 3 === 0 ? 4 : 2,
}));

function ShooterFX() {
  return (
    <div className="shooter-fx pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <style>{`
        .shooter-fx .fx-glow{position:absolute;inset:0;background:radial-gradient(60% 55% at 50% 20%,rgba(239,68,68,.20),transparent 60%);animation:fxBreathe 4.2s ease-in-out infinite}
        .shooter-fx .fx-fire{position:absolute;left:50%;top:-6%;width:70vmin;height:70vmin;transform:translateX(-50%);
          background:radial-gradient(circle at 50% 45%,rgba(249,115,22,.22),rgba(239,68,68,.12) 40%,transparent 66%);
          filter:blur(6px);animation:fxFire 3.1s ease-in-out infinite}
        .shooter-fx .fx-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 4px);mix-blend-mode:overlay;opacity:.5}
        .shooter-fx .fx-grid{position:absolute;inset:0;background:linear-gradient(rgba(239,68,68,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(239,68,68,.05) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(70% 60% at 50% 25%,#000,transparent 75%)}
        .shooter-fx .fx-tracer{position:absolute;height:2px;border-radius:2px;left:-25vw;
          background:linear-gradient(90deg,transparent,rgba(239,68,68,.55) 60%,#ffd9d9);
          box-shadow:0 0 10px rgba(239,68,68,.85),0 0 22px rgba(239,68,68,.4);
          animation:fxTracer linear infinite}
        .shooter-fx .fx-ember{position:absolute;bottom:-12px;border-radius:9999px;background:radial-gradient(circle,#ffd9a0,#ef4444 70%);box-shadow:0 0 8px rgba(249,115,22,.8);animation:fxEmber linear infinite}
        @keyframes fxBreathe{0%,100%{opacity:.5}50%{opacity:1}}
        @keyframes fxFire{0%,100%{opacity:.55;transform:translateX(-50%) scale(1)}50%{opacity:1;transform:translateX(-50%) scale(1.08)}}
        @keyframes fxTracer{0%{transform:translate(0,0) rotate(-9deg);opacity:0}6%{opacity:1}94%{opacity:1}100%{transform:translate(150vw,-10vh) rotate(-9deg);opacity:0}}
        @keyframes fxEmber{0%{transform:translate(0,0) scale(1);opacity:0}12%{opacity:.9}100%{transform:translate(var(--dx,12px),-78vh) scale(.3);opacity:0}}
        @media (prefers-reduced-motion: reduce){.shooter-fx .fx-glow,.shooter-fx .fx-fire,.shooter-fx .fx-tracer,.shooter-fx .fx-ember{animation:none!important}.shooter-fx .fx-tracer,.shooter-fx .fx-ember{display:none}}
      `}</style>
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(40,12,14,.9),#0a0608_70%)]" />
      <div className="fx-fire" />
      {/* roaring dragon crest */}
      <BrandMark className="absolute left-1/2 top-[2%] h-[64vmin] w-[64vmin] max-h-[560px] max-w-[560px] -translate-x-1/2 opacity-[0.1] [mask-image:radial-gradient(closest-side,#000_60%,transparent_100%)]" imgClassName="h-full w-full object-contain" eager />
      <div className="fx-glow" />
      <div className="fx-grid" />
      {TRACERS.map((t, i) => <span key={i} className="fx-tracer" style={{ top: t.top, width: t.w, animationDuration: t.dur, animationDelay: t.delay }} />)}
      {EMBERS.map((e, i) => <span key={i} className="fx-ember" style={{ left: e.left, width: e.size, height: e.size, '--dx': e.dx, animationDuration: e.dur, animationDelay: e.delay }} />)}
      <div className="fx-scan" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-ink-950 to-transparent" />
    </div>
  );
}

/** HUD corner brackets for a tactical frame. */
function HudCorners() {
  const c = 'pointer-events-none absolute h-4 w-4 border-red-500/50';
  return (
    <>
      <span className={`${c} left-2 top-2 border-l-2 border-t-2`} />
      <span className={`${c} right-2 top-2 border-r-2 border-t-2`} />
      <span className={`${c} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${c} bottom-2 right-2 border-b-2 border-r-2`} />
    </>
  );
}

function PovCard({ pov }) {
  const url = safeUrl(pov.url);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="group/pov relative block aspect-video overflow-hidden rounded-lg border border-ink-700 bg-ink-950 transition hover:border-red-500/70 hover:shadow-[0_0_24px_-6px_rgb(239_68_68/.6)]">
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
    <article className="group relative overflow-hidden rounded-2xl border border-red-500/25 bg-ink-950/80 shadow-[0_20px_60px_-30px_rgb(0_0_0/.8)] backdrop-blur-md transition duration-300 hover:border-red-500/60 hover:shadow-[0_28px_80px_-24px_rgb(239_68_68/.5)]">
      <span className="absolute inset-x-0 top-0 z-20 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent" />
      <HudCorners />
      {/* banner */}
      <div className="relative h-36 overflow-hidden sm:h-40">
        {safeUrl(s.bannerUrl)
          ? <img src={s.bannerUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-[1.04]" />
          : (
            <div className="h-full w-full bg-[radial-gradient(90%_140%_at_80%_0%,rgb(239_68_68/.3),transparent_60%),linear-gradient(160deg,#1a1210,#0b0b0d)]" aria-hidden="true">
              <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgb(239_68_68/.07)_0_1px,transparent_1px_22px)]" />
              <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/.03)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/.03)_1px,transparent_1px)] bg-[length:26px_26px]" />
              <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 font-display text-[7rem] font-extrabold leading-none text-white/[0.05]">{(s.displayName || '?').charAt(0).toUpperCase()}</span>
            </div>
          )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/50 to-transparent" aria-hidden="true" />
        <Crosshair className="absolute right-4 top-4 h-8 w-8 animate-pulse text-red-400/50" aria-hidden="true" />
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-ink-950/70 px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-red-300 backdrop-blur">
          <Target className="h-3.5 w-3.5" /> {s.rank || 'Shooter'}
        </span>
      </div>

      <div className="relative -mt-12 px-5 pb-5 sm:px-6">
        <div className="flex items-end gap-4">
          <span className="rounded-2xl ring-4 ring-ink-950" style={{ boxShadow: `0 0 0 2px ${accent}, 0 0 28px -6px ${accent}` }}>
            <Avatar src={s.avatarUrl} name={s.displayName} accent={accent} size="lg" className="!h-20 !w-20 !rounded-2xl" />
          </span>
          <div className="min-w-0 pb-1">
            <h2 className="font-display text-2xl font-extrabold uppercase leading-none text-white [text-shadow:0_2px_12px_rgb(239_68_68/.35)] sm:text-3xl">{s.displayName}</h2>
            {s.rpCharacter && <p className="mt-1 text-sm text-ink-300">as {s.rpCharacter}</p>}
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 text-sm font-medium text-red-200"><Flame className="mt-0.5 h-4 w-4 shrink-0 text-red-400" /> {s.tagline || 'Front-line Dragonz shooter.'}</p>

        {/* combat record */}
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400"><Target className="h-3.5 w-3.5 text-red-400" /> Combat record</p>
          {s.stats?.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {s.stats.map((st, i) => (
                <div key={i} className="relative overflow-hidden rounded-xl border border-ink-700 bg-ink-900/70 px-3 py-2.5 text-center">
                  <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
                  <p className="font-display text-2xl font-extrabold leading-none text-white">{st.value}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-red-300/80">{st.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-ink-700 bg-ink-900/40 px-3 py-2.5 text-xs text-ink-500">Stats not logged yet.</p>
          )}
        </div>

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

        {/* footer */}
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
    <div className="relative min-h-[70vh]">
      <ShooterFX />

      <div className="container-page relative z-10 py-12">
        <header className="mb-10 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-red-500/50 bg-ink-950/70 shadow-[0_0_50px_-8px_rgb(239_68_68/.7)]"><Crosshair className="h-8 w-8 animate-pulse text-red-400" aria-hidden="true" /></span>
          <p className="eyebrow mt-4 !text-red-400">Front line</p>
          <h1 className="mt-1 font-display text-5xl font-extrabold uppercase [text-shadow:0_4px_30px_rgb(239_68_68/.5)] sm:text-7xl">The <span className="text-red-500">Shooters</span></h1>
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
