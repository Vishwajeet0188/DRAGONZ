import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Clock, Radio, RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { PLATFORM_META } from '../lib/platforms.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { LiveCard } from '../components/media/MediaCards.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { LiveDot } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { CardGridSkeleton, EmptyState, ErrorState } from '../components/ui/States.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Live() {
  usePageTitle('Live now');
  const { user } = useAuth();
  // Streams are synced from YouTube/Kick on the server; the page just re-reads every 30s.
  const q = useQuery({ queryKey: ['live'], queryFn: () => api.get('/live').then((r) => r.data), refetchInterval: 30_000 });

  return (
    <div className="container-page py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-2"><LiveDot /> Live hub</p>
          <h1 className="text-5xl font-bold uppercase">Who’s live</h1>
          <p className="mt-2 max-w-2xl text-ink-300">Every DRZ creator streaming right now on YouTube and Kick — updated automatically.</p>
        </div>
        {q.data?.sync?.lastRunAt && (
          <p className="flex items-center gap-1.5 text-xs text-ink-400" aria-live="polite">
            <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" /> Checked {timeAgo(q.data.sync.lastRunAt)}
          </p>
        )}
      </header>

      {q.isPending ? <CardGridSkeleton count={6} className="h-72" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          {q.data.live.length === 0 ? (
            <EmptyState icon={Radio} title="Nobody’s live right now"
              action={user ? <Button to="/members?creator=true" variant="secondary" size="sm">Follow creators for alerts</Button> : <Button to="/register" size="sm">Get live alerts</Button>}>
              This page updates by itself. Follow your favourite creators and we’ll tell you the moment they go live.
            </EmptyState>
          ) : (
            <>
              <p className="mb-4 text-sm text-ink-300"><span className="font-semibold text-live">{q.data.live.length}</span> {q.data.live.length === 1 ? 'creator is' : 'creators are'} live</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {q.data.live.map((s) => <LiveCard key={s.id} stream={s} />)}
              </div>
            </>
          )}

          {q.data.recentlyEnded.length > 0 && (
            <section className="mt-14" aria-labelledby="recent-h">
              <h2 id="recent-h" className="mb-4 flex items-center gap-2 text-2xl font-bold"><Clock className="h-5 w-5 text-ink-400" aria-hidden="true" /> Recently live</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {q.data.recentlyEnded.map((s) => {
                  const meta = PLATFORM_META[s.platform];
                  return (
                    <li key={s.id}>
                      <Link to={`/members/${s.member.slug}`} className="card card-hover flex items-center gap-3 p-3">
                        <Avatar src={s.member.avatarUrl} name={s.member.displayName} accent={s.member.accentColor} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-lg font-bold leading-tight text-ink-100">{s.member.displayName}</p>
                          <p className="truncate text-xs text-ink-400">{s.title}</p>
                        </div>
                        <span className="shrink-0 text-right text-[11px] text-ink-500">
                          {meta && <meta.Icon className="ml-auto h-3.5 w-3.5" style={{ color: meta.color }} aria-label={meta.label} />}
                          ended {timeAgo(s.endedAt)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
