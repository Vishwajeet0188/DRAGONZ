import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Crown, Trophy, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { compact, formatDate, safeUrl, titleCase } from '../lib/format.js';
import { PLATFORM_META } from '../lib/platforms.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { Avatar } from '../components/ui/Avatar.jsx';
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
    <div className="container-page py-12">
      <header className="mb-12 text-center">
        <Crown className="mx-auto h-8 w-8 text-dragon-400" aria-hidden="true" />
        <p className="eyebrow mt-3">Written in history</p>
        <h1 className="mt-1 text-5xl font-bold uppercase sm:text-6xl">Hall of Fame</h1>
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
                            <article className={`card overflow-hidden ${a.isFeatured ? 'border-dragon-500/40' : ''}`}>
                              {safeUrl(a.imageUrl) && <img src={a.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[21/9] w-full object-cover" />}
                              <div className="p-5">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
                                  <Badge tone="ember">{titleCase(a.category)}</Badge>
                                  <time dateTime={a.achievedAt}>{formatDate(a.achievedAt)}</time>
                                </div>
                                <h3 className="mt-2 text-2xl font-bold leading-tight">{a.title}</h3>
                                {a.description && <p className="mt-2 text-ink-300">{a.description}</p>}
                                {a.member && (
                                  <Link to={`/members/${a.member.slug}`} className="mt-3 inline-flex items-center gap-2 text-sm text-ink-300 hover:text-white">
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
  );
}
