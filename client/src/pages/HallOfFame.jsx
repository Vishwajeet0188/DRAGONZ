import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Crown, Trophy, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { compact, formatDate, safeUrl, titleCase } from '../lib/format.js';
import { PLATFORM_META } from '../lib/platforms.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { Avatar } from '../components/ui/Avatar.jsx';
import { BrandMark } from '../components/ui/Logo.jsx';
import { Badge } from '../components/ui/Bits.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';

const byYear = (items) => Object.entries(items.reduce((acc, a) => {
  const y = new Date(a.achievedAt).getFullYear();
  (acc[y] ??= []).push(a);
  return acc;
}, {})).sort(([a], [b]) => b - a);

export default function HallOfFame() {
  usePageTitle('Hall of Fame');
  const q = useQuery({ queryKey: ['hall-of-fame'], queryFn: () => api.get('/hall-of-fame').then((r) => r.data) });

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(70%_100%_at_50%_0%,rgb(217_165_20/.16),transparent_62%),linear-gradient(180deg,#161019,transparent)]" />
        <BrandMark className="absolute left-1/2 top-[-60px] h-[520px] w-[520px] -translate-x-1/2 opacity-[0.06] blur-[1px]" imgClassName="h-full w-full object-contain" eager />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-dragon-500/40 to-transparent" />
      </div>
      <div className="container-page relative py-12">
      <header className="mb-12 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-dragon-500/40 bg-ink-900/70 shadow-[0_0_40px_-10px_rgb(217_165_20/.6)]"><Crown className="h-7 w-7 text-dragon-300" aria-hidden="true" /></span>
        <p className="eyebrow mt-4">Written in history</p>
        <h1 className="mt-1 font-display text-5xl font-bold uppercase sm:text-7xl">Hall of <span className="text-dragon-300">Fame</span></h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-300">Tournament wins, legendary nights, milestones and the moments that built DRZ.</p>
      </header>

      {q.isPending ? <Skeleton className="h-96" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <div className="grid gap-12 lg:grid-cols-[1fr_340px]">
          <section aria-labelledby="timeline-h">
            <h2 id="timeline-h" className="sr-only">Timeline</h2>
            {q.data.achievements.length === 0 ? <EmptyState icon={Trophy} title="The story starts soon">Achievements added by admins appear here as a timeline.</EmptyState> : (
              <ol className="relative border-l border-dragon-700/60 pl-8">
                {byYear(q.data.achievements)
                  .map(([year, items]) => (
                    <li key={year} className="mb-10">
                      <p className="-ml-[54px] mb-4 inline-flex rounded-full border border-dragon-500/40 bg-ink-900 px-3 py-1 font-display text-lg font-bold text-dragon-300">{year}</p>
                      <ul className="space-y-5">
                        {items.map((a) => (
                          <li key={a.id} className="relative">
                            <span className="absolute -left-[41px] top-5 h-4 w-4 rounded-full border-2 border-dragon-400 bg-ink-900 shadow-[0_0_12px_rgb(255_202_40/.5)]" aria-hidden="true" />
                            <article className={`group card overflow-hidden transition duration-300 hover:border-dragon-500/40 ${a.isFeatured ? 'border-dragon-500/40 shadow-[0_28px_80px_-40px_rgb(217_165_20/.55)]' : ''}`}>
                              {safeUrl(a.imageUrl) && a.isFeatured ? (
                                <div className="relative aspect-[16/10] overflow-hidden bg-ink-950">
                                  <img src={a.imageUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl" />
                                  <img src={a.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="relative z-10 mx-auto h-full w-full object-contain" />
                                  <div className="absolute inset-0 z-20 bg-gradient-to-t from-ink-950 via-ink-950/35 to-transparent" aria-hidden="true" />
                                  <span className="absolute right-3 top-3 z-30 inline-flex items-center gap-1 rounded-lg bg-dragon-400 px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider text-ink-950"><Crown className="h-3 w-3" /> Featured</span>
                                  <div className="absolute inset-x-0 bottom-0 z-30 p-5">
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
                                      <Badge tone="ember">{titleCase(a.category)}</Badge>
                                      <time dateTime={a.achievedAt}>{formatDate(a.achievedAt)}</time>
                                    </div>
                                    <h3 className="mt-2 font-display text-2xl font-bold leading-tight text-white sm:text-3xl">{a.title}</h3>
                                  </div>
                                </div>
                              ) : (
                                safeUrl(a.imageUrl) && (
                                  <div className="relative aspect-video overflow-hidden bg-ink-950">
                                    <img src={a.imageUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />
                                    <img src={a.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="relative z-10 mx-auto h-full object-contain" />
                                  </div>
                                )
                              )}
                              <div className="p-5">
                                {!(safeUrl(a.imageUrl) && a.isFeatured) && (
                                  <>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
                                      <Badge tone="ember">{titleCase(a.category)}</Badge>
                                      <time dateTime={a.achievedAt}>{formatDate(a.achievedAt)}</time>
                                    </div>
                                    <h3 className="mt-2 text-2xl font-bold leading-tight">{a.title}</h3>
                                  </>
                                )}
                                {a.description && <p className={(safeUrl(a.imageUrl) && a.isFeatured) ? 'text-ink-300' : 'mt-2 text-ink-300'}>{a.description}</p>}
                                {a.member && (
                                  <Link to={`/members/${a.member.slug}`} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-ink-700 py-1.5 pl-1.5 pr-3 text-sm text-ink-200 hover:border-dragon-500/50 hover:text-white">
                                    <Avatar src={a.member.avatarUrl} name={a.member.displayName} accent={a.member.accentColor} size="sm" className="!h-7 !w-7" /> {a.member.displayName}
                                  </Link>
                                )}
                              </div>
                            </article>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ol>
            )}
          </section>

          <aside aria-labelledby="ms-h">
            <h2 id="ms-h" className="mb-4 flex items-center gap-2 text-2xl font-bold"><TrendingUp className="h-5 w-5 text-dragon-400" /> Creator milestones</h2>
            {q.data.milestones.length === 0 ? <p className="text-sm text-ink-400">No milestones yet.</p> : (
              <ul className="space-y-2">
                {q.data.milestones.map((m) => {
                  const meta = PLATFORM_META[m.platform];
                  return (
                    <li key={m.id}>
                      <Link to={`/members/${m.member?.slug}`} className="card card-hover flex items-center gap-3 p-3">
                        <Avatar src={m.member?.avatarUrl} name={m.member?.displayName} accent={m.member?.accentColor} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink-100">{m.title}</p>
                          <p className="flex items-center gap-1 text-xs text-ink-400">{meta && <meta.Icon className="h-3 w-3" style={{ color: meta.color }} />}{m.member?.displayName} · {formatDate(m.achievedAt, { month: 'short', year: 'numeric' })}</p>
                        </div>
                        {m.value ? <span className="font-display text-xl font-bold text-ink-100">{compact(m.value)}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      )}
      </div>
    </div>
  );
}
