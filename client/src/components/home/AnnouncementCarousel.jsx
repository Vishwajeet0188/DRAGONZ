import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, ChevronLeft, ChevronRight, Megaphone, Pause, Pin, Play } from 'lucide-react';
import { Badge } from '../ui/Bits.jsx';
import { safeUrl, timeAgo, titleCase } from '../../lib/format.js';

const AUTO_MS = 5500;
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Auto-rotating announcement cards — one slide at a time, advancing on a timer.
 * Pauses on hover/focus and when the tab is hidden; honours reduced-motion (no auto-advance).
 * `variant="hero"` is the taller banner used at the top of the News page; the default is the
 * home-column panel. Falls back to a single static card when there is only one item.
 */
export function AnnouncementCarousel({ items = [], variant = 'panel' }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;
  const hero = variant === 'hero';

  const go = (n) => setI((prev) => ((n % count) + count) % count);
  useEffect(() => { if (i >= count) setI(0); }, [count, i]);

  useEffect(() => {
    if (count <= 1 || paused || prefersReducedMotion()) return undefined;
    const t = setInterval(() => setI((p) => (p + 1) % count), AUTO_MS);
    return () => clearInterval(t);
  }, [count, paused]);

  if (count === 0) {
    return (
      <div className="card flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <Megaphone className="h-7 w-7 text-dragon-400" aria-hidden="true" />
        <p className="font-display text-xl font-bold">No announcements yet</p>
        <p className="max-w-xs text-sm text-ink-400">Crew news, recruitment calls and notices from the Boss will land here.</p>
      </div>
    );
  }

  const current = items[Math.min(i, count - 1)];

  return (
    <div
      className="group relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Announcements"
    >
      <div className={`card relative overflow-hidden transition duration-300 hover:-translate-y-1 hover:border-dragon-500/40 hover:shadow-[0_24px_60px_-30px_rgb(217_165_20/.5)] ${hero ? 'min-h-[18rem] sm:min-h-[22rem]' : 'min-h-[22rem]'}`}>
        {/* Slides stacked; only the active one is shown (crossfade). */}
        {items.map((a, idx) => (
          <article
            key={a.id}
            className={`absolute inset-0 flex flex-col transition-opacity duration-700 ${idx === i ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            aria-hidden={idx === i ? undefined : true}
          >
            <Link to={`/news/${a.slug}`} className="relative block flex-1 overflow-hidden">
              {safeUrl(a.featuredImageUrl) ? (
                <img src={a.featuredImageUrl} alt="" loading={idx === 0 ? 'eager' : 'lazy'} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : (
                <div className="scales h-full w-full bg-[radial-gradient(90%_140%_at_0%_0%,rgb(217_165_20/.22),transparent_60%),linear-gradient(180deg,#141416,#0e0e10)]" aria-hidden="true">
                  <Megaphone className="absolute right-6 top-5 h-14 w-14 -rotate-12 text-dragon-400/20" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/55 to-transparent" aria-hidden="true" />
              <div className={`absolute inset-x-0 bottom-0 ${hero ? 'p-6 sm:p-8' : 'p-5'}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
                  <Badge tone={a.category === 'RECRUITMENT' ? 'ember' : 'dragon'}>{titleCase(a.category)}</Badge>
                  {a.isPinned && <Badge tone="dragon"><Pin className="h-3 w-3" /> Pinned</Badge>}
                  <span>{timeAgo(a.publishedAt)}</span>
                </div>
                <h3 className={`mt-2 font-display font-bold leading-tight text-white group-hover:text-dragon-200 ${hero ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-3xl'}`}>{a.title}</h3>
                {a.excerpt && <p className={`mt-2 text-ink-300 ${hero ? 'line-clamp-2 max-w-2xl text-sm sm:text-base' : 'line-clamp-2 text-sm'}`}>{a.excerpt}</p>}
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-dragon-300">Read more <ArrowRight className="h-4 w-4" /></span>
              </div>
            </Link>
          </article>
        ))}

        {count > 1 && (
          <>
            <button type="button" onClick={() => go(i - 1)} aria-label="Previous announcement"
              className="absolute left-3 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-ink-950/60 text-white opacity-0 backdrop-blur transition hover:bg-ink-900 focus-visible:opacity-100 group-hover:opacity-100">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => go(i + 1)} aria-label="Next announcement"
              className="absolute right-3 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-ink-950/60 text-white opacity-0 backdrop-blur transition hover:bg-ink-900 focus-visible:opacity-100 group-hover:opacity-100">
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Resume' : 'Pause'}
            className="grid h-6 w-6 place-items-center rounded-full text-ink-400 hover:text-white">
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
          <div className="flex items-center gap-2" role="tablist" aria-label="Choose announcement">
            {items.map((a, idx) => (
              <button key={a.id} type="button" role="tab" aria-selected={idx === i} aria-label={`Announcement ${idx + 1}`}
                onClick={() => setI(idx)}
                className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-6 bg-dragon-400' : 'w-1.5 bg-ink-600 hover:bg-ink-500'}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
