import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Heart } from 'lucide-react';
import { api } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Badge } from '../ui/Bits.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, FormAlert } from '../ui/Field.jsx';

/** Verified, public supporters of a creator + a claim form for signed-in fans. */
export function SupportersSection({ slug, name }) {
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['supporters', slug], queryFn: () => api.get(`/members/${slug}/supporters`) });
  const mine = useQuery({ queryKey: ['my-supporters'], queryFn: () => api.get('/me/supporters').then((r) => r.data), enabled: Boolean(user) });
  const myClaim = mine.data?.find((s) => s.memberSlug === slug);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tier: '', since: '', isPublic: true });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api.post('/me/supporters', { memberSlug: slug, tier: form.tier, isPublic: form.isPublic, ...(form.since && { since: form.since }) });
      setOpen(false);
      setMsg({ tone: 'success', text: 'Thanks! An admin will verify your supporter badge soon.' });
      qc.invalidateQueries({ queryKey: ['my-supporters'] });
    } catch (err) { setMsg({ tone: 'error', text: err.message }); } finally { setBusy(false); }
  };

  const list = q.data?.data ?? [];
  const total = q.data?.meta?.total ?? 0;
  return (
    <section aria-labelledby="sup-h" className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="sup-h" className="flex items-center gap-2 text-xl font-bold"><Heart className="h-4 w-4 text-dragon-400" /> Supporters</h2>
        {total > 0 && <span className="text-xs text-ink-400">{total} verified</span>}
      </div>
      {list.length ? (
        <ul className="flex flex-wrap gap-2">
          {list.map((s, i) => (
            <li key={i} className="flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900 py-1 pl-1 pr-3" title={s.since ? `Supporter since ${formatDate(s.since)}` : undefined}>
              <Avatar src={s.avatarUrl} name={s.displayName} size="sm" className="!h-6 !w-6 rounded-full text-[9px]" />
              <span className="text-xs font-medium text-ink-100">{s.displayName}</span>
              {s.tier && <span className="text-[10px] text-dragon-300">{s.tier}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-400">{total ? 'Supporters here keep their badge private.' : `Support ${name} on their channel? Claim your badge.`}</p>}

      {msg && <div className="mt-3"><FormAlert tone={msg.tone}>{msg.text}</FormAlert></div>}
      <div className="mt-3">
        {!user ? <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="text-sm font-semibold text-dragon-300 hover:text-white">Sign in to claim a supporter badge</Link>
          : myClaim ? <Badge tone={myClaim.status === 'VERIFIED' ? 'success' : 'default'}><BadgeCheck className="h-3 w-3" /> {myClaim.status === 'VERIFIED' ? 'You’re a verified supporter' : myClaim.status === 'PENDING' ? 'Your claim is awaiting verification' : 'Claim not approved'}</Badge>
          : !open ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>I’m a supporter</Button>
          : (
            <form onSubmit={submit} className="space-y-3">
              <p className="text-xs text-ink-400">Channel memberships are private to creators, so an admin verifies each claim manually.</p>
              <Field label="Tier / membership (optional)" placeholder="e.g. Dragon Tier, Kick sub" maxLength={60} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} />
              <Field label="Supporting since (optional)" type="date" max={new Date().toISOString().slice(0, 10)} value={form.since} onChange={(e) => setForm({ ...form, since: e.target.value })} />
              <label className="flex items-center gap-2 text-sm text-ink-300"><input type="checkbox" className="accent-dragon-500" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> Show my name on this profile</label>
              <div className="flex gap-2"><Button size="sm" type="submit" loading={busy}>Send claim</Button><Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
            </form>
          )}
      </div>
    </section>
  );
}
