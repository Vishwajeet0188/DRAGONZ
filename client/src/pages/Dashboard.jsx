import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Heart, Mail, Settings as SettingsIcon, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDateTime, safeUrl, timeAgo } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { FormAlert } from '../components/ui/Field.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { LiveDot } from '../components/ui/Bits.jsx';
import { LiveCard, VideoCard } from '../components/media/MediaCards.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';

function VerifyBanner() {
  const [state, setState] = useState(null);
  const resend = async () => {
    setState({ busy: true });
    try {
      await api.post('/auth/resend-verification');
      setState({ tone: 'success', text: 'Verification email sent. Check your inbox (and spam).' });
    } catch (err) {
      setState({ tone: 'error', text: err.message });
    }
  };
  return (
    <div className="card mb-8 flex flex-col gap-3 border-ember-500/40 p-4 sm:flex-row sm:items-center">
      <Mail className="h-5 w-5 shrink-0 text-ember-400" aria-hidden="true" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-ink-100">Verify your email to enable live alerts</p>
        {state?.text ? <FormAlert tone={state.tone}>{state.text}</FormAlert> : <p className="text-ink-400">We sent a link when you signed up.</p>}
      </div>
      <Button variant="secondary" size="sm" onClick={resend} loading={state?.busy}>Resend email</Button>
    </div>
  );
}

function FavouriteCreators() {
  const q = useQuery({ queryKey: ['my-follows'], queryFn: () => api.get('/me/follows').then((r) => r.data) });
  if (q.isPending) return <Skeleton className="h-24" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  if (!q.data.length) {
    return (
      <EmptyState icon={Users} title="You’re not following anyone yet" action={<Button to="/members?creator=true" size="sm" variant="secondary">Find creators</Button>}>
        Follow creators from their profile and you’ll get an alert the moment they go live.
      </EmptyState>
    );
  }
  // Live creators first.
  const list = [...q.data].sort((a, b) => Number(Boolean(b.live)) - Number(Boolean(a.live)));
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {list.map((m) => (
        <li key={m.id}>
          <Link to={`/members/${m.slug}`} className="flex items-center gap-3 rounded-xl border border-ink-700 p-2.5 hover:border-ink-500 hover:bg-ink-800">
            <Avatar src={m.avatarUrl} name={m.displayName} accent={m.accentColor} size="sm" live={Boolean(m.live)} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink-100">{m.displayName}</p>
              <p className="truncate text-xs text-ink-400">{m.live ? <span className="font-semibold text-live">● Live · {m.live.title}</span> : m.rank}</p>
            </div>
            {m.notifyLive ? <Bell className="h-3.5 w-3.5 text-dragon-400" aria-label="Live alerts on" /> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get('/me/notifications'), refetchInterval: 60_000 });
  if (q.isPending) return <Skeleton className="h-24" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const items = q.data.data;
  if (!items.length) return <p className="text-sm text-ink-400">No notifications yet. Follow creators to get live alerts here.</p>;
  return (
    <div>
      {q.data.meta.unread > 0 && (
        <button type="button" className="mb-2 text-xs font-semibold text-dragon-300 hover:text-white"
          onClick={async () => { await api.post('/me/notifications/read', {}); qc.invalidateQueries({ queryKey: ['notifications'] }); }}>
          Mark all as read ({q.data.meta.unread})
        </button>
      )}
      <ul className="space-y-1">
        {items.slice(0, 8).map((n) => (
          <li key={n.id}>
            <a href={safeUrl(n.url)} target="_blank" rel="noopener noreferrer" className={`block rounded-lg p-2 hover:bg-ink-800 ${n.readAt ? 'opacity-60' : ''}`}>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-100">{!n.readAt && <span className="h-1.5 w-1.5 rounded-full bg-live" aria-label="Unread" />}{n.title}</p>
              {n.body && <p className="truncate text-xs text-ink-400">{n.body}</p>}
              <p className="text-[11px] text-ink-500">{timeAgo(n.createdAt)}</p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ title, icon: Icon, to, children }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold">{Icon && <Icon className="h-4 w-4 text-dragon-400" aria-hidden="true" />}{title}</h2>
        {to && <Link to={to} className="text-xs font-semibold text-ink-400 hover:text-white">View all</Link>}
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const [params] = useSearchParams();
  // Phase 1 re-uses the aggregated home feed; Phase 3 adds a personalised /api/users/me/feed.
  const q = useQuery({ queryKey: ['home'], queryFn: () => api.get('/home').then((r) => r.data), refetchInterval: 60_000 });

  return (
    <div className="container-page py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">{params.get('welcome') ? 'Welcome to the Dragonz' : 'Your hub'}</p>
          <h1 className="text-4xl font-bold">Hey, {user.displayName}</h1>
        </div>
        <Button to="/settings" variant="secondary"><SettingsIcon className="h-4 w-4" /> Account settings</Button>
      </header>

      {!user.emailVerified && <VerifyBanner />}

      {q.isPending ? (
        <div className="grid gap-6 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Panel title="My favourite creators" icon={Heart} to="/members?creator=true">
              <FavouriteCreators />
            </Panel>

            <Panel title={<span className="inline-flex items-center gap-2"><LiveDot /> Live now</span>} to="/live">
              {q.data.liveNow.length === 0 ? <p className="text-sm text-ink-400">Nobody is live right now — this updates automatically.</p> : (
                <div className="grid gap-4 sm:grid-cols-2">{q.data.liveNow.slice(0, 4).map((s) => <LiveCard key={s.id} stream={s} />)}</div>
              )}
            </Panel>

            <Panel title="Recent videos" to="/videos">
              <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">{q.data.latestVideos.slice(0, 4).map((v) => <VideoCard key={v.id} video={v} />)}</div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Notifications" icon={Bell}>
              <Notifications />
            </Panel>
            <Panel title="Upcoming events" to="/events">
              {q.data.upcomingEvents.length === 0 ? <p className="text-sm text-ink-400">Nothing scheduled.</p> : (
                <ul className="space-y-3">
                  {q.data.upcomingEvents.map((e) => (
                    <li key={e.id}><Link to={`/events/${e.slug}`} className="block rounded-lg p-2 hover:bg-ink-800"><p className="font-semibold text-ink-100">{e.title}</p><p className="text-xs text-ink-400">{formatDateTime(e.startsAt)}</p></Link></li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Announcements" to="/news">
              {q.data.announcements.length === 0 && <p className="text-sm text-ink-400">No announcements yet.</p>}
              <ul className="space-y-3">
                {q.data.announcements.map((n) => (
                  <li key={n.id}><Link to={`/news/${n.slug}`} className="block rounded-lg p-2 hover:bg-ink-800"><p className="font-semibold text-ink-100">{n.title}</p><p className="text-xs text-ink-400">{timeAgo(n.publishedAt)}</p></Link></li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
