// Reusable admin form fields: image URL + upload, member picker.
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageUp, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { safeUrl } from '../lib/format.js';
import { Field } from '../components/ui/Field.jsx';

export function ImageField({ label, value, onChange, kind = 'content', error, hint }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('file', file);
      const r = await api.upload('/admin/uploads', fd);
      onChange(r.data.url);
    } catch (e) { setErr(e.message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const preview = safeUrl(value);
  return (
    <div>
      <div className="flex items-end gap-2">
        <Field className="flex-1" label={label} placeholder="https://… or upload" value={value ?? ''} onChange={(e) => onChange(e.target.value)} error={error || err} hint={hint} />
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className="mb-[1px] inline-flex h-[42px] items-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm font-medium text-ink-200 hover:border-ink-400 hover:text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />} Upload
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {preview && <img src={preview} alt="" className="mt-2 h-20 rounded-lg border border-ink-700 object-cover" referrerPolicy="no-referrer" />}
    </div>
  );
}

export function useMemberOptions() {
  return useQuery({
    queryKey: ['admin', 'member-options'],
    queryFn: () => api.get('/admin/members?pageSize=48').then((r) => r.data.map((m) => ({ id: m.id, slug: m.slug, name: m.displayName }))),
    staleTime: 60_000,
  });
}

export function MemberSelect({ label = 'Member', value, onChange, required = false, error }) {
  const q = useMemberOptions();
  return (
    <Field as="select" label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)} error={error}>
      <option value="">{required ? 'Choose a member…' : '— None —'}</option>
      {q.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </Field>
  );
}

/** Convert a Date/ISO to the value a <input type="datetime-local"> expects (local time). */
export const toLocalInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
