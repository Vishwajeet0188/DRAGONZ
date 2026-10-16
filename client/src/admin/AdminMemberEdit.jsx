import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Crosshair, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { PLATFORMS, PLATFORM_META } from '../lib/platforms.js';
import { Field, FormAlert } from '../components/ui/Field.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { ErrorState, PageLoader, Skeleton } from '../components/ui/States.jsx';
import { ImageField } from './fields.jsx';
import { safeUrl } from '../lib/format.js';
import { AdminHeader } from './ui.jsx';

const EMPTY = {
  displayName: '', slug: '', rank: 'Soldier', rankOrder: '', rpCharacter: '', tagline: '', bio: '', avatarUrl: '', bannerUrl: '',
  accentColor: '#d9a514', isCreator: false, isFeatured: false, isShooter: false, status: 'ACTIVE', joinedAt: '', birthMonth: '', birthDay: '',
};

const toForm = (m) => ({
  ...EMPTY,
  ...Object.fromEntries(Object.entries(m).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])),
  joinedAt: m.joinedAt ? m.joinedAt.slice(0, 10) : '',
});

function toPayload(f, isNew) {
  const out = { ...f, rankOrder: f.rankOrder === '' ? undefined : Number(f.rankOrder), joinedAt: f.joinedAt ? new Date(f.joinedAt).toISOString() : null,
    birthMonth: f.birthMonth ? Number(f.birthMonth) : null, birthDay: f.birthDay ? Number(f.birthDay) : null };
  if (!out.slug) delete out.slug; // server generates one for new members; unchanged for edits
  for (const k of ['rpCharacter', 'tagline', 'bio', 'avatarUrl', 'bannerUrl', 'accentColor']) if (out[k] === '') out[k] = null;
  return out;
}

/** "63700", "63.7K", "1.2M" → integer; '' → null; anything else → undefined (invalid). */
export function parseFollowers(v) {
  const t = String(v ?? '').trim().replace(/,/g, '');
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?)\s*([kKmM])?$/.exec(t);
  if (!m) return undefined;
  const mult = { k: 1e3, m: 1e6 }[m[2]?.toLowerCase()] ?? 1;
  const n = Math.round(Number(m[1]) * mult);
  return m[2] || Number.isInteger(Number(m[1])) ? n : undefined;
}

function PlatformsEditor({ rows, setRows, errors }) {
  const used = new Set(rows.map((r) => r.platform));
  const add = () => {
    const next = PLATFORMS.find((p) => !used.has(p));
    if (next) setRows([...rows, { platform: next, handle: '', url: '', followerCount: '', isPrimary: rows.length === 0, syncEnabled: true }]);
  };
  const set = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : patch.isPrimary ? { ...r, isPrimary: false } : r)));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const err = (k) => errors[`platforms.${i}.${k}`];
        return (
          <div key={i} className="grid gap-3 rounded-xl border border-ink-700 bg-ink-900/60 p-3 md:grid-cols-[150px_1fr_1.6fr_110px_auto]">
            <Field as="select" label="Platform" value={r.platform} onChange={(e) => set(i, { platform: e.target.value })}>
              {PLATFORMS.map((p) => <option key={p} value={p} disabled={p !== r.platform && used.has(p)}>{PLATFORM_META[p].label}</option>)}
            </Field>
            <Field label="Handle" placeholder="@handle" value={r.handle} onChange={(e) => set(i, { handle: e.target.value })} error={err('handle')} />
            <Field label="Profile URL" placeholder="https://" value={r.url} onChange={(e) => set(i, { url: e.target.value })} error={err('url')} />
            <Field label="Followers" placeholder={r.platform === 'YOUTUBE' ? 'auto' : 'e.g. 52K'} value={r.followerCount ?? ''} onChange={(e) => set(i, { followerCount: e.target.value })} error={err('followerCount')}
              hint={r.platform === 'YOUTUBE' ? 'Auto from sync' : r.platform === 'KICK' ? 'Type it in — Kick’s API doesn’t share follower counts' : undefined} />
            <div className="flex items-end gap-2">
              <label className="flex h-10 items-center gap-1.5 text-xs text-ink-300"><input type="radio" name="primary" checked={r.isPrimary} onChange={() => set(i, { isPrimary: true })} className="accent-dragon-500" /> Primary</label>
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="grid h-10 w-10 place-items-center rounded-lg text-ink-400 hover:bg-ink-700 hover:text-dragon-300" aria-label={`Remove ${PLATFORM_META[r.platform].label}`}><Trash2 className="h-4 w-4" /></button>
            </div>
            {['YOUTUBE', 'KICK'].includes(r.platform) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs md:col-span-5">
                <label className="flex items-center gap-1.5 text-ink-300">
                  <input type="checkbox" className="accent-dragon-500" checked={r.syncEnabled !== false} onChange={(e) => set(i, { syncEnabled: e.target.checked })} />
                  Auto-sync live status {r.platform === 'YOUTUBE' ? '& videos' : ''} from {PLATFORM_META[r.platform].label}
                </label>
                {r.syncError ? <span className="text-red-400">⚠ {r.syncError}</span>
                  : r.lastSyncedAt ? <span className="text-emerald-400">✔ Synced {new Date(r.lastSyncedAt).toLocaleString()}</span>
                  : <span className="text-ink-500">Not synced yet</span>}
              </div>
            )}
          </div>
        );
      })}
      {errors.platforms && <FormAlert>{errors.platforms}</FormAlert>}
      <Button type="button" variant="secondary" size="sm" onClick={add} disabled={used.size >= PLATFORMS.length}><Plus className="h-4 w-4" /> Add platform</Button>
    </div>
  );
}

/** Up to 6 label/value combat-stat rows. */
function StatsEditor({ stats, setStats }) {
  const set = (i, patch) => setStats(stats.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-2">
      {stats.map((s, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Field label={i === 0 ? 'Label' : undefined} placeholder="K/D" value={s.label} maxLength={24} onChange={(e) => set(i, { label: e.target.value })} />
          <Field label={i === 0 ? 'Value' : undefined} placeholder="3.4" value={s.value} maxLength={24} onChange={(e) => set(i, { value: e.target.value })} />
          <button type="button" onClick={() => setStats(stats.filter((_, j) => j !== i))} className={`grid h-10 w-10 place-items-center self-end rounded-lg text-ink-400 hover:bg-ink-700 hover:text-red-300`} aria-label="Remove stat"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      {stats.length < 6 && <Button type="button" variant="secondary" size="sm" onClick={() => setStats([...stats, { label: '', value: '' }])}><Plus className="h-4 w-4" /> Add stat</Button>}
    </div>
  );
}

/** Add / list / delete a shooter's POV clips (link + optional uploaded thumbnail). */
function ShooterPovs({ memberId }) {
  const qc = useQueryClient();
  const base = `/admin/shooters/${memberId}/povs`;
  const q = useQuery({ queryKey: ['admin', 'shooter-povs', memberId], queryFn: () => api.get(base).then((r) => r.data), placeholderData: keepPreviousData });
  const [f, setF] = useState({ title: '', url: '', thumbnailUrl: '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'shooter-povs', memberId] });
  const add = async () => {
    setBusy(true); setErr({});
    try {
      await api.post(base, { title: f.title, url: f.url, thumbnailUrl: f.thumbnailUrl || undefined });
      setF({ title: '', url: '', thumbnailUrl: '' }); refresh();
    } catch (e) { setErr(e.fieldErrors ?? { url: e.message }); } finally { setBusy(false); }
  };
  const del = async (id) => { await api.del(`/admin/shooters/povs/${id}`).catch(() => {}); refresh(); };
  return (
    <div className="space-y-3">
      {q.isPending ? <Skeleton className="h-16" /> : q.data?.length > 0 && (
        <ul className="space-y-2">
          {q.data.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900/60 p-2">
              {safeUrl(p.thumbnailUrl) ? <img src={p.thumbnailUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" /> : <div className="grid h-10 w-16 shrink-0 place-items-center rounded bg-ink-800 text-[10px] text-ink-500">clip</div>}
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink-100">{p.title}</p><p className="truncate text-xs text-ink-500">{p.url}</p></div>
              <button type="button" onClick={() => del(p.id)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 hover:bg-ink-700 hover:text-red-300" aria-label="Delete POV"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3 rounded-xl border border-ink-700 bg-ink-900/40 p-3">
        <Field label="Clip title" placeholder="1v4 clutch at the docks" value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} error={err.title} />
        <Field label="Clip link" placeholder="https://youtube.com/… or kick.com, medal.tv, streamable.com" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} error={err.url} hint="YouTube, Kick, Twitch, Medal, Streamable, Instagram, TikTok or X" />
        <ImageField label="Thumbnail (optional)" kind="content" value={f.thumbnailUrl} onChange={(v) => setF({ ...f, thumbnailUrl: v })} error={err.thumbnailUrl} />
        <Button type="button" size="sm" loading={busy} onClick={add} disabled={!f.title.trim() || !f.url.trim()}><Plus className="h-4 w-4" /> Add POV</Button>
      </div>
    </div>
  );
}

export default function AdminMemberEdit() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'member', id], queryFn: () => api.get(`/admin/members/${id}`).then((r) => r.data), enabled: !isNew });

  const [form, setForm] = useState(EMPTY);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState([]);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (q.data) {
      setForm(toForm(q.data));
      setRows(q.data.platforms.map(({ platform, handle, url, followerCount, isPrimary, syncEnabled, syncError, lastSyncedAt }) => ({ platform, handle, url, followerCount: followerCount ?? '', isPrimary, syncEnabled, syncError, lastSyncedAt })));
      setStats(Array.isArray(q.data.shooterStats) ? q.data.shooterStats.map((s) => ({ label: s.label ?? '', value: s.value ?? '' })) : []);
    }
  }, [q.data]);

  const bind = (k) => ({ value: form[k] ?? '', onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })), error: errors[k] });
  const check = (k) => ({ checked: Boolean(form[k]), onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.checked })) });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setMsg(null);

    // Check platform rows before saving anything, so a bad row never leaves a half-saved member.
    const platformErrors = {};
    const platforms = rows.map(({ syncError, lastSyncedAt, ...r }, i) => {
      const followerCount = parseFollowers(r.followerCount);
      if (followerCount === undefined) platformErrors[`platforms.${i}.followerCount`] = 'Use a number like 63700 or 63.7K (or leave empty)';
      if (!r.handle?.trim()) platformErrors[`platforms.${i}.handle`] = 'Required';
      if (!/^https:\/\//.test(r.url ?? '')) platformErrors[`platforms.${i}.url`] = 'Must start with https://';
      return { ...r, syncEnabled: r.syncEnabled !== false, followerCount };
    });
    if (Object.keys(platformErrors).length) {
      setErrors(platformErrors);
      setMsg({ tone: 'error', text: 'Please fix the highlighted platform fields.' });
      setBusy(false);
      return;
    }

    const shooterStats = stats.map((s) => ({ label: s.label.trim(), value: s.value.trim() })).filter((s) => s.label && s.value);

    let saved = null;
    try {
      saved = isNew
        ? (await api.post('/admin/members', { ...toPayload(form, true), shooterStats })).data
        : (await api.patch(`/admin/members/${id}`, { ...toPayload(form, false), shooterStats })).data;
      await api.put(`/admin/members/${saved.id}/platforms`, { platforms });
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['home'] });
      if (isNew) navigate(`/admin/members/${saved.id}`, { replace: true });
      setMsg({ tone: 'success', text: 'Member saved.' });
    } catch (err) {
      const fieldErrors = err.fieldErrors ?? {};
      setErrors(fieldErrors);
      const names = Object.keys(fieldErrors).map((k) => k.replace(/^platforms\.(\d+)\./, (_, n) => `platform ${Number(n) + 1} `)).join(', ');
      setMsg({ tone: 'error', text: err.details ? `Please fix: ${names}` : err.message });
      // Member row was created but the platforms failed — move to its edit page so Save doesn't create a duplicate.
      if (isNew && saved) navigate(`/admin/members/${saved.id}`, { replace: true });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/admin/members/${id}`);
      qc.invalidateQueries({ queryKey: ['admin'] });
      navigate('/admin/members', { replace: true });
    } catch (err) { setMsg({ tone: 'error', text: err.message }); setBusy(false); }
  };

  if (!isNew && q.isPending) return <PageLoader />;
  if (!isNew && q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;

  return (
    <form onSubmit={save} noValidate>
      <Link to="/admin/members" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Members</Link>
      <AdminHeader title={isNew ? 'Add member' : `Edit ${q.data.displayName}`}>
        {!isNew && <Button variant="ghost" href={`/members/${q.data.slug}`}><ExternalLink className="h-4 w-4" /> View profile</Button>}
        <Button type="submit" loading={busy}>Save</Button>
      </AdminHeader>
      {msg && <div className="mb-4"><FormAlert tone={msg.tone}>{msg.text}</FormAlert></div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">Identity</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name *" {...bind('displayName')} maxLength={60} />
              <Field label="URL slug" {...bind('slug')} placeholder="auto from name" hint={form.slug ? `/members/${form.slug}` : 'Leave blank to generate'} />
              <Field label="Dragonz role *" {...bind('rank')} maxLength={40} hint="e.g. Boss, Underboss, Enforcer" />
              <Field label="Role order" type="number" min="0" max="1000" {...bind('rankOrder')} hint="Lower = more senior / shown first. Leave blank to add to the end." />
              <Field label="RP character" {...bind('rpCharacter')} maxLength={80} />
              <Field label="Joined Dragonz" type="date" {...bind('joinedAt')} hint="Used for anniversary shout-outs" />
              <div className="grid grid-cols-2 gap-2">
                <Field as="select" label="Birthday month" {...bind('birthMonth')}>
                  <option value="">—</option>
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </Field>
                <Field label="Day" type="number" min="1" max="31" {...bind('birthDay')} hint="No year stored" />
              </div>
            </div>
            <Field label="Tagline" {...bind('tagline')} maxLength={140} />
            <Field as="textarea" label="Biography" {...bind('bio')} maxLength={5000} rows={5} />
          </section>

          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">Platforms</h2>
            <p className="-mt-2 text-xs text-ink-400">Links must be https URLs on the official platform domain.</p>
            <PlatformsEditor rows={rows} setRows={setRows} errors={errors} />
          </section>

          {form.isShooter && (
            <section className="card space-y-5 border-red-500/30 p-5">
              <div className="flex items-center gap-2"><Crosshair className="h-5 w-5 text-red-400" /><h2 className="text-lg font-bold">Shooter profile</h2></div>
              <div>
                <p className="label !mb-1">Combat stats</p>
                <p className="mb-3 text-xs text-ink-400">Shown as bold numbers on the Shooters page. Up to 6 — e.g. “K/D” → “3.4”, “Clutches” → “120”.</p>
                <StatsEditor stats={stats} setStats={setStats} />
              </div>
              <div className="border-t border-ink-700 pt-4">
                <p className="label !mb-1">POV clips</p>
                {isNew ? (
                  <p className="text-xs text-ink-400">Save the member first, then add their POV clips here.</p>
                ) : <ShooterPovs memberId={id} />}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">Appearance</h2>
            <div className="flex items-center gap-3">
              <Avatar src={form.avatarUrl} name={form.displayName || 'New'} accent={/^#[0-9a-f]{6}$/i.test(form.accentColor) ? form.accentColor : undefined} size="lg" />
              <label className="text-sm">
                <span className="label">Accent colour</span>
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(form.accentColor) ? form.accentColor : '#d9a514'} onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))} className="h-10 w-20 cursor-pointer rounded-lg border border-ink-600 bg-ink-900" />
              </label>
            </div>
            <Field label="Avatar URL" placeholder="https://" {...bind('avatarUrl')} />
            <Field label="Banner URL" placeholder="https://" {...bind('bannerUrl')} />
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-bold">Visibility</h2>
            <Field as="select" label="Status" {...bind('status')}>
              <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive (hidden)</option><option value="ALUMNI">Alumni</option>
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-dragon-500" {...check('isCreator')} /> Content creator</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-dragon-500" {...check('isFeatured')} /> Pin to Featured crew (always shown, even without hitting the weekly goals)</label>
            <label className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2.5 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-red-500" {...check('isShooter')} /> <span><span className="inline-flex items-center gap-1 font-semibold text-red-300"><Crosshair className="h-3.5 w-3.5" /> Shooter</span><span className="block text-xs text-ink-400">Moves this member off the normal roster and onto the Shooters page.</span></span></label>
          </section>

          {!isNew && (
            <section className="card space-y-3 border-dragon-700/50 p-5">
              <h2 className="text-lg font-bold">Danger zone</h2>
              {confirmDelete ? (
                <div className="space-y-2">
                  <p className="text-sm text-ink-300">Remove {q.data.displayName} from the site? This is logged in the audit trail.</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="danger" size="sm" onClick={remove} loading={busy}>Yes, remove</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  </div>
                </div>
              ) : <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> Remove member</Button>}
            </section>
          )}
        </div>
      </div>
    </form>
  );
}
