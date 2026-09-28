import { Link } from 'react-router';
import { ArrowRight, ChevronRight, MessagesSquare } from 'lucide-react';
import { compact } from '../../lib/format.js';
import { PLATFORM_META } from '../../lib/platforms.js';
import { useSiteSettings } from '../../lib/site.js';
import { BrandMark } from '../ui/Logo.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { LiveDot } from '../ui/Bits.jsx';

// Deterministic ember particles (no Math.random → stable between renders).
// Timing is set inline per particle: @theme variables resolve at :root, so per-element
// custom properties inside --animate-ember would all collapse to the same value.
const EMBERS = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  width: 2 + ((i * 7) % 4),
  height: 2 + ((i * 7) % 4),
  animation: `ember ${9 + ((i * 13) % 9)}s linear -${(i * 29) % 14}s infinite`,
  '--dx': `${((i * 41) % 90) - 45}px`,
  '--o': 0.35 + ((i * 17) % 50) / 100,
}));

const stagger = (i) => ({ animationDelay: `${80 + i * 90}ms` });

function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-ink-950" />
      {/* soft gold light behind the dragon */}
      <div className="absolute inset-0 bg-[radial-gradient(55%_60%_at_72%_42%,rgb(217_165_20/.20),transparent_70%)] max-lg:bg-[radial-gradient(90%_45%_at_50%_24%,rgb(217_165_20/.20),transparent_70%)]" />
      {/* fine grid, faded out towards the edges */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/.035)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_60%_55%_at_65%_45%,black,transparent)]" />
      {/* giant outlined watermark */}
      <span className="absolute -bottom-[0.18em] -left-[0.04em] select-none font-display text-[34vw] font-extrabold leading-none tracking-tighter text-transparent lg:text-[24vw]"
        style={{ WebkitTextStroke: '1px rgb(217 165 20 / .09)' }}>DRZ</span>
      {/* rising embers */}
      <div className="absolute inset-x-0 bottom-0 h-full motion-reduce:hidden">
        {EMBERS.map((e, i) => (
          <span key={i} className="absolute bottom-[-10px] animate-ember rounded-full bg-dragon-400 shadow-[0_0_8px_2px_rgb(255_202_40/.55)]"
            style={e} />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink-900" />
    </div>
  );
}

function Stage({ live, roster, stats }) {
  const top = live[0];
  const faces = roster.slice(0, 5);
  return (
    <div className="relative mx-auto aspect-square w-[min(66vw,290px)] sm:w-[420px] lg:w-[min(40vw,560px)]">
      {/* rings (siblings of the logo — never ancestors, see BrandMark) */}
      <div className="absolute inset-0 rounded-full border border-dragon-500/15" aria-hidden="true" />
      <div className="absolute inset-[7%] rounded-full border border-dashed border-dragon-500/30 motion-safe:animate-spin-slow" aria-hidden="true" />
      <svg viewBox="0 0 100 100" className="absolute inset-[3%] motion-safe:animate-spin-slower" aria-hidden="true">
        <circle cx="50" cy="50" r="49" fill="none" stroke="rgb(217 165 20 / .35)" strokeWidth=".35" strokeDasharray=".4 2.6" />
      </svg>
      <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgb(255_202_40/.30),rgb(217_165_20/.08)_55%,transparent_72%)] blur-xl" aria-hidden="true" />

      <BrandMark className="absolute inset-[11%] block" imgClassName="motion-safe:animate-float" eager />

      {/* floating live card */}
      {top && (
        <Link to="/live" className="group absolute -left-2 bottom-[9%] hidden w-64 animate-fade-up items-center gap-3 rounded-2xl border border-white/10 bg-ink-900/70 p-3 shadow-2xl backdrop-blur-xl transition hover:border-live/50 sm:flex lg:-left-10"
          style={stagger(6)} aria-label={`${top.member.displayName} is live — open the live hub`}>
          <Avatar src={top.member.avatarUrl} name={top.member.displayName} accent={top.member.accentColor} size="sm" live />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-live"><LiveDot /> Live on {PLATFORM_META[top.platform]?.label}</p>
            <p className="truncate font-display text-lg font-bold leading-tight text-ink-100">{top.member.displayName}</p>
            <p className="truncate text-xs text-ink-400">{top.viewerCount != null ? `${compact(top.viewerCount)} watching` : top.title}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-white" aria-hidden="true" />
        </Link>
      )}

      {/* floating roster card */}
      {faces.length > 0 && (
        <Link to="/members" className="group absolute -right-1 top-[8%] hidden animate-fade-up rounded-2xl border border-white/10 bg-ink-900/70 p-3 pr-4 shadow-2xl backdrop-blur-xl transition hover:border-dragon-500/50 sm:block lg:-right-6"
          style={stagger(7)} aria-label="Meet the DRZ roster">
          <div className="flex -space-x-2.5">
            {faces.map((m) => <Avatar key={m.id} src={m.avatarUrl} name={m.displayName} accent={m.accentColor} size="sm" className="rounded-full ring-2 ring-ink-900" />)}
            {stats.members > faces.length && (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-700 text-[11px] font-bold text-ink-100 ring-2 ring-ink-900">+{stats.members - faces.length}</span>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-300"><span className="font-semibold text-ink-100">{stats.members} members</span> · {stats.creators} creators</p>
        </Link>
      )}
    </div>
  );
}

function RosterRibbon({ roster }) {
  if (roster.length < 4) return null;
  const loop = [...roster, ...roster];
  return (
    <div className="relative border-y border-white/5 bg-ink-950/70 backdrop-blur">
      <div className="container-page flex items-center gap-6 py-3.5">
        <p className="hidden shrink-0 font-display text-sm font-bold uppercase tracking-[0.3em] text-dragon-400 sm:block">The Roster</p>
        <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] motion-reduce:overflow-x-auto">
          <ul className="flex w-max animate-marquee gap-2 hover:[animation-play-state:paused] motion-reduce:animate-none">
            {loop.map((m, i) => (
              <li key={`${m.id}-${i}`} aria-hidden={i >= roster.length || undefined}>
                <Link to={`/members/${m.slug}`} tabIndex={i >= roster.length ? -1 : undefined}
                  className="flex items-center gap-2.5 rounded-full border border-transparent py-1 pl-1 pr-4 transition hover:border-dragon-500/30 hover:bg-white/5">
                  <Avatar src={m.avatarUrl} name={m.displayName} accent={m.accentColor} size="sm" className="!h-8 !w-8 rounded-full" />
                  <span className="whitespace-nowrap font-display text-base font-semibold text-ink-100">{m.displayName}</span>
                  <span className="whitespace-nowrap text-[11px] uppercase tracking-wider text-ink-500">{m.rank}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function Hero({ stats, liveNow, roster }) {
  const liveCount = stats?.live ?? 0;
  const { discordUrl, heroTagline } = useSiteSettings();
  return (
    <section className="relative isolate -mt-16 flex min-h-[100svh] flex-col overflow-hidden pt-16 lg:min-h-[min(100svh,920px)]" aria-labelledby="hero-title">
      <Backdrop />

      <div className="container-page grid flex-1 items-center gap-4 py-6 sm:gap-6 sm:py-10 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:py-16">
        <div className="order-2 text-center lg:order-1 lg:text-left">
          {liveCount > 0 ? (
            <Link to="/live" className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-live/30 bg-live/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-ink-100 transition hover:border-live/60" style={stagger(0)}>
              <LiveDot /> {liveCount} creator{liveCount === 1 ? '' : 's'} live now <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <p className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-dragon-500/30 bg-dragon-500/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-dragon-300" style={stagger(0)}>
              DRZ · Dragon Z Creators
            </p>
          )}

          <h1 id="hero-title" className="mt-5 font-display text-[clamp(3.25rem,10vw,8.5rem)] font-extrabold uppercase leading-[0.84] tracking-tight">
            <span className="block animate-fade-up text-ink-100" style={stagger(1)}>Unleash</span>
            <span className="block animate-fade-up" style={stagger(2)}>
              <span className="inline-block bg-[linear-gradient(90deg,#b0850c,#ffca28,#fff1c2,#ffca28,#b0850c)] bg-[length:200%_auto] bg-clip-text pb-2 text-transparent motion-safe:animate-shimmer">the Dragon</span>
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-lg animate-fade-up text-base text-ink-300 sm:text-lg lg:mx-0" style={stagger(3)}>
            {heroTagline || <>The official home of <span className="font-semibold text-ink-100">DRZ</span> — every member, creator and live stream from the city, in one place.</>}
          </p>

          <div className="mt-8 flex animate-fade-up flex-wrap items-center justify-center gap-3 lg:justify-start" style={stagger(4)}>
            <Button to="/members?creator=true" size="lg" className="px-7">Meet the Creators <ArrowRight className="h-4 w-4" /></Button>
            <Button to="/live" size="lg" variant="outline"><LiveDot /> Watch Live</Button>
            <a href={discordUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 px-3 text-sm font-semibold text-ink-300 transition hover:text-white">
              <MessagesSquare className="h-4 w-4 text-[#8b93ff]" aria-hidden="true" /> Join Discord
            </a>
          </div>

          <dl className="mx-auto mt-10 grid max-w-md animate-fade-up grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[.02] py-4 backdrop-blur-sm lg:mx-0" style={stagger(5)}>
            {[
              ['Members', stats?.members],
              ['Creators', stats?.creators],
              ['Live now', liveCount, null, liveCount > 0],
            ].map(([label, value, , hot]) => (
              <div key={label} className="flex flex-col-reverse px-3 text-center">
                <dt className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">{label}</dt>
                <dd className={`font-display text-3xl font-bold leading-none sm:text-4xl ${hot ? 'text-live' : 'text-ink-100'}`}>{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="order-1 lg:order-2">
          <Stage live={liveNow} roster={roster} stats={stats} />
        </div>
      </div>

      <RosterRibbon roster={roster} />
    </section>
  );
}
