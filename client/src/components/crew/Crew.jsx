// Crew activity UI: card chips, profile goal progress, weekly ranking.
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Crown, Flame, Target, Trophy } from 'lucide-react';
import { api } from '../../lib/api.js';
import { Avatar } from '../ui/Avatar.jsx';

const hrs = (h) => (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10);

function timeLeft(to) {
  const ms = Math.max(0, new Date(to).getTime() - Date.now());
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d ? `${d}d ${h}h left` : `${h}h left`;
}

/** Small chips on a featured member card: only the honours (Streamer of the Week, streak). */
export function CrewChips({ crew }) {
  if (!crew || !(crew.isStreamerOfWeek || crew.streakWeeks >= 2)) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      {crew.isStreamerOfWeek && <span className="inline-flex items-center gap-1 rounded-md bg-dragon-400 px-1.5 py-0.5 text-ink-950"><Crown className="h-3 w-3" aria-hidden="true" /> Streamer of the Week</span>}
      {crew.streakWeeks >= 2 && <span className="inline-flex items-center gap-1 rounded-md border border-ember-500/40 bg-ember-500/10 px-1.5 py-0.5 text-ember-400"><Flame className="h-3 w-3" aria-hidden="true" /> {crew.streakWeeks}-week streak</span>}
    </div>
  );
}

function GoalBar({ label, value, goal, unit = '' }) {
  if (!goal) return null;
  const pct = Math.min(100, Math.round((value / goal) * 100));
  const done = value >= goal;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs"><span className="text-ink-300">{label}</span><span className={done ? 'font-semibold text-emerald-300' : 'text-ink-400'}>{unit === 'h' ? hrs(value) : value}{unit} / {goal}{unit}{done ? ' ✓' : ''}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${done ? 'bg-emerald-400' : 'bg-gradient-to-r from-dragon-600 to-dragon-300'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Profile sidebar: this week's progress towards the Featured-crew goals, streak, crew badges. */
export function CrewProgress({ crew, name }) {
  if (!crew) return null;
  const hasNumbers = Boolean(crew.thisWeek);
  if (!hasNumbers && !crew.badges?.length) return null;
  return (
    <section className="card p-4" aria-labelledby="crew-h">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="crew-h" className="flex items-center gap-2 text-xl font-bold"><Target className="h-4 w-4 text-dragon-400" aria-hidden="true" /> Crew goals</h2>
        {hasNumbers && <span className="text-[11px] text-ink-500">{timeLeft(crew.weekEndsAt)}</span>}
      </div>
      {crew.isStreamerOfWeek && <p className="mb-3 flex items-center gap-2 rounded-xl bg-dragon-500/15 px-3 py-2 text-sm font-semibold text-dragon-200"><Crown className="h-4 w-4" aria-hidden="true" /> Streamer of the Week</p>}
      {hasNumbers && (
        <>
          <div className="space-y-3">
            <GoalBar label="Streams" value={crew.thisWeek.streams} goal={crew.goals.streams} />
            <GoalBar label="Hours streamed" value={crew.thisWeek.hours} goal={crew.goals.hours} unit="h" />
            <GoalBar label="Days streamed" value={crew.thisWeek.days} goal={crew.goals.days} />
            <GoalBar label="New uploads" value={crew.thisWeek.uploads} goal={crew.goals.uploads} />
          </div>
          <p className={`mt-3 text-xs ${crew.qualifiedThisWeek ? 'text-emerald-300' : 'text-ink-400'}`}>
            {crew.qualifiedThisWeek ? `🔥 Goals hit — ${name} is in Featured crew this week!` : 'Hit every goal this week to join Featured crew.'}
          </p>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-ink-700 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 text-ink-300"><Flame className={`h-3.5 w-3.5 ${crew.streakWeeks ? 'text-ember-400' : 'text-ink-500'}`} aria-hidden="true" /> {crew.streakWeeks ? `${crew.streakWeeks}-week streak` : 'No streak yet'}</span>
            <span className="text-ink-500">Last week: {hrs(crew.lastWeek.hours)}h · {crew.lastWeek.streams} streams</span>
          </div>
          {crew.history?.length > 0 && (
            <div className="mt-3" aria-label="Hours streamed, last 8 weeks">
              <div className="flex h-10 items-end gap-1">
                {[...crew.history].reverse().map((w) => {
                  const max = Math.max(crew.goals.hours || 1, ...crew.history.map((x) => x.hours));
                  return <div key={w.weekKey} title={`${w.weekKey}: ${hrs(w.hours)}h, ${w.streams} streams${w.met ? ' — goals hit' : ''}`}
                    className={`flex-1 rounded-t ${w.met ? 'bg-dragon-400' : 'bg-ink-600'}`} style={{ height: `${Math.max(6, (w.hours / max) * 100)}%` }} />;
                })}
              </div>
              <p className="mt-1 text-[10px] text-ink-500">Last 8 weeks · gold = goals hit</p>
            </div>
          )}
        </>
      )}
      {crew.badges?.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {crew.badges.map((b) => <li key={b.key} title={b.description} className="rounded-lg border border-dragon-500/30 bg-dragon-500/10 px-2 py-1 text-xs text-ink-100"><span aria-hidden="true">{b.icon}</span> {b.name}</li>)}
        </ul>
      )}
    </section>
  );
}

/** "Crew grind this week" ranking (Live page). Hidden when admins keep progress private. */
export function CrewWeekBoard() {
  const q = useQuery({ queryKey: ['crew-week'], queryFn: () => api.get('/crew/week?limit=10').then((r) => r.data), refetchInterval: 120_000 });
  if (!q.data || !q.data.items.length) return null;
  const { items, goals, week } = q.data;
  return (
    <section className="mt-14" aria-labelledby="grind-h">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h2 id="grind-h" className="flex items-center gap-2 text-2xl font-bold"><Trophy className="h-5 w-5 text-dragon-400" aria-hidden="true" /> Crew grind this week</h2>
        <p className="text-xs text-ink-400">Goal: {goals.streams} streams · {goals.hours}h · {timeLeft(week.end)}</p>
      </div>
      <ol className="card divide-y divide-ink-700/70">
        {items.map((r) => (
          <li key={r.member.slug}>
            <Link to={`/members/${r.member.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-800/60">
              <span className={`w-6 text-center font-display text-lg font-bold ${r.rank === 1 ? 'text-dragon-300' : 'text-ink-500'}`}>{r.rank}</span>
              <Avatar src={r.member.avatarUrl} name={r.member.displayName} accent={r.member.accentColor} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-semibold text-ink-100">{r.member.displayName}{r.isStreamerOfWeek && <Crown className="h-3.5 w-3.5 text-dragon-300" aria-label="Streamer of the Week" />}</p>
                <p className="text-xs text-ink-400">{hrs(r.thisWeek.hours)}h · {r.thisWeek.streams} stream{r.thisWeek.streams === 1 ? '' : 's'} · {r.thisWeek.days} day{r.thisWeek.days === 1 ? '' : 's'}{r.thisWeek.uploads ? ` · ${r.thisWeek.uploads} upload${r.thisWeek.uploads === 1 ? '' : 's'}` : ''}{r.streakWeeks >= 2 ? ` · 🔥 ${r.streakWeeks}-wk streak` : ''}</p>
              </div>
              {r.qualified ? <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">Goals hit</span>
                : <span className="text-xs text-ink-500">{r.score} pts</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
