// Admin: Polls, Crew applications, Quote Wall moderation, Comment moderation.
import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, ExternalLink, Eye, EyeOff, Lock, Pin, Plus, Star, Trash2, Unlock, X } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { formatDate, formatDateTime, safeUrl, timeAgo } from '../lib/format.js';
import { Badge, Pagination } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, FormAlert } from '../components/ui/Field.jsx';
import { ErrorState, Skeleton } from '../components/ui/States.jsx';
import { AdminHeader, Table } from './ui.jsx';
import { MemberSelect, fromLocalInput, useMemberOptions } from './fields.jsx';

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

function useAction(keys) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const run = async (id, fn) => {
    setBusy(id); setError(null);
    try { const r = await fn(); keys.forEach((k) => qc.invalidateQueries({ queryKey: k })); return r; }
    catch (err) { setError(errText(err)); return null; } finally { setBusy(null); }
  };
  return { run, busy, error };
}

// ── Polls ───────────────────────────────────────────────────────────────
function NewPoll({ onDone }) {
  const [f, setF] = useState({ question: '', description: '', options: ['', ''], closesAt: '', isPinned: true, memberId: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const setOpt = (i, v) => setF({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.post('/admin/polls', { ...f, options: f.options.map((o) => o.trim()).filter(Boolean), closesAt: fromLocalInput(f.closesAt), memberId: f.memberId || null, description: f.description || undefined });
      qc.invalidateQueries({ queryKey: ['admin', 'polls'] });
      qc.invalidateQueries({ queryKey: ['polls'] });
      onDone();
    } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  const fe = err?.fieldErrors ?? {};
  return (
    <form onSubmit={submit} className="card mb-6 grid gap-4 p-5 sm:grid-cols-2">
      <Field className="sm:col-span-2" label="Question *" value={f.question} maxLength={200} onChange={(e) => setF({ ...f, question: e.target.value })} error={fe.question} placeholder="Who wins the street race this Friday?" />
      <Field className="sm:col-span-2" label="Description" value={f.description} maxLength={500} onChange={(e) => setF({ ...f, description: e.target.value })} error={fe.description} />
      <div className="space-y-2 sm:col-span-2">
        <p className="label">Options * (2–6)</p>
        {f.options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input className="input flex-1" value={o} maxLength={120} placeholder={`Option ${i + 1}`} onChange={(e) => setOpt(i, e.target.value)} aria-label={`Option ${i + 1}`} />
            {f.options.length > 2 && <button type="button" className={iconBtn} onClick={() => setF({ ...f, options: f.options.filter((_, j) => j !== i) })} aria-label="Remove option"><X className="h-4 w-4" /></button>}
          </div>
        ))}
        {fe.options && <p className="text-xs text-dragon-300">{fe.options}</p>}
        {f.options.length < 6 && <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, options: [...f.options, ''] })}><Plus className="h-3.5 w-3.5" /> Add option</Button>}
      </div>
      <Field label="Closes at (optional)" type="datetime-local" value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} error={fe.closesAt} hint="Leave empty to close it manually" />
      <MemberSelect label="About a member (optional)" value={f.memberId} onChange={(v) => setF({ ...f, memberId: v })} />
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-dragon-500" checked={f.isPinned} onChange={(e) => setF({ ...f, isPinned: e.target.checked })} /> Pin to the home page (unpins any other poll)</label>
      {err && !Object.keys(fe).length && <div className="sm:col-span-2"><FormAlert>{err.message}</FormAlert></div>}
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" loading={busy}>Create poll</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

export function AdminPolls() {
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'polls'], queryFn: () => api.get('/admin/polls').then((r) => r.data) });
  const act = useAction([['admin', 'polls'], ['polls']]);
  return (
    <div>
      <AdminHeader title="Polls" desc="Ask the fans. Votes earn them XP; results show after they vote or when the poll closes.">
        {!adding && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New poll</Button>}
      </AdminHeader>
      {adding && <NewPoll onDone={() => setAdding(false)} />}
      {act.error && <div className="mb-4"><FormAlert>{act.error}</FormAlert></div>}
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <div className="space-y-3">
          {q.data.length === 0 && <p className="card p-6 text-sm text-ink-400">No polls yet — create the first one.</p>}
          {q.data.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    <Badge tone={p.isOpen ? 'success' : 'default'}>{p.isOpen ? 'Open' : 'Closed'}</Badge>
                    {p.isPinned && <Badge tone="dragon"><Pin className="h-3 w-3" /> Pinned</Badge>}
                    {p.closesAt && <span className="text-xs text-ink-400">{p.isOpen ? 'closes' : 'closed'} {formatDateTime(p.closesAt)}</span>}
                  </div>
                  <p className="font-semibold text-ink-100">{p.question}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {p.options.map((o) => {
                      const pct = p.totalVotes ? Math.round((o.votes / p.totalVotes) * 100) : 0;
                      return <li key={o.id} className="flex items-center gap-2"><span className="w-40 truncate text-ink-300 sm:w-60">{o.label}</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800"><span className="block h-full bg-dragon-400" style={{ width: `${pct}%` }} /></span><span className="w-16 text-right text-xs text-ink-400">{o.votes} · {pct}%</span></li>;
                    })}
                  </ul>
                  <p className="mt-1 text-xs text-ink-500">{p.totalVotes} votes · created {timeAgo(p.createdAt)}</p>
                </div>
                <div className="flex gap-1">
                  <button type="button" className={iconBtn} disabled={act.busy === p.id} title={p.isPinned ? 'Unpin' : 'Pin to home'} onClick={() => act.run(p.id, () => api.patch(`/admin/polls/${p.id}`, { isPinned: !p.isPinned }))}><Pin className={`h-4 w-4 ${p.isPinned ? 'text-dragon-300' : ''}`} /></button>
                  <button type="button" className={iconBtn} disabled={act.busy === p.id} title={p.status === 'OPEN' ? 'Close poll' : 'Re-open poll'} onClick={() => act.run(p.id, () => api.patch(`/admin/polls/${p.id}`, p.status === 'OPEN' ? { status: 'CLOSED' } : { status: 'OPEN', closesAt: null }))}>{p.status === 'OPEN' ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}</button>
                  <button type="button" className={`${iconBtn} hover:text-red-400`} disabled={act.busy === p.id} title="Delete" onClick={() => window.confirm('Delete this poll and its votes from view?') && act.run(p.id, () => api.del(`/admin/polls/${p.id}`))}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Crew applications ───────────────────────────────────────────────────
const APP_TONE = { PENDING: 'ember', REVIEWING: 'dragon', ACCEPTED: 'success', REJECTED: 'default', WITHDRAWN: 'default' };

function ApplicationRow({ a, act }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(a.messageToApplicant ?? '');
  const [note, setNote] = useState(a.internalNote ?? '');
  const decide = (status) => act.run(a.id, () => api.patch(`/admin/applications/${a.id}`, { status, messageToApplicant: msg, internalNote: note }));
  const closed = ['ACCEPTED', 'REJECTED', 'WITHDRAWN'].includes(a.status);
  return (
    <div className="card p-4">
      <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink-100">{a.rpName}</span><Badge tone={APP_TONE[a.status]}>{a.status}</Badge></div>
          <p className="truncate text-xs text-ink-400">{a.userName} · {a.userEmail} · Discord: {a.discordTag} · {formatDate(a.createdAt)}</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-ink-400" /> : <ChevronDown className="h-4 w-4 text-ink-400" />}
      </button>
      {open && (
        <div className="mt-4 grid gap-4 border-t border-ink-700 pt-4 text-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div><p className="label">RP experience</p><p className="whitespace-pre-line text-ink-200">{a.experience}</p></div>
            <div><p className="label">Why the Dragonz</p><p className="whitespace-pre-line text-ink-200">{a.whyDrz}</p></div>
          </div>
          <div className="flex flex-wrap gap-4 text-ink-300">
            {a.availability && <span><b className="text-ink-200">Availability:</b> {a.availability}</span>}
            {safeUrl(a.clipUrl) && <a href={a.clipUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-dragon-300 hover:text-white"><ExternalLink className="h-3.5 w-3.5" /> Clip</a>}
            <span className="text-ink-500">18+ confirmed</span>
          </div>
          <Field as="textarea" label="Message to applicant (they see this + get it by email)" value={msg} maxLength={500} onChange={(e) => setMsg(e.target.value)} disabled={a.status === 'WITHDRAWN'} />
          <Field as="textarea" label="Internal note (staff only)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {a.status === 'PENDING' && <Button size="sm" variant="secondary" loading={act.busy === a.id} onClick={() => decide('REVIEWING')}><Eye className="h-3.5 w-3.5" /> Mark reviewing</Button>}
            {!closed && <Button size="sm" loading={act.busy === a.id} onClick={() => decide('ACCEPTED')}><Check className="h-3.5 w-3.5" /> Accept</Button>}
            {!closed && <Button size="sm" variant="danger" loading={act.busy === a.id} onClick={() => decide('REJECTED')}><X className="h-3.5 w-3.5" /> Reject</Button>}
            {a.status !== 'WITHDRAWN' && <Button size="sm" variant="ghost" loading={act.busy === a.id} onClick={() => act.run(a.id, () => api.patch(`/admin/applications/${a.id}`, { messageToApplicant: msg, internalNote: note }))}>Save notes only</Button>}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminApplications() {
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'applications', status, page], queryFn: () => api.get(`/admin/applications${qs({ status, page })}`), placeholderData: keepPreviousData });
  const act = useAction([['admin', 'applications']]);
  const c = q.data?.meta?.counts ?? {};
  return (
    <div>
      <AdminHeader title="Crew applications" desc="Fans apply at /join while recruitment is open (Admin → Settings → Recruitment open)." />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
        ['OPEN', `To review (${(c.PENDING ?? 0) + (c.REVIEWING ?? 0)})`], ['ACCEPTED', `Accepted (${c.ACCEPTED ?? 0})`], ['REJECTED', `Rejected (${c.REJECTED ?? 0})`], ['WITHDRAWN', 'Withdrawn'],
      ]} />
      {act.error && <div className="mb-4"><FormAlert>{act.error}</FormAlert></div>}
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <div className="space-y-3">
          {q.data.data.length === 0 && <p className="card p-6 text-sm text-ink-400">Nothing here.</p>}
          {q.data.data.map((a) => <ApplicationRow key={a.id} a={a} act={act} />)}
          <Pagination meta={q.data.meta} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

// ── Quote wall ──────────────────────────────────────────────────────────
function AddQuote({ onDone }) {
  const members = useMemberOptions();
  const [f, setF] = useState({ text: '', memberSlug: '', characterName: '', context: '', isFeatured: false });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.post('/admin/quotes', f); qc.invalidateQueries({ queryKey: ['admin', 'quotes'] }); onDone(); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  const fe = err?.fieldErrors ?? {};
  return (
    <form onSubmit={submit} className="card mb-6 grid gap-4 p-5 sm:grid-cols-2">
      <Field as="textarea" className="sm:col-span-2" label="Quote *" value={f.text} maxLength={280} onChange={(e) => setF({ ...f, text: e.target.value })} error={fe.text} />
      <Field as="select" label="Member" value={f.memberSlug} onChange={(e) => setF({ ...f, memberSlug: e.target.value })}>
        <option value="">— None —</option>
        {members.data?.map((m) => <option key={m.id} value={m.slug}>{m.name}</option>)}
      </Field>
      <Field label="Character name" value={f.characterName} maxLength={80} onChange={(e) => setF({ ...f, characterName: e.target.value })} />
      <Field className="sm:col-span-2" label="Context" value={f.context} maxLength={140} onChange={(e) => setF({ ...f, context: e.target.value })} />
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-dragon-500" checked={f.isFeatured} onChange={(e) => setF({ ...f, isFeatured: e.target.checked })} /> Featured (shown first on the home page)</label>
      {err && !Object.keys(fe).length && <div className="sm:col-span-2"><FormAlert>{err.message}</FormAlert></div>}
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" loading={busy}>Add to wall</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

export function AdminQuotes() {
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'quotes', status, page], queryFn: () => api.get(`/admin/quotes${qs({ status, page })}`), placeholderData: keepPreviousData });
  const act = useAction([['admin', 'quotes'], ['quotes'], ['home']]);
  return (
    <div>
      <AdminHeader title="Quote Wall" desc="Approve fan-submitted quotes. Approving pays the submitter +15 XP.">
        {!adding && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add quote</Button>}
      </AdminHeader>
      {adding && <AddQuote onDone={() => setAdding(false)} />}
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']]} />
      {act.error && <div className="mb-4"><FormAlert>{act.error}</FormAlert></div>}
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <Table head={['Quote', 'Who', 'Submitted', '']} empty={q.data.data.length === 0 && <p className="p-6 text-sm text-ink-400">Nothing here.</p>}>
          {q.data.data.map((x) => (
            <tr key={x.id}>
              <td className="max-w-md px-4 py-3"><p className="text-ink-100">“{x.text}”</p>{x.context && <p className="text-xs text-ink-500">{x.context}</p>}</td>
              <td className="px-4 py-3 text-ink-300">{x.characterName ?? '—'}{x.member ? <span className="block text-xs text-ink-500">{x.member.displayName}</span> : null}</td>
              <td className="px-4 py-3 text-xs text-ink-400">{x.submittedBy ?? '—'}<br />{timeAgo(x.createdAt)}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  {x.status !== 'APPROVED' && <button type="button" className={`${iconBtn} hover:text-emerald-300`} title="Approve" disabled={act.busy === x.id} onClick={() => act.run(x.id, () => api.patch(`/admin/quotes/${x.id}`, { status: 'APPROVED' }))}><Check className="h-4 w-4" /></button>}
                  {x.status === 'APPROVED' && <button type="button" className={iconBtn} title={x.isFeatured ? 'Unfeature' : 'Feature'} disabled={act.busy === x.id} onClick={() => act.run(x.id, () => api.patch(`/admin/quotes/${x.id}`, { isFeatured: !x.isFeatured }))}><Star className={`h-4 w-4 ${x.isFeatured ? 'fill-dragon-400 text-dragon-400' : ''}`} /></button>}
                  {x.status !== 'REJECTED' && <button type="button" className={iconBtn} title="Reject" disabled={act.busy === x.id} onClick={() => act.run(x.id, () => api.patch(`/admin/quotes/${x.id}`, { status: 'REJECTED' }))}><X className="h-4 w-4" /></button>}
                  <button type="button" className={`${iconBtn} hover:text-red-400`} title="Delete" disabled={act.busy === x.id} onClick={() => window.confirm('Delete this quote?') && act.run(x.id, () => api.del(`/admin/quotes/${x.id}`))}><Trash2 className="h-4 w-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {q.data && <Pagination meta={q.data.meta} onPage={setPage} />}
    </div>
  );
}

// ── Comments ────────────────────────────────────────────────────────────
export function AdminComments() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'comments', status, page], queryFn: () => api.get(`/admin/comments${qs({ status, page })}`), placeholderData: keepPreviousData });
  const act = useAction([['admin', 'comments'], ['social']]);
  return (
    <div>
      <AdminHeader title="Comments" desc="Newest first. Hidden comments disappear from the site but stay here; deleted ones are gone." />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['', 'All'], ['VISIBLE', 'Visible'], ['HIDDEN', 'Hidden']]} />
      {act.error && <div className="mb-4"><FormAlert>{act.error}</FormAlert></div>}
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <Table head={['Comment', 'On', 'Author', '']} empty={q.data.data.length === 0 && <p className="p-6 text-sm text-ink-400">No comments yet.</p>}>
          {q.data.data.map((c) => (
            <tr key={c.id} className={c.status === 'HIDDEN' ? 'opacity-60' : ''}>
              <td className="max-w-md px-4 py-3"><p className="whitespace-pre-line break-words text-ink-100">{c.body}</p><p className="text-xs text-ink-500">{timeAgo(c.createdAt)}{c.status === 'HIDDEN' && ' · hidden'}</p></td>
              <td className="max-w-[200px] px-4 py-3 text-xs"><span className="text-ink-500">{c.targetType.toLowerCase()}</span><br />{c.target.url ? <a href={c.target.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-dragon-300 hover:text-white">{c.target.title}</a> : <span className="text-ink-400">{c.target.title}</span>}</td>
              <td className="px-4 py-3 text-xs text-ink-300">{c.authorName}<br /><span className="text-ink-500">{c.authorEmail}</span></td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <button type="button" className={iconBtn} disabled={act.busy === c.id} title={c.status === 'HIDDEN' ? 'Show again' : 'Hide'} onClick={() => act.run(c.id, () => api.patch(`/admin/comments/${c.id}`, { status: c.status === 'HIDDEN' ? 'VISIBLE' : 'HIDDEN' }))}>{c.status === 'HIDDEN' ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                  <button type="button" className={`${iconBtn} hover:text-red-400`} disabled={act.busy === c.id} title="Delete" onClick={() => window.confirm('Delete this comment?') && act.run(c.id, () => api.del(`/admin/comments/${c.id}`))}><Trash2 className="h-4 w-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {q.data && <Pagination meta={q.data.meta} onPage={setPage} />}
    </div>
  );
}
