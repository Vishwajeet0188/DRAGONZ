// Fan Zone pages: hub (/fan-zone), Quote Wall (/quotes), Clip of the Week (/clip-of-the-week), Join the crew (/join).
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, ExternalLink, Flame, Image as ImageIcon, Plus, Quote as QuoteIcon, Shield, Sparkles, Swords, Trophy, Vote } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { formatDate, formatDateTime, safeUrl, timeAgo, titleCase } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { useSiteSettings } from '../lib/site.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Pagination } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, FormAlert } from '../components/ui/Field.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { Leaderboard, PollCard, ProgressCard, QuoteCard } from '../components/fanzone/FanZone.jsx';

function PageHead({ eyebrow, title, children, action }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h1 className="text-5xl font-bold uppercase">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-ink-300">{children}</p>}
      </div>
      {action}
    </header>
  );
}

const loginFor = (path) => `/login?next=${encodeURIComponent(path)}`;

// ── Hub ─────────────────────────────────────────────────────────────────
const XP_ROWS = [
  ['DAILY_CHECKIN', 'Visit daily (check-in)'], ['STREAK_BONUS', 'Every 7-day streak'], ['VERIFY_EMAIL', 'Verify your email'],
  ['FOLLOW', 'Follow a creator'], ['POLL_VOTE', 'Vote in a poll'], ['CLIP_VOTE', 'Vote for Clip of the Week'],
  ['REACTION', 'React to a post (max 20/day)'], ['COMMENT', 'Comment (max 10/day)'], ['SHOWCASE_APPROVED', 'Showcase post approved'],
  ['QUOTE_APPROVED', 'Quote added to the wall'], ['CLIP_WIN', 'Win Clip of the Week'],
];

export function FanZoneHub() {
  usePageTitle('Fan Zone');
  const { user } = useAuth();
  const [tab, setTab] = useState('open');
  const polls = useQuery({ queryKey: ['polls', tab], queryFn: () => api.get(`/polls?status=${tab}`).then((r) => r.data), placeholderData: keepPreviousData });
  const board = useQuery({ queryKey: ['leaderboard', 20], queryFn: () => api.get('/fans/leaderboard?limit=20').then((r) => r.data) });
  const guide = useQuery({ queryKey: ['fan-guide'], queryFn: () => api.get('/fans/guide').then((r) => r.data), staleTime: 3_600_000 });

  return (
    <div className="container-page py-12">
      <PageHead eyebrow="Earn XP · level up · get on the board" title="Fan Zone">
        Vote in polls, pick the Clip of the Week, drop quotes on the wall and check in daily. Every action earns XP — climb from Hatchling to Dragon Lord.
      </PageHead>

      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        {[
          { to: '/clip-of-the-week', icon: Clapperboard, title: 'Clip of the Week', text: 'Vote for the best community clip' },
          { to: '/quotes', icon: QuoteIcon, title: 'Quote Wall', text: 'Legendary lines from the city' },
          { to: '/join', icon: Swords, title: 'Join the crew', text: 'Think you’ve got what it takes?' },
        ].map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} className="card card-hover group flex items-center gap-4 p-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-dragon-500/15 text-dragon-300"><Icon className="h-6 w-6" aria-hidden="true" /></span>
            <span><span className="block font-display text-xl font-bold text-ink-100 group-hover:text-white">{title}</span><span className="text-sm text-ink-400">{text}</span></span>
          </Link>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <section aria-labelledby="polls-h">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="polls-h" className="flex items-center gap-2 text-2xl font-bold"><Vote className="h-5 w-5 text-dragon-400" aria-hidden="true" /> Polls & predictions</h2>
              <div className="flex gap-1.5" role="tablist">
                {[['open', 'Open'], ['closed', 'Results']].map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${tab === k ? 'border-dragon-500 bg-dragon-500/15 text-white' : 'border-ink-600 text-ink-300 hover:text-white'}`}>{l}</button>
                ))}
              </div>
            </div>
            {polls.isPending ? <Skeleton className="h-64" /> : polls.isError ? <ErrorState error={polls.error} onRetry={polls.refetch} /> : polls.data.length === 0 ? (
              <EmptyState icon={Vote} title={tab === 'open' ? 'No open polls right now' : 'No results yet'}>The crew drops new polls before big events and story arcs. Check back soon.</EmptyState>
            ) : <div className="grid gap-4 md:grid-cols-2">{polls.data.map((p) => <PollCard key={p.id} poll={p} />)}</div>}
          </section>

          {guide.data && (
            <section aria-labelledby="guide-h" className="card p-5 sm:p-6">
              <h2 id="guide-h" className="mb-4 flex items-center gap-2 text-2xl font-bold"><Sparkles className="h-5 w-5 text-dragon-400" aria-hidden="true" /> How XP works</h2>
              <div className="grid gap-6 md:grid-cols-2">
                <table className="w-full text-sm">
                  <caption className="sr-only">XP per action</caption>
                  <tbody className="divide-y divide-ink-700/70">
                    {XP_ROWS.map(([k, l]) => (
                      <tr key={k}><td className="py-2 text-ink-300">{l}</td><td className="py-2 text-right font-display text-base font-bold text-dragon-300">+{guide.data.xp[k]}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-400">Levels</p>
                  <ol className="grid grid-cols-2 gap-1.5 text-sm">
                    {guide.data.levels.map((lv, i) => (
                      <li key={lv.name} className="flex justify-between rounded-lg bg-ink-900/60 px-2.5 py-1.5"><span className="text-ink-200">{i + 1}. {lv.name}</span><span className="text-ink-500">{lv.min.toLocaleString('en-IN')}</span></li>
                    ))}
                  </ol>
                  <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-ink-400">Badges to collect</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {guide.data.badges.map((b) => <li key={b.key} title={b.description} className="rounded-lg border border-ink-700 px-2 py-1 text-xs text-ink-300"><span aria-hidden="true">{b.icon}</span> {b.name}</li>)}
                  </ul>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card p-5" aria-labelledby="me-h">
            <h2 id="me-h" className="mb-4 flex items-center gap-2 text-xl font-bold"><Flame className="h-4 w-4 text-ember-400" aria-hidden="true" /> Your progress</h2>
            {user ? <ProgressCard /> : (
              <div className="text-sm text-ink-300">
                <p>Create a free account to start earning XP, collect badges and appear on the leaderboard.</p>
                <div className="mt-4 flex gap-2"><Button to="/register" size="sm">Join free</Button><Button to={loginFor('/fan-zone')} size="sm" variant="secondary">Sign in</Button></div>
              </div>
            )}
          </section>
          <section className="card p-5" aria-labelledby="lb-h">
            <h2 id="lb-h" className="mb-4 flex items-center gap-2 text-xl font-bold"><Trophy className="h-4 w-4 text-dragon-400" aria-hidden="true" /> Top fans</h2>
            {board.isPending ? <Skeleton className="h-64" /> : <Leaderboard rows={board.data} />}
            {user && <p className="mt-4 text-xs text-ink-500">Prefer to stay hidden? Turn off “Show me on the leaderboard” in <Link to="/settings" className="text-ink-300 hover:text-white">settings</Link>.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

// ── Quote wall ──────────────────────────────────────────────────────────
function QuoteForm({ onDone }) {
  const { user } = useAuth();
  const members = useQuery({ queryKey: ['member-options-public'], queryFn: () => api.get('/members?pageSize=48').then((r) => r.data), staleTime: 300_000 });
  const [f, setF] = useState({ text: '', memberSlug: '', characterName: '', context: '' });
  const [err, setErr] = useState(null);
  const m = useMutation({
    mutationFn: () => api.post('/quotes', f),
    onSuccess: () => onDone(),
    onError: (e) => setErr(e),
  });
  if (!user.emailVerified) return <FormAlert tone="info">Verify your email first — you can resend the link from your dashboard.</FormAlert>;
  const fe = err?.fieldErrors ?? {};
  return (
    <form className="card grid gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setErr(null); m.mutate(); }}>
      <Field as="textarea" className="sm:col-span-2" label="The quote" value={f.text} maxLength={280} required onChange={(e) => setF({ ...f, text: e.target.value })} error={fe.text} hint={`${f.text.length}/280 — exactly as it was said`} />
      <Field as="select" label="Who said it (crew member)" value={f.memberSlug} onChange={(e) => setF({ ...f, memberSlug: e.target.value })} error={fe.memberSlug}>
        <option value="">— Not sure / someone else —</option>
        {members.data?.map((x) => <option key={x.slug} value={x.slug}>{x.displayName}</option>)}
      </Field>
      <Field label="Character name (optional)" value={f.characterName} maxLength={80} onChange={(e) => setF({ ...f, characterName: e.target.value })} error={fe.characterName} />
      <Field className="sm:col-span-2" label="Context (optional)" placeholder="e.g. After the bank heist went wrong, 12 Sep stream" value={f.context} maxLength={140} onChange={(e) => setF({ ...f, context: e.target.value })} error={fe.context} />
      {err && !Object.keys(fe).length && <div className="sm:col-span-2"><FormAlert>{err.message}</FormAlert></div>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={m.isPending}>Submit for review</Button>
        <Button type="button" variant="ghost" onClick={() => onDone(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export function QuotesPage() {
  usePageTitle('Quote Wall');
  const { user } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [thanks, setThanks] = useState(false);
  const key = ['quotes', page];
  const q = useQuery({ queryKey: key, queryFn: () => api.get(`/quotes${qs({ page })}`), placeholderData: keepPreviousData });
  const mine = useQuery({ queryKey: ['my-quotes'], queryFn: () => api.get('/quotes/mine').then((r) => r.data), enabled: Boolean(user) });
  const pending = mine.data?.filter((x) => x.status === 'PENDING') ?? [];

  return (
    <div className="container-page py-12">
      <PageHead eyebrow="Straight from the city" title="Quote Wall"
        action={user ? !adding && <Button onClick={() => { setAdding(true); setThanks(false); }}><Plus className="h-4 w-4" /> Add a quote</Button> : <Button to={loginFor('/quotes')}><Plus className="h-4 w-4" /> Sign in to add</Button>}>
        The funniest, coldest and most legendary lines from Dragonz streams. Heard something iconic? Submit it — approved quotes earn you +15 XP.
      </PageHead>
      {thanks && <div className="mb-6"><FormAlert tone="success">Thanks! Your quote is waiting for a moderator — you’ll get a notification when it’s on the wall.</FormAlert></div>}
      {adding && <div className="mb-8"><QuoteForm onDone={(ok = true) => { setAdding(false); if (ok) { setThanks(true); mine.refetch(); } }} /></div>}
      {pending.length > 0 && <p className="mb-6 text-sm text-ink-400">You have {pending.length} quote{pending.length === 1 ? '' : 's'} waiting for review.</p>}

      {q.isPending ? <Skeleton className="h-96" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data.data.length === 0 ? (
        <EmptyState icon={QuoteIcon} title="The wall is empty — for now">Be the first to immortalise a legendary line.</EmptyState>
      ) : (
        <>
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
            {q.data.data.map((quote) => (
              <QuoteCard key={quote.id} quote={quote} showReactions
                onReactions={(s) => qc.setQueryData(key, (old) => old && { ...old, data: old.data.map((x) => (x.id === quote.id ? { ...x, reactions: s } : x)) })} />
            ))}
          </div>
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      )}
    </div>
  );
}

// ── Clip of the Week ────────────────────────────────────────────────────
function useCountdown(to) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, new Date(to).getTime() - now);
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return d ? `${d}d ${h}h` : `${h}h ${m}m`;
}

function ClipThumb({ c, className = '' }) {
  const img = safeUrl(c.previewUrl);
  return img ? <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" className={`w-full object-cover ${className}`} />
    : <div className={`scales grid w-full place-items-center bg-ink-800 ${className}`}><ImageIcon className="h-8 w-8 text-ink-500" aria-hidden="true" /></div>;
}

export function ClipOfTheWeek() {
  usePageTitle('Clip of the Week');
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['clip-week'], queryFn: () => api.get('/clips/week').then((r) => r.data), refetchInterval: 120_000 });
  const winners = useQuery({ queryKey: ['clip-winners'], queryFn: () => api.get('/clips/winners').then((r) => r.data) });
  const [err, setErr] = useState('');
  const vote = useMutation({
    mutationFn: (submissionId) => api.post('/clips/week/vote', { submissionId }),
    onSuccess: () => { setErr(''); qc.invalidateQueries({ queryKey: ['clip-week'] }); qc.invalidateQueries({ queryKey: ['my-progress'] }); },
    onError: (e) => setErr(e.message),
  });
  const left = useCountdown(q.data?.endsAt ?? Date.now());

  return (
    <div className="container-page py-12">
      <PageHead eyebrow={q.data ? `Week ${q.data.weekKey.split('-W')[1]} · voting closes in ${left}` : 'Weekly community vote'} title="Clip of the Week"
        action={<Button to="/community?submit=1" variant="secondary"><Plus className="h-4 w-4" /> Submit a clip</Button>}>
        Every approved community clip, edit or moment from the last 60 days is in the running. One vote per week (you can change it). The winner gets featured, +100 XP and the Clip Champion badge.
      </PageHead>

      {q.data?.lastWinner && (
        <section className="card relative mb-10 grid overflow-hidden md:grid-cols-[1.2fr_1fr]" aria-label="Last week's winner">
          <ClipThumb c={q.data.lastWinner.submission} className="aspect-video h-full" />
          <div className="relative p-6">
            <div className="absolute inset-0 bg-[radial-gradient(80%_120%_at_100%_0%,rgb(217_165_20/.2),transparent)]" aria-hidden="true" />
            <div className="relative">
              <Badge tone="dragon"><Trophy className="h-3 w-3" /> Winner · {q.data.lastWinner.weekKey}</Badge>
              <h2 className="mt-3 text-3xl font-bold">{q.data.lastWinner.submission.title}</h2>
              <p className="mt-1 text-sm text-ink-400">by {q.data.lastWinner.submission.authorName} · {q.data.lastWinner.votes} vote{q.data.lastWinner.votes === 1 ? '' : 's'}</p>
              {safeUrl(q.data.lastWinner.submission.externalUrl) && <Button className="mt-5" href={q.data.lastWinner.submission.externalUrl}><ExternalLink className="h-4 w-4" /> Watch</Button>}
            </div>
          </div>
        </section>
      )}

      {err && <div className="mb-4"><FormAlert>{err}</FormAlert></div>}
      {!user && <div className="mb-6"><FormAlert tone="info"><Link to={loginFor(location.pathname)} className="font-semibold underline">Sign in</Link> to vote — it takes 10 seconds and earns you XP.</FormAlert></div>}

      {q.isPending ? <Skeleton className="h-96" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data.candidates.length === 0 ? (
        <EmptyState icon={Clapperboard} title="No clips in the running yet" action={<Button to="/community?submit=1">Submit the first clip</Button>}>Share a clip, edit or moment in the Community showcase — once approved it joins this week’s vote.</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.candidates.map((c, i) => {
            const mine = q.data.myVote === c.id;
            const pct = q.data.totalVotes ? Math.round((c.votes / q.data.totalVotes) * 100) : 0;
            return (
              <article key={c.id} className={`card flex flex-col overflow-hidden ${mine ? 'border-dragon-500/60' : ''}`}>
                <div className="relative">
                  <ClipThumb c={c} className="aspect-video" />
                  {i === 0 && c.votes > 0 && <span className="absolute left-2 top-2"><Badge tone="dragon"><Flame className="h-3 w-3" /> Leading</Badge></span>}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="mb-1"><Badge>{titleCase(c.type)}</Badge></div>
                  <h3 className="line-clamp-2 font-display text-xl font-bold leading-tight">{c.title}</h3>
                  <p className="text-xs text-ink-400">by {c.authorName}{c.memberName ? ` · ft. ${c.memberName}` : ''} · {timeAgo(c.createdAt)}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-800" aria-hidden="true"><div className="h-full rounded-full bg-dragon-400" style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1 text-xs text-ink-400">{c.votes} vote{c.votes === 1 ? '' : 's'} · {pct}%</p>
                  <div className="mt-auto flex gap-2 pt-4">
                    {user && <Button size="sm" className="flex-1" variant={mine ? 'secondary' : 'primary'} disabled={mine} loading={vote.isPending && vote.variables === c.id} onClick={() => vote.mutate(c.id)}>{mine ? '✓ Your vote' : 'Vote'}</Button>}
                    {safeUrl(c.externalUrl) && <Button size="sm" variant="ghost" href={c.externalUrl} aria-label={`Watch ${c.title}`}><ExternalLink className="h-4 w-4" /> Watch</Button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {winners.data?.length > 1 && (
        <section className="mt-14" aria-labelledby="past-h">
          <h2 id="past-h" className="mb-4 text-2xl font-bold">Past winners</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {winners.data.slice(1).map((w) => (
              <a key={w.weekKey} href={safeUrl(w.submission.externalUrl) ?? '/community'} target={safeUrl(w.submission.externalUrl) ? '_blank' : undefined} rel="noopener noreferrer" className="card card-hover overflow-hidden">
                <ClipThumb c={w.submission} className="aspect-video" />
                <div className="p-3"><p className="text-xs text-dragon-300">{w.weekKey}</p><p className="line-clamp-1 font-semibold text-ink-100">{w.submission.title}</p><p className="text-xs text-ink-500">by {w.submission.authorName}</p></div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Join the crew ───────────────────────────────────────────────────────
const STATUS = {
  PENDING: { tone: 'default', label: 'Received', text: 'We’ve got your application. The crew reviews applications regularly.' },
  REVIEWING: { tone: 'ember', label: 'In review', text: 'The crew is looking at your application right now.' },
  ACCEPTED: { tone: 'success', label: 'Accepted', text: 'Welcome to the Dragonz! Check the message below for next steps.' },
  REJECTED: { tone: 'default', label: 'Not this time', text: 'Thanks for applying. Keep being part of the community — you can apply again later.' },
  WITHDRAWN: { tone: 'default', label: 'Withdrawn', text: 'You withdrew this application.' },
};

function ApplicationForm({ onDone }) {
  const [f, setF] = useState({ rpName: '', discordTag: '', ageConfirmed: false, experience: '', whyDrz: '', availability: '', clipUrl: '' });
  const [err, setErr] = useState(null);
  const m = useMutation({ mutationFn: () => api.post('/me/application', f), onSuccess: onDone, onError: setErr });
  const fe = err?.fieldErrors ?? {};
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6" onSubmit={(e) => { e.preventDefault(); setErr(null); m.mutate(); }}>
      <Field label="Character / RP name" value={f.rpName} onChange={set('rpName')} required maxLength={80} error={fe.rpName} />
      <Field label="Discord username" value={f.discordTag} onChange={set('discordTag')} required maxLength={60} error={fe.discordTag} hint="So the crew can reach you" />
      <Field as="textarea" className="sm:col-span-2" label="Your RP experience" value={f.experience} onChange={set('experience')} required maxLength={2000} error={fe.experience} hint="Servers, characters, how long you’ve been playing" />
      <Field as="textarea" className="sm:col-span-2" label="Why the Dragonz?" value={f.whyDrz} onChange={set('whyDrz')} required maxLength={2000} error={fe.whyDrz} />
      <Field label="Availability (optional)" placeholder="e.g. Weeknights 9pm–1am IST" value={f.availability} onChange={set('availability')} maxLength={200} error={fe.availability} />
      <Field label="Clip of your RP (optional)" type="url" placeholder="https://…" value={f.clipUrl} onChange={set('clipUrl')} error={fe.clipUrl} />
      <label className="flex items-start gap-2 text-sm text-ink-200 sm:col-span-2">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-dragon-500" checked={f.ageConfirmed} onChange={(e) => setF({ ...f, ageConfirmed: e.target.checked })} required />
        <span>I confirm I am 18 or older.{fe.ageConfirmed && <span className="block text-xs text-dragon-300">{fe.ageConfirmed}</span>}</span>
      </label>
      {err && !Object.keys(fe).length && <div className="sm:col-span-2"><FormAlert>{err.message}</FormAlert></div>}
      <div className="sm:col-span-2"><Button type="submit" loading={m.isPending} size="lg"><Swords className="h-4 w-4" /> Send application</Button></div>
    </form>
  );
}

export function JoinCrew() {
  usePageTitle('Join the crew');
  const { user } = useAuth();
  const { recruitmentOpen, discordUrl } = useSiteSettings();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-application'], queryFn: () => api.get('/me/application').then((r) => r.data), enabled: Boolean(user) });
  const withdraw = useMutation({ mutationFn: () => api.del('/me/application'), onSuccess: () => qc.invalidateQueries({ queryKey: ['my-application'] }) });
  const app = q.data?.application;
  const active = app && ['PENDING', 'REVIEWING'].includes(app.status);
  const canApply = q.data?.recruitmentOpen && (!app || app.status === 'WITHDRAWN' || (app.status === 'REJECTED' && (!q.data.canReapplyAt || new Date(q.data.canReapplyAt) <= new Date())));

  let body;
  if (!user) {
    body = (
      <div className="card p-6">
        <p className="text-ink-200">{recruitmentOpen ? 'Recruitment is open!' : 'Recruitment is closed right now, but you can create an account so you’re ready when it opens.'} Sign in or create a free account to apply.</p>
        <div className="mt-4 flex gap-2"><Button to={loginFor('/join')}>Sign in</Button><Button to="/register" variant="secondary">Create account</Button></div>
      </div>
    );
  } else if (q.isPending) body = <Skeleton className="h-64" />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={q.refetch} />;
  else {
    body = (
      <div className="space-y-6">
        {app && app.status !== 'WITHDRAWN' && (
          <section className="card p-6" aria-label="Your application">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold">Your application</h2>
              <Badge tone={STATUS[app.status].tone}>{STATUS[app.status].label}</Badge>
              <span className="text-xs text-ink-500">sent {formatDate(app.createdAt)}</span>
            </div>
            <p className="mt-2 text-sm text-ink-300">{STATUS[app.status].text}</p>
            {app.messageToApplicant && <blockquote className="mt-4 rounded-xl border border-dragon-500/30 bg-dragon-500/10 p-4 text-sm text-ink-100"><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-dragon-300">Message from the crew</p>{app.messageToApplicant}</blockquote>}
            {app.status === 'ACCEPTED' && safeUrl(discordUrl) && <Button className="mt-4" href={discordUrl}>Open Discord</Button>}
            {app.status === 'REJECTED' && q.data.canReapplyAt && new Date(q.data.canReapplyAt) > new Date() && <p className="mt-3 text-xs text-ink-500">You can apply again from {formatDateTime(q.data.canReapplyAt)}.</p>}
            {active && <Button className="mt-4" variant="ghost" size="sm" loading={withdraw.isPending} onClick={() => withdraw.mutate()}>Withdraw application</Button>}
          </section>
        )}
        {canApply && (user.emailVerified ? <ApplicationForm onDone={() => qc.invalidateQueries({ queryKey: ['my-application'] })} />
          : <FormAlert tone="info">Verify your email before applying — you can resend the link from your <Link to="/dashboard" className="underline">dashboard</Link>.</FormAlert>)}
        {!q.data.recruitmentOpen && !active && app?.status !== 'ACCEPTED' && (
          <EmptyState icon={Shield} title="Recruitment is closed right now">Follow the crew, stay active in the Fan Zone and watch the announcements — we’ll open applications again soon.</EmptyState>
        )}
      </div>
    );
  }

  return (
    <div className="container-page max-w-4xl py-12">
      <PageHead eyebrow={recruitmentOpen ? '● Recruitment open' : 'Recruitment'} title="Join the crew">
        The Dragonz are always looking for committed, creative roleplayers. Tell us who you are — every application is read by the crew.
      </PageHead>
      <ul className="mb-8 grid gap-3 text-sm sm:grid-cols-3">
        {[['1', 'Apply', 'Tell us about your RP and why DRZ.'], ['2', 'Review', 'The crew reads it and may reach out on Discord.'], ['3', 'Decision', 'You get a notification + email either way.']].map(([n, t, d]) => (
          <li key={n} className="card flex gap-3 p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-dragon-500/15 font-display font-bold text-dragon-300">{n}</span><span><b className="block text-ink-100">{t}</b><span className="text-ink-400">{d}</span></span></li>
        ))}
      </ul>
      {body}
    </div>
  );
}
