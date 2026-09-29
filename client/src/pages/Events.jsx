import { Discussion } from '../components/fanzone/FanZone.jsx';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, BellRing, CalendarDays, CalendarPlus, Clock, ExternalLink, Radio, Users } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { formatDateTime, safeUrl, timeAgo } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Badge, LiveDot, Pagination } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';

const STATUS_TONE = { LIVE: 'dragon', CANCELLED: 'default', COMPLETED: 'default', SCHEDULED: 'ember' };

function Banner({ src, className = '' }) {
  const url = safeUrl(src);
  return url
    ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className={`object-cover ${className}`} />
    : <div className={`scales bg-[radial-gradient(80%_120%_at_0%_0%,rgb(217_165_20/.22),transparent_60%),linear-gradient(160deg,#151513,#090909)] ${className}`} aria-hidden="true" />;
}

function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86_400_000), h = Math.floor(ms / 3_600_000) % 24, m = Math.floor(ms / 60_000) % 60, s = Math.floor(ms / 1000) % 60;
  return { d, h, m, s };
}

export function EventCard({ event }) {
  const d = new Date(event.startsAt);
  return (
    <Link to={`/events/${event.slug}`} className="group card card-hover flex flex-col overflow-hidden">
      <div className="relative">
        <Banner src={event.bannerUrl} className="aspect-[16/7] w-full" />
        <div className="absolute left-3 top-3 grid w-14 place-items-center rounded-xl bg-ink-950/85 py-1.5 text-center backdrop-blur">
          <span className="text-[10px] font-bold uppercase tracking-widest text-dragon-400">{d.toLocaleString('en', { month: 'short' })}</span>
          <span className="font-display text-2xl font-bold leading-none text-ink-100">{d.getDate()}</span>
        </div>
        {event.status !== 'SCHEDULED' && <Badge tone={STATUS_TONE[event.status]} className="absolute right-3 top-3">{event.status === 'LIVE' ? '● Live now' : event.status.toLowerCase()}</Badge>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs text-ink-400">{event.category} · {formatDateTime(event.startsAt)}</p>
        <h2 className="mt-1 text-2xl font-bold leading-tight group-hover:text-dragon-300">{event.title}</h2>
        {event.organizer && <p className="mt-auto pt-3 text-xs text-ink-400">Hosted by <span className="text-ink-200">{event.organizer.displayName}</span></p>}
      </div>
    </Link>
  );
}

export function EventsList() {
  usePageTitle('Events');
  const [params, setParams] = useSearchParams();
  const when = params.get('when') === 'past' ? 'past' : 'upcoming';
  const page = Number(params.get('page') ?? 1);
  const q = useQuery({ queryKey: ['events', when, page], queryFn: () => api.get(`/events${qs({ when, page })}`), placeholderData: keepPreviousData });
  return (
    <div className="container-page py-12">
      <header className="mb-8">
        <p className="eyebrow mb-2">Mark your calendar</p>
        <h1 className="text-5xl font-bold uppercase">Events & tournaments</h1>
      </header>
      <div className="mb-8 inline-flex rounded-xl border border-ink-600 p-1" role="tablist">
        {['upcoming', 'past'].map((w) => (
          <button key={w} type="button" role="tab" aria-selected={when === w} onClick={() => setParams(w === 'past' ? { when: 'past' } : {}, { replace: true })}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize ${when === w ? 'bg-dragon-400 text-ink-950' : 'text-ink-300 hover:text-white'}`}>{w}</button>
        ))}
      </div>
      {q.isPending ? <Skeleton className="h-80" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data.data.length === 0 ? (
        <EmptyState icon={CalendarDays} title={when === 'past' ? 'No past events yet' : 'Nothing scheduled right now'}>
          {when === 'past' ? 'Finished events will be archived here.' : 'New races, premieres and community nights will show up here.'}
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{q.data.data.map((e) => <EventCard key={e.id} event={e} />)}</div>
          <Pagination meta={q.data.meta} onPage={(p) => setParams({ ...(when === 'past' && { when }), page: String(p) })} />
        </>
      )}
    </div>
  );
}

function googleCalendarUrl(e) {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = e.endsAt ?? new Date(new Date(e.startsAt).getTime() + 2 * 3600_000);
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${fmt(e.startsAt)}/${fmt(end)}`, details: `${e.description.slice(0, 500)}\n\n${window.location.href}` });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function EventDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['event', slug], queryFn: () => api.get(`/events/${slug}`).then((r) => r.data) });
  const [busy, setBusy] = useState(false);
  usePageTitle(q.data?.title ?? 'Event');
  const countdown = useCountdown(q.data?.startsAt ?? 0);

  if (q.isPending) return <div className="container-page py-12"><Skeleton className="h-96" /></div>;
  if (q.isError) {
    return <div className="container-page py-20">{q.error.status === 404
      ? <EmptyState icon={CalendarDays} title="Event not found" action={<Button to="/events" variant="secondary">All events</Button>}>It may have been removed.</EmptyState>
      : <ErrorState error={q.error} onRetry={q.refetch} />}</div>;
  }
  const e = q.data;
  const upcoming = e.status === 'SCHEDULED' && countdown;
  const toggle = async () => {
    setBusy(true);
    try {
      if (e.viewer.reminder) await api.del(`/events/${e.slug}/reminder`); else await api.put(`/events/${e.slug}/reminder`);
      await qc.invalidateQueries({ queryKey: ['event', slug] });
    } finally { setBusy(false); }
  };

  return (
    <article className="pb-12">
      <div className="relative h-56 overflow-hidden sm:h-80">
        <Banner src={e.bannerUrl} className="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/40 to-transparent" />
      </div>
      <div className="container-page relative -mt-24 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div>
          <Link to="/events" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Events</Link>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ember">{e.category}</Badge>
            {e.status === 'LIVE' && <Badge tone="dragon"><LiveDot /> Live now</Badge>}
            {e.status === 'CANCELLED' && <Badge>Cancelled</Badge>}
            {e.status === 'COMPLETED' && <Badge>Completed</Badge>}
          </div>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-6xl">{e.title}</h1>
          <p className="mt-3 flex items-center gap-2 text-ink-300"><Clock className="h-4 w-4 text-dragon-400" /> {formatDateTime(e.startsAt)}{e.endsAt ? ` – ${formatDateTime(e.endsAt)}` : ''}</p>
          <div className="mt-8 whitespace-pre-line leading-relaxed text-ink-200">{e.description}</div>
          <Discussion type="event" id={e.id} />
        </div>

        <aside className="space-y-4 lg:mt-24">
          {upcoming && (
            <div className="card p-5 text-center">
              <p className="eyebrow mb-3">Starts in</p>
              <div className="grid grid-cols-4 gap-2" aria-live="off">
                {[['d', 'days'], ['h', 'hrs'], ['m', 'min'], ['s', 'sec']].map(([k, l]) => (
                  <div key={k} className="rounded-xl bg-ink-900 py-2"><p className="font-display text-3xl font-bold text-ink-100">{countdown[k]}</p><p className="text-[10px] uppercase tracking-wider text-ink-500">{l}</p></div>
                ))}
              </div>
            </div>
          )}
          <div className="card space-y-2 p-5">
            {e.status !== 'CANCELLED' && e.status !== 'COMPLETED' && (user
              ? <Button className="w-full" variant={e.viewer.reminder ? 'secondary' : 'primary'} loading={busy} onClick={toggle}>
                  {e.viewer.reminder ? <><BellRing className="h-4 w-4 text-dragon-400" /> Reminder set</> : <><Bell className="h-4 w-4" /> Remind me</>}
                </Button>
              : <Button className="w-full" to={`/login?next=${encodeURIComponent(location.pathname)}`}><Bell className="h-4 w-4" /> Sign in for a reminder</Button>)}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" href={`/api/events/${e.slug}/ics`}><CalendarPlus className="h-4 w-4" /> .ics</Button>
              <Button variant="secondary" size="sm" href={googleCalendarUrl(e)}><CalendarDays className="h-4 w-4" /> Google</Button>
            </div>
            {safeUrl(e.streamUrl) && <Button className="w-full" variant="outline" href={e.streamUrl}><Radio className="h-4 w-4" /> Watch stream</Button>}
            {safeUrl(e.externalUrl) && <Button className="w-full" variant="ghost" href={e.externalUrl}><ExternalLink className="h-4 w-4" /> More info</Button>}
            <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-ink-400"><Users className="h-3.5 w-3.5" /> {e.stats.reminders} {e.stats.reminders === 1 ? 'person' : 'people'} reminded</p>
          </div>
          {e.organizer && (
            <Link to={`/members/${e.organizer.slug}`} className="card card-hover flex items-center gap-3 p-4">
              <Avatar src={e.organizer.avatarUrl} name={e.organizer.displayName} accent={e.organizer.accentColor} size="sm" />
              <div><p className="text-xs text-ink-400">Hosted by</p><p className="font-display text-lg font-bold text-ink-100">{e.organizer.displayName}</p></div>
            </Link>
          )}
        </aside>
      </div>
      <p className="sr-only">Starts {timeAgo(e.startsAt)}</p>
    </article>
  );
}
