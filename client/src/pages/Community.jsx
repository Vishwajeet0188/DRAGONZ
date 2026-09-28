import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Image as ImageIcon, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { safeUrl, timeAgo, titleCase } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Pagination } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, FormAlert } from '../components/ui/Field.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';

const TYPES = ['CLIP', 'SCREENSHOT', 'FAN_ART', 'EDIT', 'MEME', 'VIDEO', 'MOMENT'];
const STATUS_TONE = { PENDING: 'default', APPROVED: 'success', FEATURED: 'dragon', REJECTED: 'default' };

function Tile({ item, onOpen }) {
  const img = safeUrl(item.previewUrl);
  return (
    <button type="button" onClick={() => onOpen(item)} className="group card card-hover relative block w-full overflow-hidden text-left" aria-label={`Open ${item.title}`}>
      {img ? <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        : <div className="scales grid aspect-[4/3] w-full place-items-center bg-ink-800"><ImageIcon className="h-8 w-8 text-ink-500" /></div>}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 pt-10">
        <div className="mb-1 flex gap-1.5">
          <Badge>{titleCase(item.type)}</Badge>
          {item.status === 'FEATURED' && <Badge tone="dragon"><Sparkles className="h-3 w-3" /> Featured</Badge>}
        </div>
        <p className="line-clamp-2 font-display text-lg font-bold leading-tight text-white">{item.title}</p>
        <p className="text-xs text-ink-300">by {item.authorName}{item.memberName ? ` · ft. ${item.memberName}` : ''}</p>
      </div>
    </button>
  );
}

function Lightbox({ item, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onClose]);
  const link = safeUrl(item.externalUrl);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={item.title}>
      <button type="button" className="absolute inset-0 bg-black/85" onClick={onClose} aria-label="Close" />
      <div ref={ref} tabIndex={-1} className="card relative z-10 max-h-[92dvh] w-full max-w-4xl overflow-y-auto p-4 outline-none">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-lg bg-black/60 text-white hover:bg-black" aria-label="Close"><X className="h-5 w-5" /></button>
        {item.images.length > 0
          ? <div className="space-y-3">{item.images.map((im) => <img key={im.id} src={im.url} alt="" className="w-full rounded-xl" />)}</div>
          : item.previewUrl && <img src={item.previewUrl} alt="" className="w-full rounded-xl" referrerPolicy="no-referrer" />}
        <div className="p-2 pt-4">
          <Badge>{titleCase(item.type)}</Badge>
          <h2 className="mt-2 text-3xl font-bold">{item.title}</h2>
          <p className="text-sm text-ink-400">by {item.authorName}{item.memberName ? <> · featuring <Link to={`/members/${item.memberSlug}`} className="text-dragon-300 hover:text-white">{item.memberName}</Link></> : ''}</p>
          {item.description && <p className="mt-3 whitespace-pre-line text-ink-200">{item.description}</p>}
          {link && <Button className="mt-4" href={link}><ExternalLink className="h-4 w-4" /> Open clip</Button>}
        </div>
      </div>
    </div>
  );
}

function SubmitForm({ onDone }) {
  const qc = useQueryClient();
  const members = useQuery({ queryKey: ['members-all'], queryFn: () => api.get('/members?pageSize=48&sort=name').then((r) => r.data) });
  const [form, setForm] = useState({ type: 'CLIP', title: '', description: '', externalUrl: '', featuredMemberSlug: '' });
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const bind = (k) => ({ value: form[k], onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })), error: errors[k] });

  const pick = (list) => {
    const arr = [...list].slice(0, 4);
    const bad = arr.find((f) => f.size > 8 * 1024 * 1024 || !/^image\/(jpeg|png|webp|gif)$/.test(f.type));
    if (bad) return setMsg({ tone: 'error', text: `${bad.name}: use JPG/PNG/WebP/GIF under 8 MB.` });
    setMsg(null);
    setFiles(arr);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setMsg(null);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) if (v) fd.append(k, v);
      files.forEach((f) => fd.append('images', f));
      await api.upload('/community', fd);
      qc.invalidateQueries({ queryKey: ['community-mine'] });
      onDone();
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      setMsg({ tone: 'error', text: err.message });
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
      <h2 className="text-2xl font-bold">Share with the community</h2>
      <p className="-mt-2 text-sm text-ink-400">A moderator reviews every submission before it goes public. Only share content you made or have permission to share.</p>
      {msg && <FormAlert tone={msg.tone}>{msg.text}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field as="select" label="Type" {...bind('type')}>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Field>
        <Field as="select" label="Featuring (optional)" {...bind('featuredMemberSlug')}>
          <option value="">— Nobody specific —</option>
          {members.data?.map((m) => <option key={m.slug} value={m.slug}>{m.displayName}</option>)}
        </Field>
      </div>
      <Field label="Title *" maxLength={120} {...bind('title')} />
      <Field as="textarea" label="Description" maxLength={1000} rows={3} {...bind('description')} />
      <Field label="Clip link" placeholder="https://youtube.com/… · kick.com · twitch.tv · medal.tv…" {...bind('externalUrl')} hint="YouTube, Kick, Twitch, Instagram, TikTok, X, Streamable, Medal or Imgur" />
      <div>
        <span className="label">Images (up to 4)</span>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-ink-500 bg-ink-900 p-6 text-center text-sm text-ink-300 hover:border-dragon-500"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}>
          <Upload className="h-5 w-5 text-dragon-400" />
          {files.length ? `${files.length} image${files.length > 1 ? 's' : ''} selected` : 'Drop images here or click to choose'}
          <span className="text-xs text-ink-500">JPG, PNG, WebP or GIF · max 8 MB each</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" onChange={(e) => pick(e.target.files)} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>Submit for review</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function MySubmissions() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['community-mine'], queryFn: () => api.get('/community/mine').then((r) => r.data) });
  if (q.isPending || q.isError || !q.data.length) return null;
  return (
    <section className="card p-5" aria-labelledby="mine-h">
      <h2 id="mine-h" className="mb-3 text-xl font-bold">My submissions</h2>
      <ul className="divide-y divide-ink-700">
        {q.data.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2.5">
            {s.previewUrl ? <img src={s.previewUrl} alt="" className="h-12 w-16 rounded-lg object-cover" referrerPolicy="no-referrer" /> : <div className="grid h-12 w-16 place-items-center rounded-lg bg-ink-800"><ImageIcon className="h-4 w-4 text-ink-500" /></div>}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink-100">{s.title}</p>
              <p className="text-xs text-ink-400">{timeAgo(s.createdAt)}{s.status === 'REJECTED' && s.rejectionReason ? ` · ${s.rejectionReason}` : ''}</p>
            </div>
            <Badge tone={STATUS_TONE[s.status]}>{titleCase(s.status)}</Badge>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-700 hover:text-red-400" aria-label={`Delete ${s.title}`}
              onClick={async () => { await api.del(`/community/${s.id}`); qc.invalidateQueries({ queryKey: ['community-mine'] }); qc.invalidateQueries({ queryKey: ['community'] }); }}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Community() {
  usePageTitle('Community');
  const { user } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(null);
  const [submitting, setSubmitting] = useState(() => new URLSearchParams(location.search).has('submit') && Boolean(user));
  const [thanks, setThanks] = useState(false);
  const type = params.get('type') ?? '';
  const page = Number(params.get('page') ?? 1);
  const q = useQuery({ queryKey: ['community', type, page], queryFn: () => api.get(`/community${qs({ type, page })}`), placeholderData: keepPreviousData });

  return (
    <div className="container-page py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Made by the fans</p>
          <h1 className="text-5xl font-bold uppercase">Community showcase</h1>
          <p className="mt-2 max-w-2xl text-ink-300">Clips, screenshots, fan art and edits from the DRZ community.</p>
        </div>
        {user
          ? !submitting && <Button onClick={() => { setSubmitting(true); setThanks(false); }}><Plus className="h-4 w-4" /> Submit</Button>
          : <Button to={`/login?next=${encodeURIComponent(location.pathname)}`}><Plus className="h-4 w-4" /> Sign in to submit</Button>}
      </header>

      {user && !user.emailVerified && submitting && <div className="mb-6"><FormAlert tone="info">Verify your email first — check your inbox or resend it from your dashboard.</FormAlert></div>}
      {thanks && <div className="mb-6"><FormAlert tone="success">Thanks! Your submission is waiting for a moderator. You’ll get a notification when it’s reviewed.</FormAlert></div>}
      {submitting && <div className="mb-8"><SubmitForm onDone={() => { setSubmitting(false); setThanks(true); }} /></div>}
      {user && <div className="mb-8"><MySubmissions /></div>}

      <div className="mb-6 flex flex-wrap gap-2">
        {['', ...TYPES].map((t) => (
          <button key={t || 'all'} type="button" aria-pressed={type === t} onClick={() => setParams(t ? { type: t } : {}, { replace: true })}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${type === t ? 'border-dragon-500 bg-dragon-500/15 text-white' : 'border-ink-600 text-ink-300 hover:text-white'}`}>
            {t ? titleCase(t) : 'All'}
          </button>
        ))}
      </div>

      {q.isPending ? <Skeleton className="h-96" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data.data.length === 0 ? (
        <EmptyState icon={ImageIcon} title="Nothing here yet">Be the first to share a clip or fan art — approved submissions appear here.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{q.data.data.map((s) => <Tile key={s.id} item={s} onOpen={setOpen} />)}</div>
          <Pagination meta={q.data.meta} onPage={(p) => setParams({ ...(type && { type }), page: String(p) })} />
        </>
      )}
      {open && <Lightbox item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
