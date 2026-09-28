// Admin: News + Events (list + editor).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDate, formatDateTime, titleCase } from '../lib/format.js';
import { Badge, Pagination } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, FormAlert } from '../components/ui/Field.jsx';
import { Markdown } from '../components/ui/Markdown.jsx';
import { ErrorState, PageLoader, Skeleton } from '../components/ui/States.jsx';
import { AdminHeader, Table } from './ui.jsx';
import { ImageField, MemberSelect, fromLocalInput, toLocalInput } from './fields.jsx';

const STATUS_TONE = { PUBLISHED: 'success', DRAFT: 'default', ARCHIVED: 'default', SCHEDULED: 'ember', LIVE: 'dragon', COMPLETED: 'default', CANCELLED: 'default' };

/** Shared editor state: load → form → save/delete with field errors. */
function useEditor({ base, id, empty, toForm, toBody, queryKey }) {
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...queryKey, id], queryFn: () => api.get(`${base}/${id}`).then((r) => r.data), enabled: !isNew });
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setForm(toForm(q.data)); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const bind = (k) => ({ value: form[k] ?? '', onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })), error: errors[k] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true); setErrors({}); setMsg(null);
    try {
      const r = isNew ? await api.post(base, toBody(form)) : await api.patch(`${base}/${id}`, toBody(form));
      qc.invalidateQueries({ queryKey });
      if (isNew) navigate(`/admin${base.replace('/admin', '')}/${r.data.id}`, { replace: true });
      setMsg({ tone: 'success', text: 'Saved.' });
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      setMsg({ tone: 'error', text: err.details ? `Please fix: ${Object.keys(err.fieldErrors).join(', ')}` : err.message });
    } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.del(`${base}/${id}`); qc.invalidateQueries({ queryKey }); navigate(`/admin${base.replace('/admin', '')}`, { replace: true }); }
    catch (err) { setMsg({ tone: 'error', text: err.message }); setBusy(false); }
  };
  return { isNew, q, form, setForm, bind, set, save, remove, msg, busy };
}

function DeleteBox({ onConfirm, busy, label }) {
  const [sure, setSure] = useState(false);
  return (
    <section className="card space-y-2 border-red-900/50 p-5">
      <h2 className="text-lg font-bold">Danger zone</h2>
      {sure ? (
        <div className="flex gap-2"><Button variant="danger" size="sm" loading={busy} onClick={onConfirm}>Yes, delete</Button><Button size="sm" variant="ghost" onClick={() => setSure(false)}>Cancel</Button></div>
      ) : <Button size="sm" variant="outline" onClick={() => setSure(true)}><Trash2 className="h-4 w-4" /> {label}</Button>}
    </section>
  );
}

// ── News ─────────────────────────────────────────────────────────────────
export function AdminNewsList() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'news', page], queryFn: () => api.get(`/admin/news?page=${page}`), placeholderData: keepPreviousData });
  return (
    <>
      <AdminHeader title="News" desc="Announcements, recruitment updates and notices."><Button to="/admin/news/new"><Plus className="h-4 w-4" /> New post</Button></AdminHeader>
      {q.isPending ? <Skeleton className="h-80" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          <Table head={['Title', 'Category', 'Status', 'Published', '']} empty={!q.data.data.length && <p className="p-8 text-center text-sm text-ink-400">No posts yet.</p>}>
            {q.data.data.map((p) => (
              <tr key={p.id} className="hover:bg-ink-800/50">
                <td className="px-4 py-3 font-semibold text-ink-100">{p.isPinned && <Pin className="mr-1 inline h-3 w-3 text-dragon-400" />}{p.title}</td>
                <td className="px-4 py-3 text-ink-300">{titleCase(p.category)}</td>
                <td className="px-4 py-3"><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge></td>
                <td className="px-4 py-3 text-ink-400">{p.publishedAt ? formatDate(p.publishedAt) : '—'}</td>
                <td className="px-4 py-3 text-right"><Link to={`/admin/news/${p.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-300 hover:text-white"><Pencil className="h-3.5 w-3.5" /> Edit</Link></td>
              </tr>
            ))}
          </Table>
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

export function AdminNewsEdit() {
  const { id } = useParams();
  const ed = useEditor({
    base: '/admin/news', id, queryKey: ['admin', 'news'],
    empty: { title: '', slug: '', excerpt: '', content: '', featuredImageUrl: '', category: 'ANNOUNCEMENT', status: 'DRAFT', isPinned: false },
    toForm: (p) => ({ ...p, excerpt: p.excerpt ?? '', featuredImageUrl: p.featuredImageUrl ?? '' }),
    toBody: ({ title, slug, excerpt, content, featuredImageUrl, category, status, isPinned }) => ({ title, slug, excerpt, content, featuredImageUrl, category, status, isPinned }),
  });
  const [preview, setPreview] = useState(false);
  if (!ed.isNew && ed.q.isPending) return <PageLoader />;
  if (!ed.isNew && ed.q.isError) return <ErrorState error={ed.q.error} onRetry={ed.q.refetch} />;
  return (
    <form onSubmit={ed.save} noValidate>
      <Link to="/admin/news" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> News</Link>
      <AdminHeader title={ed.isNew ? 'New post' : 'Edit post'}>
        {!ed.isNew && ed.form.status === 'PUBLISHED' && <Button variant="ghost" href={`/news/${ed.form.slug}`}><ExternalLink className="h-4 w-4" /> View</Button>}
        <Button type="submit" loading={ed.busy}>Save</Button>
      </AdminHeader>
      {ed.msg && <div className="mb-4"><FormAlert tone={ed.msg.tone}>{ed.msg.text}</FormAlert></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="card space-y-4 p-5">
          <Field label="Title *" maxLength={160} {...ed.bind('title')} />
          <Field label="Excerpt" maxLength={300} {...ed.bind('excerpt')} hint="Shown on cards and in link previews" />
          <div>
            <div className="mb-1.5 flex items-center justify-between"><span className="label !mb-0">Content * (Markdown)</span>
              <button type="button" className="text-xs font-semibold text-dragon-300" onClick={() => setPreview((p) => !p)}>{preview ? 'Edit' : 'Preview'}</button></div>
            {preview ? <div className="min-h-64 rounded-xl border border-ink-600 bg-ink-900 p-4"><Markdown>{ed.form.content}</Markdown></div>
              : <Field as="textarea" rows={16} maxLength={50000} {...ed.bind('content')} hint="**bold**, *italic*, ## Heading, - lists, [link](https://…)" />}
          </div>
        </section>
        <div className="space-y-6">
          <section className="card space-y-4 p-5">
            <Field as="select" label="Status" {...ed.bind('status')}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></Field>
            <Field as="select" label="Category" {...ed.bind('category')}>{['ANNOUNCEMENT', 'RECRUITMENT', 'COMMUNITY', 'NOTICE'].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-dragon-500" checked={ed.form.isPinned} onChange={(e) => ed.set('isPinned')(e.target.checked)} /> Pin to top</label>
            <Field label="URL slug" placeholder="auto from title" {...ed.bind('slug')} />
          </section>
          <section className="card p-5"><ImageField label="Featured image" kind="news" value={ed.form.featuredImageUrl} onChange={ed.set('featuredImageUrl')} /></section>
          {!ed.isNew && <DeleteBox label="Delete post" busy={ed.busy} onConfirm={ed.remove} />}
        </div>
      </div>
    </form>
  );
}

// ── Events ───────────────────────────────────────────────────────────────
export function AdminEventsList() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'events', page], queryFn: () => api.get(`/admin/events?page=${page}`), placeholderData: keepPreviousData });
  return (
    <>
      <AdminHeader title="Events" desc="Races, tournaments, premieres and community nights."><Button to="/admin/events/new"><Plus className="h-4 w-4" /> New event</Button></AdminHeader>
      {q.isPending ? <Skeleton className="h-80" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          <Table head={['Event', 'Starts', 'Status', 'Reminders', '']} empty={!q.data.data.length && <p className="p-8 text-center text-sm text-ink-400">No events yet.</p>}>
            {q.data.data.map((e) => (
              <tr key={e.id} className="hover:bg-ink-800/50">
                <td className="px-4 py-3"><p className="font-semibold text-ink-100">{e.title}</p><p className="text-xs text-ink-400">{e.category}{e.organizer ? ` · ${e.organizer.displayName}` : ''}</p></td>
                <td className="px-4 py-3 text-ink-300">{formatDateTime(e.startsAt)}</td>
                <td className="px-4 py-3"><Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge></td>
                <td className="px-4 py-3 text-ink-300">{e.reminders}</td>
                <td className="px-4 py-3 text-right"><Link to={`/admin/events/${e.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-300 hover:text-white"><Pencil className="h-3.5 w-3.5" /> Edit</Link></td>
              </tr>
            ))}
          </Table>
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

export function AdminEventEdit() {
  const { id } = useParams();
  const ed = useEditor({
    base: '/admin/events', id, queryKey: ['admin', 'events'],
    empty: { title: '', slug: '', description: '', category: 'Community', startsAt: '', endsAt: '', bannerUrl: '', streamUrl: '', externalUrl: '', status: 'SCHEDULED', organizerMemberId: '' },
    toForm: (e) => ({ ...e, startsAt: toLocalInput(e.startsAt), endsAt: toLocalInput(e.endsAt), bannerUrl: e.bannerUrl ?? '', streamUrl: e.streamUrl ?? '', externalUrl: e.externalUrl ?? '', organizerMemberId: e.organizerMemberId ?? '' }),
    toBody: (f) => ({
      title: f.title, slug: f.slug, description: f.description, category: f.category, status: f.status,
      startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt), bannerUrl: f.bannerUrl, streamUrl: f.streamUrl, externalUrl: f.externalUrl, organizerMemberId: f.organizerMemberId,
    }),
  });
  if (!ed.isNew && ed.q.isPending) return <PageLoader />;
  if (!ed.isNew && ed.q.isError) return <ErrorState error={ed.q.error} onRetry={ed.q.refetch} />;
  return (
    <form onSubmit={ed.save} noValidate>
      <Link to="/admin/events" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Events</Link>
      <AdminHeader title={ed.isNew ? 'New event' : 'Edit event'}>
        {!ed.isNew && ed.form.status !== 'DRAFT' && <Button variant="ghost" href={`/events/${ed.form.slug}`}><ExternalLink className="h-4 w-4" /> View</Button>}
        <Button type="submit" loading={ed.busy}>Save</Button>
      </AdminHeader>
      {ed.msg && <div className="mb-4"><FormAlert tone={ed.msg.tone}>{ed.msg.text}</FormAlert></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="card space-y-4 p-5">
          <Field label="Title *" maxLength={160} {...ed.bind('title')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts *" type="datetime-local" {...ed.bind('startsAt')} hint="Your local time" />
            <Field label="Ends" type="datetime-local" {...ed.bind('endsAt')} />
            <Field label="Category *" maxLength={40} {...ed.bind('category')} hint="e.g. Race, Tournament, Premiere" />
            <MemberSelect label="Host / organizer" value={ed.form.organizerMemberId} onChange={ed.set('organizerMemberId')} />
          </div>
          <Field as="textarea" label="Description *" rows={8} maxLength={10000} {...ed.bind('description')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stream URL" placeholder="https://kick.com/…" {...ed.bind('streamUrl')} />
            <Field label="More info URL" placeholder="https://…" {...ed.bind('externalUrl')} />
          </div>
        </section>
        <div className="space-y-6">
          <section className="card space-y-4 p-5">
            <Field as="select" label="Status" {...ed.bind('status')}>{['DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Field>
            <Field label="URL slug" placeholder="auto from title" {...ed.bind('slug')} />
          </section>
          <section className="card p-5"><ImageField label="Banner" kind="event" value={ed.form.bannerUrl} onChange={ed.set('bannerUrl')} /></section>
          {!ed.isNew && <DeleteBox label="Delete event" busy={ed.busy} onConfirm={ed.remove} />}
        </div>
      </div>
    </form>
  );
}
