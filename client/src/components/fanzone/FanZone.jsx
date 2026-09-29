// Shared Fan Zone pieces: polls, reactions & comments, leaderboard, levels/badges, quotes, celebrations, daily check-in toast.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cake, CheckCircle2, Crown, Flame, MessageCircle, PartyPopper, Quote as QuoteIcon, Send, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { formatDate, timeAgo } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { FormAlert } from '../ui/Field.jsx';

export const EMOJI = { fire: '🔥', heart: '❤️', laugh: '😂', wow: '😮', dragon: '🐉' };
const EMOJI_LABEL = { fire: 'Fire', heart: 'Love', laugh: 'Haha', wow: 'Wow', dragon: 'Dragon' };

// ── Levels & badges ─────────────────────────────────────────────────────
export function LevelPill({ name, level, className = '' }) {
  if (!name) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border border-dragon-500/30 bg-dragon-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dragon-300 ${className}`}>
      {level ? `Lv ${level} · ` : ''}{name}
    </span>
  );
}

export function BadgeIcons({ badges = [], max = 4 }) {
  if (!badges.length) return null;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Badges: ${badges.map((b) => b.name).join(', ')}`}>
      {badges.slice(0, max).map((b) => <span key={b.key} title={`${b.name} — ${b.description}`} className="text-sm leading-none">{b.icon}</span>)}
      {badges.length > max && <span className="ml-0.5 text-[10px] text-ink-400">+{badges.length - max}</span>}
    </span>
  );
}

export function XpBar({ xp, min, nextAt }) {
  const pct = nextAt ? Math.min(100, Math.round(((xp - min) / (nextAt - min)) * 100)) : 100;
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress to next level">
      <div className="h-full rounded-full bg-gradient-to-r from-dragon-600 to-dragon-300 transition-[width] duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Signed-in fan's level, XP bar, streak, rank and badges. */
export function ProgressCard({ compact = false }) {
  const q = useQuery({ queryKey: ['my-progress'], queryFn: () => api.get('/me/progress').then((r) => r.data) });
  if (q.isPending) return <div className="h-40 animate-pulse rounded-2xl bg-ink-800/60" />;
  if (q.isError) return null;
  const p = q.data;
  const earned = p.badges.filter((b) => b.earned);
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-400">Level {p.level}</p>
          <p className="font-display text-3xl font-bold text-dragon-300">{p.name}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold text-ink-100">{p.xp.toLocaleString('en-IN')} <span className="text-sm text-ink-400">XP</span></p>
          {p.rank && <p className="text-xs text-ink-400">#{p.rank} on the leaderboard</p>}
        </div>
      </div>
      <XpBar xp={p.xp} min={p.min} nextAt={p.nextAt} />
      <p className="text-xs text-ink-400">{p.nextAt ? <>{(p.nextAt - p.xp).toLocaleString('en-IN')} XP to <span className="text-ink-200">{p.nextName}</span></> : 'Max level reached. Respect.'}</p>
      <div className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2 text-sm">
        <Flame className={`h-4 w-4 ${p.streak ? 'text-ember-400' : 'text-ink-500'}`} aria-hidden="true" />
        <span className="text-ink-200">{p.streak ? <><b>{p.streak}-day</b> streak</> : 'Visit daily to start a streak'}</span>
        <span className="ml-auto text-xs text-ink-500">+25 XP every 7 days</span>
      </div>
      {!compact && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-400">Badges · {earned.length}/{p.badges.length}</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3">
            {p.badges.map((b) => (
              <li key={b.key} title={`${b.name} — ${b.description}`}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center ${b.earned ? 'border-dragon-500/40 bg-dragon-500/10' : 'border-ink-700 opacity-40 grayscale'}`}>
                <span className="text-xl" aria-hidden="true">{b.icon}</span>
                <span className="line-clamp-1 text-[10px] font-semibold text-ink-200">{b.name}</span>
                <span className="sr-only">{b.earned ? 'earned' : 'locked'}: {b.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Daily check-in (once per day per browser session) ───────────────────
export function CheckInToast() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!user) return;
    const key = `dz-checkin:${user.id}:${new Date().toDateString()}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* storage blocked: still fine, server dedupes */ }
    api.post('/me/checkin').then((r) => {
      if (r.data.gained > 0) {
        setToast(r.data);
        qc.invalidateQueries({ queryKey: ['my-progress'] });
      }
    }).catch(() => {});
  }, [user, qc]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-fade-up items-center gap-3 rounded-2xl border border-dragon-500/40 bg-ink-900/95 p-3 shadow-2xl backdrop-blur">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-dragon-500/15 text-xl" aria-hidden="true">🔥</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-ink-100">+{toast.gained} XP · daily check-in</p>
        <p className="text-xs text-ink-400">{toast.streak > 1 ? `${toast.streak}-day streak — keep it going!` : 'Come back tomorrow to build a streak.'}</p>
      </div>
      <Link to="/fan-zone" className="text-xs font-semibold text-dragon-300 hover:text-white">Fan Zone</Link>
      <button type="button" onClick={() => setToast(null)} className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-ink-800 hover:text-white" aria-label="Dismiss"><X className="h-4 w-4" /></button>
    </div>
  );
}

// ── Polls ───────────────────────────────────────────────────────────────
function useLoginLink() {
  const location = useLocation();
  return `/login?next=${encodeURIComponent(location.pathname)}`;
}

export function PollCard({ poll, className = '' }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const login = useLoginLink();
  const [data, setData] = useState(poll);
  const [err, setErr] = useState('');
  useEffect(() => setData(poll), [poll]);
  const vote = useMutation({
    mutationFn: (optionId) => api.post(`/polls/${data.id}/vote`, { optionId }).then((r) => r.data),
    onSuccess: (p) => { setData(p); setErr(''); qc.invalidateQueries({ queryKey: ['polls'] }); qc.invalidateQueries({ queryKey: ['my-progress'] }); },
    onError: (e) => setErr(e.message),
  });
  const total = data.options.reduce((s, o) => s + (o.votes ?? 0), 0);
  const leader = data.showResults ? Math.max(...data.options.map((o) => o.votes ?? 0)) : -1;
  return (
    <div className={`card flex flex-col p-5 ${className}`}>
      <div className="mb-1 flex items-center gap-2 text-xs text-ink-400">
        <span className={`inline-flex items-center gap-1 font-semibold uppercase tracking-widest ${data.isOpen ? 'text-emerald-300' : 'text-ink-400'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${data.isOpen ? 'bg-emerald-400' : 'bg-ink-500'}`} aria-hidden="true" />{data.isOpen ? 'Poll open' : 'Poll closed'}
        </span>
        {data.closesAt && data.isOpen && <span>· closes {timeAgo(data.closesAt)}</span>}
        {data.member && <Link to={`/members/${data.member.slug}`} className="ml-auto truncate text-dragon-300 hover:text-white">ft. {data.member.displayName}</Link>}
      </div>
      <h3 className="font-display text-2xl font-bold leading-tight">{data.question}</h3>
      {data.description && <p className="mt-1 text-sm text-ink-400">{data.description}</p>}
      <ul className="mt-4 space-y-2">
        {data.options.map((o) => {
          const pct = data.showResults && total ? Math.round(((o.votes ?? 0) / total) * 100) : 0;
          const mine = data.myVote === o.id;
          if (data.showResults) {
            return (
              <li key={o.id} className={`relative overflow-hidden rounded-xl border px-3 py-2.5 ${mine ? 'border-dragon-500/60' : 'border-ink-700'}`}>
                <div className={`absolute inset-y-0 left-0 ${o.votes === leader && leader > 0 ? 'bg-dragon-500/25' : 'bg-ink-700/50'} transition-[width] duration-700`} style={{ width: `${pct}%` }} aria-hidden="true" />
                <div className="relative flex items-center gap-2 text-sm">
                  <span className="flex-1 font-medium text-ink-100">{o.label}{mine && <CheckCircle2 className="ml-1.5 inline h-4 w-4 text-dragon-300" aria-label="Your vote" />}</span>
                  <span className="font-display text-base font-bold text-ink-100">{pct}%</span>
                </div>
              </li>
            );
          }
          return (
            <li key={o.id}>
              {user ? (
                <button type="button" disabled={vote.isPending} onClick={() => vote.mutate(o.id)}
                  className="w-full rounded-xl border border-ink-600 bg-ink-900/60 px-3 py-2.5 text-left text-sm font-medium text-ink-100 transition hover:border-dragon-500 hover:bg-dragon-500/10 disabled:opacity-60">
                  {o.label}
                </button>
              ) : (
                <Link to={login} className="block w-full rounded-xl border border-ink-600 bg-ink-900/60 px-3 py-2.5 text-sm font-medium text-ink-100 hover:border-dragon-500">{o.label}</Link>
              )}
            </li>
          );
        })}
      </ul>
      {err && <div className="mt-3"><FormAlert>{err}</FormAlert></div>}
      <p className="mt-3 text-xs text-ink-500">
        {data.showResults ? `${data.totalVotes.toLocaleString('en-IN')} vote${data.totalVotes === 1 ? '' : 's'}` : user ? 'Vote to see the results · +5 XP' : 'Sign in to vote and see the results'}
      </p>
    </div>
  );
}

// ── Reactions & comments ────────────────────────────────────────────────
export function ReactionBar({ type, id, summary, onChange, size = 'md' }) {
  const { user } = useAuth();
  const login = useLoginLink();
  const [busy, setBusy] = useState(null);
  const toggle = async (emoji) => {
    if (!user) { window.location.assign(login); return; }
    setBusy(emoji);
    try {
      const mine = summary?.mine?.includes(emoji);
      const r = mine ? await api.del(`/social/${type}/${id}/reactions/${emoji}`) : await api.put(`/social/${type}/${id}/reactions/${emoji}`);
      onChange?.(r.data);
    } catch { /* ignore; counts refresh on next load */ } finally { setBusy(null); }
  };
  const sm = size === 'sm';
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reactions">
      {Object.entries(EMOJI).map(([k, e]) => {
        const n = summary?.counts?.[k] ?? 0;
        const mine = summary?.mine?.includes(k);
        return (
          <button key={k} type="button" onClick={(ev) => { ev.stopPropagation(); toggle(k); }} disabled={busy === k} aria-pressed={Boolean(mine)} aria-label={`${EMOJI_LABEL[k]} (${n})`}
            className={`inline-flex items-center gap-1 rounded-full border font-semibold transition active:scale-95 ${sm ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'} ${mine ? 'border-dragon-500/60 bg-dragon-500/15 text-dragon-200' : 'border-ink-600 bg-ink-900/60 text-ink-300 hover:border-ink-400'}`}>
            <span aria-hidden="true">{e}</span>{n > 0 && <span>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Reactions + comment thread for a news post, event, community post or quote. */
export function Discussion({ type, id, title = 'Reactions & comments' }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const login = useLoginLink();
  const key = ['social', type, id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get(`/social/${type}/${id}`).then((r) => r.data) });
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const post = useMutation({
    mutationFn: () => api.post(`/social/${type}/${id}/comments`, { body }).then((r) => r.data),
    onSuccess: (c) => {
      setBody(''); setErr('');
      qc.setQueryData(key, (old) => old && { ...old, comments: [c, ...old.comments], commentCount: old.commentCount + 1 });
      qc.invalidateQueries({ queryKey: ['my-progress'] });
    },
    onError: (e) => setErr(e.fieldErrors?.body ?? e.message),
  });
  const remove = async (cid) => {
    await api.del(`/social/comments/${cid}`).catch(() => {});
    qc.setQueryData(key, (old) => old && { ...old, comments: old.comments.filter((c) => c.id !== cid), commentCount: old.commentCount - 1 });
  };
  if (q.isError) return null;
  const d = q.data;
  return (
    <section className="mt-10 border-t border-ink-700 pt-6" aria-label={title}>
      <ReactionBar type={type} id={id} summary={d} onChange={(s) => qc.setQueryData(key, (old) => old && { ...old, ...s })} />
      <h2 className="mt-6 flex items-center gap-2 text-xl font-bold"><MessageCircle className="h-5 w-5 text-dragon-400" aria-hidden="true" /> Comments {d ? <span className="text-ink-400">({d.commentCount})</span> : null}</h2>
      {user ? (
        user.emailVerified ? (
          <form className="mt-3" onSubmit={(e) => { e.preventDefault(); if (body.trim()) post.mutate(); }}>
            <label htmlFor={`c-${id}`} className="sr-only">Write a comment</label>
            <div className="flex gap-2">
              <textarea id={`c-${id}`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={2} placeholder="Say something nice to the crew…"
                className="input min-h-0 flex-1 resize-none" />
              <Button type="submit" loading={post.isPending} disabled={!body.trim()} aria-label="Post comment" className="self-end"><Send className="h-4 w-4" /></Button>
            </div>
            <div className="mt-1 flex justify-between text-xs text-ink-500"><span>Be respectful — moderators can hide comments.</span><span>{body.length}/500</span></div>
            {err && <div className="mt-2"><FormAlert>{err}</FormAlert></div>}
          </form>
        ) : <p className="mt-3 text-sm text-ink-400">Verify your email (from your <Link to="/dashboard" className="text-dragon-300 hover:text-white">dashboard</Link>) to join the conversation.</p>
      ) : <p className="mt-3 text-sm text-ink-400"><Link to={login} className="font-semibold text-dragon-300 hover:text-white">Sign in</Link> to react and comment.</p>}
      <ul className="mt-5 space-y-4">
        {q.isPending && <li className="h-16 animate-pulse rounded-xl bg-ink-800/60" />}
        {d?.comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <Avatar src={c.author.avatarUrl} name={c.author.displayName} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-semibold text-ink-100">{c.author.displayName}</span>
                {c.author.isStaff ? <span className="rounded-md bg-ember-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ember-400">Crew staff</span> : <LevelPill name={c.author.levelName} />}
                <span className="text-xs text-ink-500">{timeAgo(c.createdAt)}</span>
                {c.canDelete && <button type="button" onClick={() => remove(c.id)} className="ml-auto text-ink-500 hover:text-red-400" aria-label="Delete comment"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
              <p className="mt-0.5 whitespace-pre-line break-words text-sm text-ink-200">{c.body}</p>
            </div>
          </li>
        ))}
        {d && d.comments.length === 0 && <li className="text-sm text-ink-500">No comments yet — start the conversation.</li>}
      </ul>
    </section>
  );
}

// ── Leaderboard ─────────────────────────────────────────────────────────
const MEDAL = ['text-dragon-300', 'text-ink-200', 'text-ember-400'];
export function Leaderboard({ rows, compact = false }) {
  if (!rows?.length) return <p className="text-sm text-ink-400">No fans on the board yet — vote, react and check in daily to be first.</p>;
  return (
    <ol className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.rank} className={`flex items-center gap-3 rounded-xl px-2 py-2 ${r.rank <= 3 ? 'bg-ink-900/70' : ''}`}>
          <span className={`w-7 text-center font-display text-lg font-bold ${MEDAL[r.rank - 1] ?? 'text-ink-500'}`}>
            {r.rank === 1 ? <Crown className="mx-auto h-5 w-5" aria-label="1st" /> : r.rank}
          </span>
          <Avatar src={r.avatarUrl} name={r.displayName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink-100">{r.displayName}</p>
            <div className="flex items-center gap-2"><LevelPill name={r.name} />{!compact && <BadgeIcons badges={r.badges} />}</div>
          </div>
          <span className="font-display text-base font-bold text-ink-100">{r.xp.toLocaleString('en-IN')}<span className="ml-0.5 text-xs text-ink-500">XP</span></span>
        </li>
      ))}
    </ol>
  );
}

// ── Celebrations ────────────────────────────────────────────────────────
const when = (d) => (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`);
export function Celebrations({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={`${c.kind}-${c.member.slug}`}>
          <Link to={`/members/${c.member.slug}`} className={`flex items-center gap-3 rounded-xl border p-2.5 transition hover:border-ink-500 ${c.inDays === 0 ? 'border-dragon-500/50 bg-dragon-500/10' : 'border-ink-700'}`}>
            <Avatar src={c.member.avatarUrl} name={c.member.displayName} accent={c.member.accentColor} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink-100">{c.member.displayName}</p>
              <p className="text-xs text-ink-400">
                {c.kind === 'birthday' ? 'Birthday' : `${c.years} year${c.years === 1 ? '' : 's'} with the Dragonz`} · {when(c.inDays)}
              </p>
            </div>
            {c.kind === 'birthday' ? <Cake className="h-5 w-5 text-ember-400" aria-hidden="true" /> : <PartyPopper className="h-5 w-5 text-dragon-300" aria-hidden="true" />}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Quotes ──────────────────────────────────────────────────────────────
export function QuoteCard({ quote, showReactions = false, onReactions, className = '' }) {
  return (
    <figure className={`card relative flex flex-col p-5 ${quote.isFeatured ? 'border-dragon-500/40' : ''} ${className}`}>
      <QuoteIcon className="absolute right-4 top-4 h-8 w-8 text-dragon-500/20" aria-hidden="true" />
      <blockquote className="flex-1 font-display text-xl font-bold leading-snug text-ink-100">“{quote.text}”</blockquote>
      <figcaption className="mt-4 flex items-center gap-2 text-sm">
        {quote.member && <Avatar src={quote.member.avatarUrl} name={quote.member.displayName} accent={quote.member.accentColor} size="sm" className="!h-7 !w-7 !rounded-lg" />}
        <div className="min-w-0">
          <p className="truncate font-semibold text-dragon-300">
            {quote.characterName ?? quote.member?.displayName ?? 'Unknown'}
            {quote.characterName && quote.member && <Link to={`/members/${quote.member.slug}`} className="font-normal text-ink-400 hover:text-white"> · {quote.member.displayName}</Link>}
          </p>
          {quote.context && <p className="truncate text-xs text-ink-500">{quote.context}</p>}
        </div>
      </figcaption>
      {showReactions && (
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-ink-700/70 pt-3">
          <ReactionBar type="quote" id={quote.id} summary={quote.reactions} onChange={onReactions} size="sm" />
          {quote.submittedBy && <span className="text-[11px] text-ink-500">via {quote.submittedBy}</span>}
        </div>
      )}
    </figure>
  );
}

export const fmtDay = (d) => formatDate(d, { day: 'numeric', month: 'short' });
