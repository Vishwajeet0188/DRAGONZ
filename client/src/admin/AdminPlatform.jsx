// Admin: Announcements, Analytics, Site settings.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Mail, Send, Table2, BarChart3 } from 'lucide-react';
import { api } from '../lib/api.js';
import { compact, formatDate, timeAgo } from '../lib/format.js';
import { Button } from '../components/ui/Button.jsx';
import { Field, FormAlert } from '../components/ui/Field.jsx';
import { ErrorState, Skeleton } from '../components/ui/States.jsx';
import { AdminHeader } from './ui.jsx';

// ── Announcements ────────────────────────────────────────────────────────
export function AdminNotifications() {
  const q = useQuery({ queryKey: ['admin', 'announcements'], queryFn: () => api.get('/admin/announcements') });
  const qc = useQueryClient();
  const [f, setF] = useState({ title: '', body: '', url: '', sendEmail: false });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const aud = q.data?.meta?.audience;
  const bind = (k) => ({ value: f[k], onChange: (e) => { setF({ ...f, [k]: e.target.value }); setConfirm(false); }, error: errors[k] });

  const send = async () => {
    setBusy(true); setErrors({}); setMsg(null);
    try {
      const r = await api.post('/admin/announcements', f);
      setMsg({ tone: 'success', text: `Sent to ${r.data.inApp} users in-app${f.sendEmail ? ` and queued ${r.data.emailed} emails` : ''}.` });
      setF({ title: '', body: '', url: '', sendEmail: false });
      qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    } catch (err) { setErrors(err.fieldErrors ?? {}); setMsg({ tone: 'error', text: err.message }); }
    finally { setBusy(false); setConfirm(false); }
  };

  return (
    <>
      <AdminHeader title="Notifications" desc="Send an announcement to everyone’s notification bell — and optionally by email to fans who opted in." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); setConfirm(true); }} noValidate>
          {msg && <FormAlert tone={msg.tone}>{msg.text}</FormAlert>}
          <Field label="Title *" maxLength={120} {...bind('title')} placeholder="Recruitment is open!" />
          <Field as="textarea" label="Message *" rows={5} maxLength={1500} {...bind('body')} />
          <Field label="Link (optional)" placeholder="/events/summer-cup or https://…" {...bind('url')} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-dragon-500" checked={f.sendEmail} onChange={(e) => { setF({ ...f, sendEmail: e.target.checked }); setConfirm(false); }} />
            <span>Also email it <span className="block text-xs text-ink-400">Only to verified users who turned on “Announcements” emails{aud ? ` (${aud.email} right now)` : ''}.</span></span>
          </label>
          {confirm ? (
            <div className="rounded-xl border border-dragon-500/40 bg-dragon-500/10 p-4">
              <p className="text-sm text-ink-100">This notifies <b>{aud?.inApp ?? '…'}</b> users in-app{f.sendEmail && <> and emails <b>{aud?.email ?? '…'}</b></>}. It can’t be unsent.</p>
              <div className="mt-3 flex gap-2"><Button type="button" loading={busy} onClick={send}><Send className="h-4 w-4" /> Send now</Button><Button type="button" variant="ghost" onClick={() => setConfirm(false)}>Back</Button></div>
            </div>
          ) : <Button type="submit" disabled={f.title.trim().length < 3 || f.body.trim().length < 3}>Review &amp; send</Button>}
        </form>

        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">Recent announcements</h2>
          {q.isPending ? <Skeleton className="h-40" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : !q.data.data.length ? <p className="text-sm text-ink-400">None sent yet.</p> : (
            <ul className="space-y-3">
              {q.data.data.map((a) => (
                <li key={a.id} className="border-b border-ink-700/70 pb-3 last:border-0">
                  <p className="font-semibold text-ink-100">{a.metadata?.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-400">
                    <span>{timeAgo(a.createdAt)} · {a.actorName}</span>
                    <span className="inline-flex items-center gap-1"><Bell className="h-3 w-3" /> {a.metadata?.inApp ?? 0}</span>
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {a.metadata?.emailed ?? 0}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

// ── Analytics ────────────────────────────────────────────────────────────
const GOLD = '#f5b50a';
const dayKey = (d) => (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10));
function fillDays(rows, days, key) {
  const map = new Map(rows.map((r) => [dayKey(r.day), Number(r[key]) || 0]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day: d, value: map.get(d) ?? 0 });
  }
  return out;
}
const niceMax = (v) => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p) * p; };
const shortDay = (d) => formatDate(`${d}T12:00:00`, { day: 'numeric', month: 'short' });

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Single-series time chart (line or bars) with a hover tooltip. Title names the series, so no legend. */
function TimeChart({ data, kind = 'line', label }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  const H = 220, pad = { l: 40, r: 12, t: 12, b: 26 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const x = (i) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const band = iw / data.length;
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(iw / 70)));
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = kind === 'bar' ? Math.floor((px - pad.l) / band) : Math.round(((px - pad.l) / iw) * (data.length - 1));
    setHover(i >= 0 && i < data.length ? i : null);
  };
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join('');
  const h = hover != null ? data[hover] : null;
  const hx = h ? (kind === 'bar' ? pad.l + band * hover + band / 2 : x(hover)) : 0;
  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} role="img" aria-label={`${label}, last ${data.length} days`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block touch-none select-none">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-ink-700" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-500 text-[10px]">{compact(t)}</text>
          </g>
        ))}
        {data.map((d, i) => (i % labelEvery === 0 ? <text key={d.day} x={kind === 'bar' ? pad.l + band * i + band / 2 : x(i)} y={H - 8} textAnchor="middle" className="fill-ink-500 text-[10px]">{shortDay(d.day)}</text> : null))}
        {kind === 'bar' ? data.map((d, i) => {
          const bw = Math.max(2, band - 2), bx = pad.l + band * i + 1, bh = Math.max(d.value ? 2 : 0, ih - (y(d.value) - pad.t));
          const r = Math.min(4, bw / 2, bh);
          return bh > 0 ? <path key={d.day} d={`M${bx},${pad.t + ih}V${pad.t + ih - bh + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${pad.t + ih}Z`} fill={GOLD} opacity={hover == null || hover === i ? 1 : 0.45} /> : null;
        }) : (
          <>
            <path d={`${line}L${x(data.length - 1)},${pad.t + ih}L${x(0)},${pad.t + ih}Z`} fill={GOLD} opacity="0.08" />
            <path d={line} fill="none" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
        {h && kind === 'line' && (
          <>
            <line x1={hx} x2={hx} y1={pad.t} y2={pad.t + ih} stroke="currentColor" className="text-ink-500" strokeDasharray="3 3" />
            <circle cx={hx} cy={y(h.value)} r="4.5" fill={GOLD} stroke="#0b0b0d" strokeWidth="2" />
          </>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-1 rounded-lg border border-ink-600 bg-ink-900/95 px-2.5 py-1.5 text-xs shadow-lg" style={{ left: Math.min(Math.max(hx - 60, 0), W - 120), width: 120 }}>
          <p className="text-ink-400">{formatDate(`${h.day}T12:00:00`, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <p className="font-semibold text-ink-100">{h.value.toLocaleString('en-IN')} {label.toLowerCase()}</p>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, total, data, kind, label }) {
  const [table, setTable] = useState(false);
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-ink-400">{total.toLocaleString('en-IN')} total</p></div>
        <button type="button" onClick={() => setTable((t) => !t)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-300 hover:bg-ink-800 hover:text-white" aria-pressed={table}>
          {table ? <><BarChart3 className="h-3.5 w-3.5" /> Chart</> : <><Table2 className="h-3.5 w-3.5" /> Table</>}
        </button>
      </div>
      {table ? (
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-sm"><thead className="text-xs text-ink-400"><tr><th className="py-1 text-left font-medium">Day</th><th className="py-1 text-right font-medium">{label}</th></tr></thead>
            <tbody>{[...data].reverse().map((d) => <tr key={d.day} className="border-t border-ink-800"><td className="py-1 text-ink-300">{shortDay(d.day)}</td><td className="py-1 text-right tabular-nums text-ink-100">{d.value.toLocaleString('en-IN')}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <TimeChart data={data} kind={kind} label={label} />}
    </section>
  );
}

function BarList({ title, rows, empty = 'No data yet.' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="card p-5">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {!rows.length ? <p className="text-sm text-ink-400">{empty}</p> : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.key} title={`${r.label}: ${r.value.toLocaleString('en-IN')}`}>
              <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate text-ink-200">{r.label}{r.sub && <span className="text-ink-500"> · {r.sub}</span>}</span><span className="shrink-0 tabular-nums text-ink-100">{r.value.toLocaleString('en-IN')}</span></div>
              <div className="h-1.5 rounded-full bg-ink-800"><div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: GOLD }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value }) {
  return <div className="card p-4"><p className="text-xs uppercase tracking-wider text-ink-400">{label}</p><p className="mt-1 font-display text-3xl font-bold text-ink-100">{compact(value ?? 0)}</p></div>;
}

export function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['admin', 'analytics', days], queryFn: () => api.get(`/admin/analytics?days=${days}`).then((r) => r.data) });
  const views = useMemo(() => (q.data ? fillDays(q.data.daily, days, 'views') : []), [q.data, days]);
  const signups = useMemo(() => (q.data ? fillDays(q.data.signups, days, 'n') : []), [q.data, days]);
  const sum = (a) => a.reduce((s, d) => s + d.value, 0);
  return (
    <>
      <AdminHeader title="Analytics" desc="Privacy-friendly: daily page counters only — no cookies, no IPs, Do Not Track respected.">
        <div className="flex rounded-xl border border-ink-700 bg-ink-900 p-1" role="group" aria-label="Date range">
          {[7, 30, 90].map((d) => <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={`rounded-lg px-3 py-1.5 text-sm ${days === d ? 'bg-dragon-500/20 text-white' : 'text-ink-400 hover:text-white'}`}>{d} days</button>)}
        </div>
      </AdminHeader>
      {q.isPending ? <Skeleton className="h-[480px]" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Accounts" value={q.data.totals.users} />
            <Stat label="Members" value={q.data.totals.members} />
            <Stat label="Follows" value={q.data.totals.follows} />
            <Stat label="Live-alert emails" value={q.data.totals.emailLiveSubscribers} />
            <Stat label="Event reminders" value={q.data.totals.reminders} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Page views" total={sum(views)} data={views} kind="line" label="Views" />
            <ChartCard title="New accounts" total={sum(signups)} data={signups} kind="bar" label="Sign-ups" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <BarList title="Top pages" rows={q.data.topPages.map((p) => ({ key: p.path, label: p.path, value: p.views }))} />
            <BarList title="Most-viewed profiles" rows={q.data.topMembers.map((m) => ({ key: m.slug, label: m.name, value: m.views }))} />
            <BarList title="Most-clicked videos" rows={q.data.topVideos.map((v) => ({ key: v.id, label: v.title, sub: v.member, value: v.clicks }))} />
            <BarList title="Most-followed creators" rows={q.data.topFollowed.map((m) => ({ key: m.slug, label: m.name, value: m.followers }))} />
          </div>
          <section className="card p-5">
            <h2 className="mb-2 text-lg font-bold">Community submissions</h2>
            <div className="flex flex-wrap gap-6 text-sm">
              {q.data.submissions.length ? q.data.submissions.map((s) => <p key={s.status}><span className="text-ink-400">{s.status.toLowerCase()}</span> <b className="text-ink-100">{s.n}</b></p>) : <p className="text-ink-400">None yet.</p>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

// ── Site settings ────────────────────────────────────────────────────────
export function AdminSettings() {
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.get('/admin/settings') });
  const qc = useQueryClient();
  const [f, setF] = useState(null);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setF(q.data.data); }, [q.data]);
  if (q.isPending || !f) return q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : <Skeleton className="h-96" />;
  const bind = (k) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }), error: errors[k] });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({}); setMsg(null);
    try {
      await api.put('/admin/settings', f);
      qc.invalidateQueries({ queryKey: ['site-settings'] }); qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      setMsg({ tone: 'success', text: 'Saved — the site updates within a minute.' });
    } catch (err) { setErrors(err.fieldErrors ?? {}); setMsg({ tone: 'error', text: err.message }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} noValidate>
      <AdminHeader title="Settings" desc="Site-wide text and links. Secrets and API keys live in the server’s .env, never here."><Button type="submit" loading={busy}>Save</Button></AdminHeader>
      {msg && <div className="mb-4"><FormAlert tone={msg.tone}>{msg.text}</FormAlert></div>}
      <div className="grid max-w-3xl gap-6">
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-bold">Home page</h2>
          <Field label="Hero tagline" maxLength={200} {...bind('heroTagline')} />
          <Field label="Discord invite" placeholder="https://discord.gg/…" {...bind('discordUrl')} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-dragon-500" checked={Boolean(f.recruitmentOpen)} onChange={(e) => setF({ ...f, recruitmentOpen: e.target.checked })} /> Recruitment open</label>
        </section>
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-bold">Announcement bar</h2>
          <p className="text-sm text-ink-400">A gold strip above the header on every page. Leave the text empty to hide it.</p>
          <Field label="Text" maxLength={160} {...bind('bannerText')} placeholder="Summer Cup finals this Saturday!" />
          <Field label="Link" placeholder="/events or https://…" {...bind('bannerUrl')} />
        </section>
      </div>
    </form>
  );
}
