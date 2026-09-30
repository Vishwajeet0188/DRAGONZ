// Admin: Featured crew rules + this week's crew activity (who's featured, who's close, who needs a nudge).
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Crown, Flame, Pin, PinOff, Save } from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, FormAlert } from '../components/ui/Field.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { ErrorState, Skeleton } from '../components/ui/States.jsx';
import { AdminHeader, Table } from './ui.jsx';

const hrs = (h) => Math.round(h * 10) / 10;

function RulesForm({ rules, onSaved }) {
  const [f, setF] = useState(rules);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(rules), [rules]);
  const num = (k) => ({ type: 'number', min: 0, value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const { excluded, ...body } = f; // exclusions are managed per member below
      await api.put('/admin/crew/rules', {
        ...body, minStreams: Number(f.minStreams), minHours: Number(f.minHours), minDays: Number(f.minDays), minUploads: Number(f.minUploads),
        minSessionMinutes: Number(f.minSessionMinutes), maxFeatured: Number(f.maxFeatured),
      });
      setMsg({ tone: 'success', text: 'Saved — the home page updates within a minute.' });
      onSaved();
    } catch (err) { setMsg({ tone: 'error', text: err.fieldErrors ? Object.values(err.fieldErrors).join(' · ') : err.message }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="card mb-6 space-y-5 p-5">
      <div>
        <p className="label">How is Featured crew chosen?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[['AUTO', 'Earned by streaming (recommended)', 'Members who hit the weekly goals + anyone you pin.'], ['MANUAL', 'Hand-picked only', 'Only members you pin. Goals and progress still show on profiles.']].map(([v, t, d]) => (
            <label key={v} className={`cursor-pointer rounded-xl border p-3 ${f.mode === v ? 'border-dragon-500 bg-dragon-500/10' : 'border-ink-700'}`}>
              <input type="radio" name="mode" value={v} checked={f.mode === v} onChange={() => setF({ ...f, mode: v })} className="sr-only" />
              <span className="block font-semibold text-ink-100">{t}</span><span className="text-xs text-ink-400">{d}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Weekly goals (Monday–Sunday, India time) · 0 = not required</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Streams / week" {...num('minStreams')} max={50} />
          <Field label="Hours / week" {...num('minHours')} max={168} step="0.5" />
          <Field label="Different days" {...num('minDays')} max={7} />
          <Field label="New uploads" {...num('minUploads')} max={50} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Min. stream length (min)" {...num('minSessionMinutes')} max={240} hint="Shorter streams don’t count" />
        <Field label="Max featured" {...num('maxFeatured')} min={1} max={24} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-dragon-500" checked={f.showProgress} onChange={(e) => setF({ ...f, showProgress: e.target.checked })} /> Show weekly progress publicly (profiles + “Crew grind” on the Live page)</label>
      <p className="text-xs text-ink-500">Score = 10 per hour + 5 per stream + 5 per day + 8 per upload + 10 per streak week. Multistreaming on YouTube and Kick at the same time counts once.</p>
      {msg && <FormAlert tone={msg.tone}>{msg.text}</FormAlert>}
      <Button type="submit" loading={busy}><Save className="h-4 w-4" /> Save rules</Button>
    </form>
  );
}

function Needs({ n }) {
  const parts = [n.streams && `${n.streams} stream${n.streams === 1 ? '' : 's'}`, n.hours && `${n.hours}h`, n.days && `${n.days} day${n.days === 1 ? '' : 's'}`, n.uploads && `${n.uploads} upload${n.uploads === 1 ? '' : 's'}`].filter(Boolean);
  return parts.length ? <span className="text-xs text-ink-400">needs {parts.join(' + ')}</span> : null;
}

export default function AdminCrew() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'crew'], queryFn: () => api.get('/admin/crew').then((r) => r.data) });
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin', 'crew'] }); qc.invalidateQueries({ queryKey: ['home'] }); };
  const patch = async (id, body) => {
    setBusy(id); setErr(null);
    try { await api.patch(`/admin/crew/members/${id}`, body); refresh(); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  return (
    <div>
      <AdminHeader title="Featured crew" desc="Set the weekly streaming goals. Members who hit them are featured on the home page automatically." />
      {q.isPending ? <Skeleton className="h-96" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          <RulesForm rules={q.data.rules} onSaved={refresh} />
          {err && <div className="mb-4"><FormAlert>{err}</FormAlert></div>}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">This week · {q.data.week.key}</h2>
            <p className="text-xs text-ink-400">Stream time comes from YouTube + Kick sync. Keep the cron-job.org ping on so no stream is missed.</p>
          </div>
          <Table head={['Member', 'This week', 'Last week', 'Streak', 'Status', '']}>
            {q.data.members.map((r) => {
              const featuredNow = !r.excluded && (r.pinned || (q.data.rules.mode === 'AUTO' && (r.qualifiedThisWeek || r.qualifiedLastWeek)));
              return (
                <tr key={r.member.id} className={r.excluded ? 'opacity-50' : ''}>
                  <td className="px-4 py-3">
                    <Link to={`/members/${r.member.slug}`} target="_blank" className="flex items-center gap-2.5">
                      <Avatar src={r.member.avatarUrl} name={r.member.displayName} accent={r.member.accentColor} size="sm" />
                      <span><span className="flex items-center gap-1 font-semibold text-ink-100">{r.member.displayName}{q.data.streamerOfWeekId === r.member.id && <Crown className="h-3.5 w-3.5 text-dragon-300" aria-label="Streamer of the Week" />}</span>
                        <span className="text-xs text-ink-500">{r.badges.map((b) => b.icon).join(' ')} {r.score} pts</span></span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-300">{r.thisWeek.streams} streams · {hrs(r.thisWeek.hours)}h · {r.thisWeek.days}d · {r.thisWeek.uploads} up.<br />{r.qualifiedThisWeek ? <span className="font-semibold text-emerald-300">✓ Goals hit</span> : <Needs n={r.needs} />}</td>
                  <td className="px-4 py-3 text-xs text-ink-400">{r.lastWeek.streams} streams · {hrs(r.lastWeek.hours)}h{r.qualifiedLastWeek && <span className="text-emerald-300"> ✓</span>}</td>
                  <td className="px-4 py-3 text-xs">{r.streakWeeks ? <span className="inline-flex items-center gap-1 text-ember-400"><Flame className="h-3.5 w-3.5" /> {r.streakWeeks} wk</span> : <span className="text-ink-500">—</span>}</td>
                  <td className="px-4 py-3">
                    {r.excluded ? <Badge>Excluded</Badge> : r.pinned ? <Badge tone="dragon"><Pin className="h-3 w-3" /> Pinned</Badge> : featuredNow ? <Badge tone="success">Featured</Badge> : <span className="text-xs text-ink-500">Not featured</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" disabled={busy === r.member.id} onClick={() => patch(r.member.id, { pinned: !r.pinned })} title={r.pinned ? 'Unpin' : 'Pin (always featured)'}
                        className="inline-grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-ink-700 hover:text-white disabled:opacity-40">{r.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</button>
                      <button type="button" disabled={busy === r.member.id} onClick={() => patch(r.member.id, { excluded: !r.excluded })} title={r.excluded ? 'Allow auto-feature again' : 'Never auto-feature'}
                        className={`inline-grid h-8 w-8 place-items-center rounded-lg hover:bg-ink-700 disabled:opacity-40 ${r.excluded ? 'text-red-400' : 'text-ink-300 hover:text-white'}`}><Ban className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        </>
      )}
    </div>
  );
}
