import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CircleOff, RefreshCw, Webhook } from 'lucide-react';
import { api } from '../lib/api.js';
import { compact, timeAgo } from '../lib/format.js';
import { PLATFORM_META } from '../lib/platforms.js';
import { Badge } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { FormAlert } from '../components/ui/Field.jsx';
import { ErrorState, Skeleton } from '../components/ui/States.jsx';
import { AdminHeader, Table } from './ui.jsx';

function ProviderCard({ p, liveMode }) {
  const meta = PLATFORM_META[p.platform];
  const state = !p.configured ? 'off' : p.ok === false ? 'error' : p.lastSuccessAt ? 'ok' : 'pending';
  const icon = { ok: <CheckCircle2 className="h-4 w-4 text-emerald-400" />, error: <AlertTriangle className="h-4 w-4 text-red-400" />, off: <CircleOff className="h-4 w-4 text-ink-400" />, pending: <RefreshCw className="h-4 w-4 text-ink-400" /> }[state];
  const quotaPct = p.dailyQuota ? Math.min(100, Math.round(((p.unitsToday ?? 0) / p.dailyQuota) * 100)) : null;
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${meta.color}1f` }}><meta.Icon className="h-4 w-4" style={{ color: meta.color }} /></span>
          {p.label}
        </h2>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-300">{icon}{{ ok: 'Working', error: 'Problem', off: 'Not configured', pending: liveMode ? 'Waiting for first sync' : 'Sync off' }[state]}</span>
      </div>
      {p.error && <div className="mt-3"><FormAlert tone="error">{p.error}</FormAlert></div>}
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[['Channels', p.accounts ?? '—'], ['Live now', p.liveNow ?? '—'], ['Last sync', p.lastSuccessAt ? timeAgo(p.lastSuccessAt) : '—']].map(([k, v]) => (
          <div key={k} className="flex flex-col-reverse rounded-xl bg-ink-900 p-2.5">
            <dt className="text-[10px] uppercase tracking-wider text-ink-500">{k}</dt>
            <dd className="font-display text-xl font-bold text-ink-100">{v}</dd>
          </div>
        ))}
      </dl>
      {quotaPct != null && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-ink-400">
            <span>YouTube quota today</span>
            <span>{compact(p.unitsToday ?? 0)} / {compact(p.dailyQuota)} units · ~{p.estimatedUnitsPerRun}/sync</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-valuenow={quotaPct} aria-valuemin={0} aria-valuemax={100} aria-label="YouTube quota used">
            <div className={`h-full rounded-full ${quotaPct > 85 ? 'bg-red-500' : 'bg-dragon-400'}`} style={{ width: `${quotaPct}%` }} />
          </div>
          {p.minIntervalSeconds && <p className="mt-1.5 text-[11px] text-ink-500">Quota pacing: YouTube is checked at most every {Math.round(p.minIntervalSeconds / 60) || 1} min.</p>}
        </div>
      )}
      {!p.configured && (
        <p className="mt-4 text-xs text-ink-400">
          Add {p.platform === 'YOUTUBE' ? <code className="text-ember-400">YOUTUBE_API_KEY</code> : <><code className="text-ember-400">KICK_CLIENT_ID</code> and <code className="text-ember-400">KICK_CLIENT_SECRET</code></>} to <code>server/.env</code> and restart the server.
        </p>
      )}
    </section>
  );
}

export default function AdminIntegrations() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'integrations'], queryFn: () => api.get('/admin/integrations').then((r) => r.data), refetchInterval: 30_000 });
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const act = async (key, fn, ok) => {
    setBusy(key); setMsg(null);
    try {
      const r = await fn();
      if (r?.data?.overview) qc.setQueryData(['admin', 'integrations'], r.data.overview);
      else qc.invalidateQueries({ queryKey: ['admin', 'integrations'] });
      setMsg({ tone: 'success', text: typeof ok === 'function' ? ok(r.data) : ok });
      qc.invalidateQueries({ queryKey: ['live'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    } catch (err) { setMsg({ tone: 'error', text: err.message }); } finally { setBusy(null); }
  };

  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data;
  const liveMode = d.mode === 'live';

  return (
    <>
      <AdminHeader title="Live integrations" desc="YouTube and Kick are checked automatically using their official APIs.">
        <Button onClick={() => act('sync', () => api.post('/admin/integrations/sync', {}), (r) => `Sync finished${r.summary?.YOUTUBE?.started || r.summary?.KICK?.started ? ' — new live streams detected!' : '.'}`)}
          loading={busy === 'sync'} disabled={!liveMode}>
          <RefreshCw className="h-4 w-4" /> Sync now
        </Button>
      </AdminHeader>

      {!liveMode && (
        <div className="mb-6"><FormAlert tone="info">
          Sync is <strong>off</strong> — the site is showing demo data. Set <code>STREAMING_MODE=live</code> in <code>server/.env</code> and restart the server to turn it on.
        </FormAlert></div>
      )}
      {msg && <div className="mb-6"><FormAlert tone={msg.tone}>{msg.text}</FormAlert></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {d.providers.map((p) => <ProviderCard key={p.platform} p={p} liveMode={liveMode} />)}
      </div>
      <p className="mt-3 text-xs text-ink-500">Automatic check every {Math.round(d.intervalSeconds / 60)} min{d.lastRunAt ? ` · last run ${timeAgo(d.lastRunAt)}` : ''}.</p>

      <h2 className="mb-3 mt-10 text-2xl font-bold">Channels</h2>
      <Table head={['Member', 'Platform', 'Handle', 'Status', 'Followers', 'Last synced']}
        empty={d.accounts.length === 0 && <p className="p-8 text-center text-sm text-ink-400">No YouTube or Kick channels yet. Add them on a member’s page (Admin → Members → Edit → Platforms).</p>}>
        {d.accounts.map((a) => {
          const meta = PLATFORM_META[a.platform];
          return (
            <tr key={a.id}>
              <td className="px-4 py-3"><Link to={`/admin/members/${a.memberId}`} className="font-semibold text-ink-100 hover:text-dragon-300">{a.memberName}</Link></td>
              <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5"><meta.Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />{meta.label}</span></td>
              <td className="px-4 py-3 text-ink-300">{a.handle}</td>
              <td className="max-w-xs px-4 py-3">
                {!a.syncEnabled ? <Badge>Auto-sync off</Badge>
                  : a.syncError ? <span className="text-xs text-red-400">{a.syncError}</span>
                  : a.externalId ? <Badge tone="success">Connected</Badge>
                  : <Badge>Waiting</Badge>}
              </td>
              <td className="px-4 py-3 text-ink-300">{a.followerCount != null ? compact(a.followerCount) : '—'}</td>
              <td className="px-4 py-3 text-ink-400">{a.lastSyncedAt ? timeAgo(a.lastSyncedAt) : '—'}</td>
            </tr>
          );
        })}
      </Table>

      <section className="card mt-10 p-5">
        <h2 className="flex items-center gap-2 text-xl font-bold"><Webhook className="h-4 w-4 text-ink-400" /> Instant Kick alerts (after you deploy)</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-400">
          Polling already catches streams within a few minutes. Once the site is online with a public https address, set your Kick app’s webhook URL to
          <code className="mx-1 text-ember-400">https://YOUR-DOMAIN/api/webhooks/kick</code> and press the button — Kick will then notify us the second someone goes live.
        </p>
        <Button className="mt-4" variant="secondary" loading={busy === 'kick'} disabled={!liveMode}
          onClick={() => act('kick', () => api.post('/admin/integrations/kick/subscribe', {}), (r) => `Subscribed ${r.results.filter((x) => x.ok).length} of ${r.results.length} Kick channels.`)}>
          Subscribe Kick channels to webhooks
        </Button>
      </section>
    </>
  );
}
