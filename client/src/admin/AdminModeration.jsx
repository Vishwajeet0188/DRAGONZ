// Admin: Videos, Community moderation, Supporters, Hall of Fame (achievements + milestones).
import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Eye, EyeOff, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { useDebounce } from '../lib/useDebounce.js';
import { compact, formatDate, safeUrl, titleCase } from '../lib/format.js';
import { PLATFORM_META } from '../lib/platforms.js';
import { Badge, Pagination } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, FormAlert } from '../components/ui/Field.jsx';
import { ErrorState, Skeleton } from '../components/ui/States.jsx';
import { AdminHeader, Table } from './ui.jsx';
import { ImageField, MemberSelect, useMemberOptions } from './fields.jsx';

const iconBtn = 'inline-grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-ink-700 hover:text-white disabled:opacity-40';
const errText = (err) => (err.fieldErrors ? Object.entries(err.fieldErrors).map(([k, v]) => `${k}: ${v}`).join(' · ') : err.message);

function Tabs({ value, onChange, options }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${value === v ? 'bg-dragon-500/20 text-white' : 'text-ink-400 hover:text-white'}`}>{label}</button>
      ))}
    </div>
  );
}

/** Tiny mutation helper: run, refresh the given query keys, surface errors. */
function useAction(keys) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const run = async (id, fn) => {
    setBusy(id); setError(null);
    try { const r = await fn(); keys.forEach((k) => qc.invalidateQueries({ queryKey: k })); return r; }
    catch (err) { setError(errText(err)); throw err; } finally { setBusy(null); }
  };
  return { run, busy, error, setError };
}

// ── Videos ───────────────────────────────────────────────────────────────
const VIDEO_PLATFORMS = ['YOUTUBE', 'KICK', 'TWITCH', 'TIKTOK', 'INSTAGRAM'];

function AddVideo({ onDone }) {
  const [f, setF] = useState({ memberId: '', platform: 'KICK', title: '', url: '', thumbnailUrl: '', publishedAt: new Date().toISOString().slice(0, 10), isFeatured: false });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const bind = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }), error: errors[k] });
  const qc = useQueryClient();
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({}); setMsg(null);
    try {
      await api.post('/admin/videos', { ...f, publishedAt: new Date(f.publishedAt).toISOString() });
      qc.invalidateQueries({ queryKey: ['admin', 'videos'] });
      onDone();
    } catch (err) { setErrors(err.fieldErrors ?? {}); setMsg(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card mb-6 space-y-4 p-5" noValidate>
      <h2 className="text-xl font-bold">Add a video manually</h2>
      <p className="text-sm text-ink-400">YouTube uploads sync automatically. Use this for Kick VODs/clips (Kick has no public VOD API) or anything the sync missed.</p>
      {msg && <FormAlert>{msg}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <MemberSelect label="Creator *" value={f.memberId} onChange={(v) => setF({ ...f, memberId: v })} required error={errors.memberId} />
        <Field as="select" label="Platform *" {...bind('platform')}>{VIDEO_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_META[p]?.label ?? p}</option>)}</Field>
        <Field label="Title *" maxLength={200} className="sm:col-span-2" {...bind('title')} />
        <Field label="Video URL *" placeholder="https://kick.com/…/videos/…" {...bind('url')} hint="Must be on the platform’s official domain" />
        <Field label="Published *" type="date" {...bind('publishedAt')} />
      </div>
      <ImageField label="Thumbnail" kind="content" value={f.thumbnailUrl} onChange={(v) => setF({ ...f, thumbnailUrl: v })} error={errors.thumbnailUrl} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-dragon-500" checked={f.isFeatured} onChange={(e) => setF({ ...f, isFeatured: e.target.checked })} /> Feature on the home page</label>
      <div className="flex gap-2"><Button type="submit" loading={busy}>Add video</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

export function AdminVideos() {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const term = useDebounce(search.trim(), 300);
  const q = useQuery({ queryKey: ['admin', 'videos', term, source, page], queryFn: () => api.get(`/admin/videos${qs({ q: term, source, page })}`), placeholderData: keepPreviousData });
  const act = useAction([['admin', 'videos'], ['videos'], ['home']]);
  const flag = (v, body) => act.run(v.id, () => api.patch(`/admin/videos/${v.id}`, body)).catch(() => {});
  const remove = (v) => {
    const msg = v.source === 'SYNC'
      ? `Delete “${v.title}” from Dragonz Central?\n\nIt stays on YouTube/Kick, and the auto-sync won’t bring it back here.`
      : `Delete “${v.title}”?`;
    if (!window.confirm(msg)) return;
    act.run(v.id, () => api.del(`/admin/videos/${v.id}`)).catch(() => {});
  };
  return (
    <>
      <AdminHeader title="Videos" desc="Star = show on the home page. Eye = hide from the site (can be undone). Bin = delete for good.">
        {!adding && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add video</Button>}
      </AdminHeader>
      {adding && <AddVideo onDone={() => setAdding(false)} />}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1"><span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" placeholder="Search titles…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <select className="input sm:w-44" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} aria-label="Source">
          <option value="">All sources</option><option value="SYNC">Synced</option><option value="MANUAL">Manual</option>
        </select>
      </div>
      {act.error && <div className="mb-4"><FormAlert>{act.error}</FormAlert></div>}
      {q.isPending ? <Skeleton className="h-96" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          <Table head={['Video', 'Creator', 'Source', 'Published', '']} empty={!q.data.data.length && <p className="p-8 text-center text-sm text-ink-400">No videos yet. Add a creator with a YouTube channel and run a sync from Live integrations.</p>}>
            {q.data.data.map((v) => {
              const meta = PLATFORM_META[v.platform];
              return (
                <tr key={v.id} className={`hover:bg-ink-800/50 ${v.isHidden ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {safeUrl(v.thumbnailUrl) ? <img src={v.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="h-10 w-16 shrink-0 rounded object-cover" /> : <div className="h-10 w-16 shrink-0 rounded bg-ink-800" />}
                      <div className="min-w-0">
                        <p className="line-clamp-1 font-semibold text-ink-100">{v.isFeatured && <Star className="mr-1 inline h-3 w-3 fill-dragon-400 text-dragon-400" aria-label="Featured" />}{v.title}</p>
                        <p className="flex items-center gap-1 text-xs text-ink-400">{meta && <meta.Icon className="h-3 w-3" style={{ color: meta.color }} />}{meta?.label}{v.viewCount != null && ` · ${compact(v.viewCount)} views`}{v.isHidden && ' · hidden'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-300">{v.member?.displayName}</td>
                  <td className="px-4 py-3"><Badge tone={v.source === 'SYNC' ? 'success' : 'default'}>{v.source}</Badge></td>
                  <td className="px-4 py-3 text-ink-400">{formatDate(v.publishedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button type="button" className={iconBtn} disabled={act.busy === v.id} onClick={() => flag(v, { isFeatured: !v.isFeatured })} title={v.isFeatured ? 'Remove from home page' : 'Show on home page'} aria-label={v.isFeatured ? 'Remove from home page' : 'Show on home page'}><Star className={`h-4 w-4 ${v.isFeatured ? 'fill-dragon-400 text-dragon-400' : ''}`} /></button>
                    <button type="button" className={iconBtn} disabled={act.busy === v.id} onClick={() => flag(v, { isHidden: !v.isHidden })} title={v.isHidden ? 'Show' : 'Hide'} aria-label={v.isHidden ? 'Show' : 'Hide'}>{v.isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                    {safeUrl(v.url) && <a href={v.url} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="Open"><ExternalLink className="h-4 w-4" /></a>}
                    <button type="button" className={`${iconBtn} hover:!text-red-400`} disabled={act.busy === v.id} onClick={() => remove(v)} title="Delete" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              );
            })}
          </Table>
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

// ── Community moderation ─────────────────────────────────────────────────
const SUB_TONE = { PENDING: 'ember', APPROVED: 'success', FEATURED: 'dragon', REJECTED: 'default' };

export function AdminCommunity() {
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['admin', 'community', status, page], queryFn: () => api.get(`/admin/community${qs({ status, page })}`), placeholderData: keepPreviousData });
  const act = useAction([['admin', 'community'], ['community'], ['home']]);
  const moderate = (s, body) => act.run(s.id, () => api.patch(`/admin/community/${s.id}`, body)).then(() => { setRejecting(null); setReason(''); }).catch(() => {});
  const remove = (s) => window.confirm(`Delete “${s.title}” permanently?`) && act.run(s.id, () => api.del(`/admin/community/${s.id}`)).catch(() => {});

  return (
    <>
      <AdminHeader title="Community" desc="Review fan art, clips and screenshots before they appear in the showcase." />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['FEATURED', 'Featured'], ['REJECTED', 'Rejected'], ['', 'All']]} />
      {act.error && <div className="mb-4"><FormAlert>{act.error}</FormAlert></div>}
      {q.isPending ? <Skeleton className="h-96" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          {!q.data.data.length ? <p className="card p-10 text-center text-sm text-ink-400">{status === 'PENDING' ? 'Nothing waiting for review. 🎉' : 'Nothing here.'}</p> : (
            <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {q.data.data.map((s) => (
                <li key={s.id} className="card flex flex-col overflow-hidden">
                  {s.previewUrl ? <img src={s.previewUrl} alt="" referrerPolicy="no-referrer" className="aspect-video w-full object-cover" /> : <div className="grid aspect-video place-items-center bg-ink-800 text-xs text-ink-500">No preview</div>}
                  {s.images.length > 1 && <div className="flex gap-1 p-2">{s.images.slice(1).map((im) => <img key={im.id} src={im.url} alt="" className="h-12 w-16 rounded object-cover" />)}</div>}
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400"><Badge tone={SUB_TONE[s.status]}>{s.status}</Badge>{titleCase(s.type)} · {formatDate(s.createdAt)}</div>
                    <h3 className="mt-2 font-semibold text-ink-100">{s.title}</h3>
                    {s.description && <p className="mt-1 line-clamp-3 text-sm text-ink-300">{s.description}</p>}
                    <p className="mt-2 text-xs text-ink-400">By {s.authorName} <span className="text-ink-500">({s.authorEmail})</span>{s.memberName && <> · features {s.memberName}</>}</p>
                    {safeUrl(s.externalUrl) && <a href={s.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 truncate text-xs text-dragon-300 hover:text-white"><ExternalLink className="h-3 w-3" /> {new URL(s.externalUrl).hostname}</a>}
                    {s.rejectionReason && <p className="mt-2 text-xs text-ink-400">Reason: {s.rejectionReason}</p>}
                    <div className="mt-auto pt-4">
                      {rejecting === s.id ? (
                        <div className="space-y-2">
                          <Field label="Reason (sent to the author)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Please credit the original artist" />
                          <div className="flex gap-2"><Button size="sm" variant="danger" loading={act.busy === s.id} onClick={() => moderate(s, { status: 'REJECTED', rejectionReason: reason })}>Reject</Button><Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button></div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {s.status !== 'APPROVED' && <Button size="sm" variant="secondary" loading={act.busy === s.id} onClick={() => moderate(s, { status: 'APPROVED' })}><Check className="h-4 w-4" /> Approve</Button>}
                          {s.status !== 'FEATURED' && <Button size="sm" variant="secondary" disabled={act.busy === s.id} onClick={() => moderate(s, { status: 'FEATURED' })}><Star className="h-4 w-4" /> Feature</Button>}
                          {s.status !== 'REJECTED' && <Button size="sm" variant="ghost" onClick={() => { setRejecting(s.id); setReason(''); }}><X className="h-4 w-4" /> Reject</Button>}
                          <button type="button" className={`${iconBtn} ml-auto`} onClick={() => remove(s)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

// ── Supporters ───────────────────────────────────────────────────────────
function AddSupporter({ onDone }) {
  const members = useMemberOptions();
  const [f, setF] = useState({ email: '', memberSlug: '', tier: '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({}); setMsg(null);
    try { await api.post('/admin/supporters', f); qc.invalidateQueries({ queryKey: ['admin', 'supporters'] }); onDone(); }
    catch (err) { setErrors(err.fieldErrors ?? {}); setMsg(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card mb-6 space-y-4 p-5" noValidate>
      <h2 className="text-xl font-bold">Add a verified supporter</h2>
      <p className="text-sm text-ink-400">For fans you’ve confirmed yourself (e.g. from the creator’s own membership list). They must have a Dragonz Central account. Their badge starts private; they can make it public in Settings.</p>
      {msg && <FormAlert>{msg}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fan’s account email *" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errors.email} />
        <Field as="select" label="Creator *" value={f.memberSlug} onChange={(e) => setF({ ...f, memberSlug: e.target.value })} error={errors.memberSlug}>
          <option value="">Select…</option>{(members.data ?? []).map((m) => <option key={m.id} value={m.slug}>{m.name}</option>)}
        </Field>
        <Field label="Tier" maxLength={60} value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} placeholder="e.g. Dragon Tier" />
      </div>
      <div className="flex gap-2"><Button type="submit" loading={busy}>Add supporter</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

export function AdminSupporters() {
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'supporters', status, page], queryFn: () => api.get(`/admin/supporters${qs({ status, page })}`), placeholderData: keepPreviousData });
  const act = useAction([['admin', 'supporters'], ['supporters']]);
  const set = (s, next) => act.run(s.id, () => api.patch(`/admin/supporters/${s.id}`, { status: next, tier: s.tier ?? null })).catch(() => {});
  return (
    <>
      <AdminHeader title="Supporters" desc="YouTube/Kick memberships are private to creators, so supporter badges are verified by hand.">
        {!adding && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add supporter</Button>}
      </AdminHeader>
      {adding && <AddSupporter onDone={() => setAdding(false)} />}
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['PENDING', 'Claims to review'], ['VERIFIED', 'Verified'], ['REVOKED', 'Revoked'], ['', 'All']]} />
      {act.error && <div className="mb-4"><FormAlert>{act.error}</FormAlert></div>}
      {q.isPending ? <Skeleton className="h-80" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          <Table head={['Fan', 'Supports', 'Tier / since', 'Status', '']} empty={!q.data.data.length && <p className="p-8 text-center text-sm text-ink-400">Nothing here.</p>}>
            {q.data.data.map((s) => (
              <tr key={s.id} className="hover:bg-ink-800/50">
                <td className="px-4 py-3"><p className="font-semibold text-ink-100">{s.userName}</p><p className="text-xs text-ink-400">{s.userEmail}</p></td>
                <td className="px-4 py-3 text-ink-300">{s.memberName}</td>
                <td className="px-4 py-3 text-ink-300">{s.tier || '—'}{s.since && <span className="block text-xs text-ink-500">since {formatDate(s.since)}</span>}</td>
                <td className="px-4 py-3"><Badge tone={s.status === 'VERIFIED' ? 'success' : s.status === 'PENDING' ? 'ember' : 'default'}>{s.status}</Badge> <span className="text-[10px] text-ink-500">{s.source}{s.isPublic ? ' · public' : ' · private'}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {s.status !== 'VERIFIED' && <Button size="sm" variant="secondary" loading={act.busy === s.id} onClick={() => set(s, 'VERIFIED')}><Check className="h-4 w-4" /> Verify</Button>}
                  {s.status !== 'REVOKED' && <Button size="sm" variant="ghost" disabled={act.busy === s.id} onClick={() => set(s, 'REVOKED')}>{s.status === 'PENDING' ? 'Decline' : 'Revoke'}</Button>}
                </td>
              </tr>
            ))}
          </Table>
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

// ── Hall of Fame ─────────────────────────────────────────────────────────
const ACH_EMPTY = { title: '', description: '', category: 'TOURNAMENT', achievedAt: '', imageUrl: '', memberId: '', isFeatured: false, inHallOfFame: true };
const MS_EMPTY = { memberId: '', platform: 'YOUTUBE', type: 'SUBSCRIBERS', value: '', title: '', achievedAt: '', isFeatured: false };
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function HofForm({ kind, initial, onDone }) {
  const isMs = kind === 'milestones';
  const [f, setF] = useState(() => (initial ? { ...(isMs ? MS_EMPTY : ACH_EMPTY), ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ''])), achievedAt: day(initial.achievedAt) } : (isMs ? MS_EMPTY : ACH_EMPTY)));
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const bind = (k) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }), error: errors[k] });
  const check = (k, label) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-dragon-500" checked={Boolean(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {label}</label>;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({}); setMsg(null);
    const body = isMs
      ? { memberId: f.memberId, platform: f.platform, type: f.type, value: f.value === '' ? null : Number(String(f.value).replace(/[, ]/g, '')), title: f.title, achievedAt: f.achievedAt, isFeatured: f.isFeatured }
      : { title: f.title, description: f.description, category: f.category, achievedAt: f.achievedAt, imageUrl: f.imageUrl, memberId: f.memberId, isFeatured: f.isFeatured, inHallOfFame: f.inHallOfFame };
    try {
      if (initial) await api.patch(`/admin/${kind}/${initial.id}`, body); else await api.post(`/admin/${kind}`, body);
      qc.invalidateQueries({ queryKey: ['admin', kind] }); qc.invalidateQueries({ queryKey: ['hall-of-fame'] });
      onDone();
    } catch (err) { setErrors(err.fieldErrors ?? {}); setMsg(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card mb-6 space-y-4 p-5" noValidate>
      <h2 className="text-xl font-bold">{initial ? 'Edit' : 'New'} {isMs ? 'milestone' : 'achievement'}</h2>
      {msg && <FormAlert>{msg}</FormAlert>}
      {isMs ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <MemberSelect label="Creator *" value={f.memberId} onChange={(v) => setF({ ...f, memberId: v })} required error={errors.memberId} />
          <Field label="Title *" maxLength={120} placeholder="e.g. 100K subscribers on YouTube" {...bind('title')} />
          <Field as="select" label="Platform" {...bind('platform')}><option value="">None</option>{Object.entries(PLATFORM_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</Field>
          <Field as="select" label="Type *" {...bind('type')}>{['SUBSCRIBERS', 'FOLLOWERS', 'VIEWS', 'RP_ACHIEVEMENT', 'CUSTOM'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Field>
          <Field label="Value" inputMode="numeric" placeholder="100000" {...bind('value')} />
          <Field label="Date *" type="date" {...bind('achievedAt')} />
          {check('isFeatured', 'Featured')}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title *" maxLength={160} className="sm:col-span-2" {...bind('title')} />
          <Field as="select" label="Category *" {...bind('category')}>{['TOURNAMENT', 'EVENT', 'MILESTONE', 'MOMENT', 'HISTORY'].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Field>
          <Field label="Date *" type="date" {...bind('achievedAt')} />
          <MemberSelect label="Member (optional)" value={f.memberId} onChange={(v) => setF({ ...f, memberId: v })} error={errors.memberId} />
          <div className="flex flex-col justify-end gap-2">{check('inHallOfFame', 'Show in Hall of Fame')}{check('isFeatured', 'Featured (gold border)')}</div>
          <Field as="textarea" label="Story" rows={4} maxLength={3000} className="sm:col-span-2" {...bind('description')} />
          <div className="sm:col-span-2"><ImageField label="Image" kind="achievement" value={f.imageUrl} onChange={(v) => setF({ ...f, imageUrl: v })} error={errors.imageUrl} /></div>
        </div>
      )}
      <div className="flex gap-2"><Button type="submit" loading={busy}>Save</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

export function AdminHallOfFame() {
  const [kind, setKind] = useState('achievements');
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const q = useQuery({ queryKey: ['admin', kind], queryFn: () => api.get(`/admin/${kind}`).then((r) => r.data) });
  const act = useAction([['admin', kind], ['hall-of-fame']]);
  const remove = (row) => window.confirm(`Delete “${row.title}”?`) && act.run(row.id, () => api.del(`/admin/${kind}/${row.id}`)).catch(() => {});
  return (
    <>
      <AdminHeader title="Hall of Fame" desc="Tournament wins, legendary moments and creator milestones.">
        {!editing && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New {kind === 'milestones' ? 'milestone' : 'achievement'}</Button>}
      </AdminHeader>
      <Tabs value={kind} onChange={(v) => { setKind(v); setEditing(null); }} options={[['achievements', 'Achievements'], ['milestones', 'Creator milestones']]} />
      {editing && <HofForm key={editing === 'new' ? `new-${kind}` : editing.id} kind={kind} initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      {act.error && <div className="mb-4"><FormAlert>{act.error}</FormAlert></div>}
      {q.isPending ? <Skeleton className="h-80" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <Table head={kind === 'milestones' ? ['Milestone', 'Creator', 'Value', 'Date', ''] : ['Achievement', 'Member', 'Category', 'Date', '']}
          empty={!q.data.length && <p className="p-8 text-center text-sm text-ink-400">Nothing yet — add the first one.</p>}>
          {q.data.map((r) => (
            <tr key={r.id} className="hover:bg-ink-800/50">
              <td className="px-4 py-3 font-semibold text-ink-100">{r.isFeatured && <Star className="mr-1 inline h-3 w-3 fill-dragon-400 text-dragon-400" />}{r.title}{kind === 'achievements' && !r.inHallOfFame && <span className="ml-2 text-xs font-normal text-ink-500">(hidden)</span>}</td>
              <td className="px-4 py-3 text-ink-300">{r.member?.displayName ?? '—'}</td>
              <td className="px-4 py-3 text-ink-300">{kind === 'milestones' ? (r.value != null ? compact(r.value) : '—') : titleCase(r.category)}</td>
              <td className="px-4 py-3 text-ink-400">{formatDate(r.achievedAt)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <button type="button" className={iconBtn} onClick={() => { setEditing(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                <button type="button" className={iconBtn} disabled={act.busy === r.id} onClick={() => remove(r)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
