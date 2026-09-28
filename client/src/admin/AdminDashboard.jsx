import { useQuery } from '@tanstack/react-query';
import { Calendar, Heart, Image as ImageIcon, Radio, Sparkles, UserPlus, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { ErrorState, Skeleton } from '../components/ui/States.jsx';
import { AdminHeader } from './ui.jsx';

const CARDS = [
  ['members', 'Members', Users],
  ['creators', 'Creators', Sparkles],
  ['users', 'Registered users', UserPlus],
  ['liveNow', 'Live now', Radio],
  ['pendingSubmissions', 'Pending submissions', ImageIcon],
  ['upcomingEvents', 'Upcoming events', Calendar],
  ['follows', 'Creator follows', Heart],
];

export default function AdminDashboard() {
  const q = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.get('/admin/stats').then((r) => r.data), refetchInterval: 60_000 });
  return (
    <>
      <AdminHeader title="Dashboard" desc="A snapshot of Dragonz Central." />
      {q.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{CARDS.map(([k]) => <Skeleton key={k} className="h-28" />)}</div>
      ) : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {CARDS.map(([k, label, Icon]) => (
              <div key={k} className="card p-5">
                <div className="flex items-center justify-between text-ink-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <p className={`mt-3 font-display text-4xl font-bold ${k === 'liveNow' && q.data.totals[k] ? 'text-live' : 'text-ink-100'}`}>{q.data.totals[k]}</p>
              </div>
            ))}
          </div>
          <section className="card mt-6 p-5">
            <h2 className="mb-4 text-xl font-bold">Recent activity</h2>
            {q.data.recentActivity.length === 0 ? <p className="text-sm text-ink-400">No admin activity yet.</p> : (
              <ul className="divide-y divide-ink-700/70">
                {q.data.recentActivity.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span><span className="font-semibold text-ink-100">{a.actorName ?? 'System'}</span> <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs text-ember-400">{a.action}</code></span>
                    <span className="text-xs text-ink-500">{timeAgo(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
