import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Heart, KeyRound, ShieldCheck, Trash2, User } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, FormAlert } from '../components/ui/Field.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';

function Card({ id, icon: Icon, title, desc, children, danger }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`card p-6 ${danger ? 'border-dragon-700/60' : ''}`}>
      <h2 id={`${id}-h`} className="flex items-center gap-2 text-xl font-bold"><Icon className={`h-4 w-4 ${danger ? 'text-dragon-400' : 'text-ink-400'}`} aria-hidden="true" /> {title}</h2>
      {desc && <p className="mt-1 text-sm text-ink-400">{desc}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const bind = (k) => ({ value: values[k] ?? '', onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.value })), error: errors[k] });
  const run = async (fn, successText) => {
    setBusy(true); setErrors({}); setMsg(null);
    try {
      await fn();
      if (successText) setMsg({ tone: 'success', text: successText });
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      if (!err.details) setMsg({ tone: 'error', text: err.message });
    } finally { setBusy(false); }
  };
  return { values, setValues, bind, run, msg, busy, setErrors };
}

function AvatarUpload({ onUploaded }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.upload('/me/avatar', fd);
      onUploaded(r.data.user);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-4">
      <Avatar src={user.avatarUrl} name={user.displayName} size="lg" />
      <div>
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm font-medium text-ink-100 hover:border-ink-400 ${busy ? 'opacity-50' : ''}`}>
          {busy ? 'Uploading…' : 'Upload new avatar'}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <p className="mt-1 text-xs text-ink-400">JPG, PNG, WebP or GIF · max 8 MB · cropped to a square</p>
        {err && <p className="mt-1 text-xs text-red-400" role="alert">{err}</p>}
      </div>
    </div>
  );
}

function MySupporterBadges() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-supporters'], queryFn: () => api.get('/me/supporters').then((r) => r.data) });
  if (q.isPending) return <p className="text-sm text-ink-400">Loading…</p>;
  if (!q.data?.length) return <p className="text-sm text-ink-400">No supporter badges yet. Claim one from a creator’s profile.</p>;
  const act = async (fn) => { await fn(); qc.invalidateQueries({ queryKey: ['my-supporters'] }); };
  return (
    <ul className="divide-y divide-ink-700">
      {q.data.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
          <span className="flex-1 font-semibold text-ink-100">{s.memberName}{s.tier ? <span className="ml-2 text-xs text-dragon-300">{s.tier}</span> : null}</span>
          <span className="text-xs text-ink-400">{s.status.toLowerCase()}</span>
          <label className="flex items-center gap-1.5 text-xs text-ink-300"><input type="checkbox" className="accent-dragon-500" checked={s.isPublic} onChange={(e) => act(() => api.patch(`/me/supporters/${s.id}`, { isPublic: e.target.checked }))} /> Public</label>
          <button type="button" className="text-xs text-ink-400 hover:text-red-400" onClick={() => act(() => api.del(`/me/supporters/${s.id}`))}>Remove</button>
        </li>
      ))}
    </ul>
  );
}

function ProfileForm() {
  const { user, setUser } = useAuth();
  const f = useForm({ displayName: user.displayName, avatarUrl: user.avatarUrl ?? '' });
  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      const r = await api.patch('/users/me', { displayName: f.values.displayName, avatarUrl: f.values.avatarUrl || null });
      setUser(r.data.user);
    }, 'Profile saved.');
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {f.msg && <FormAlert tone={f.msg.tone}>{f.msg.text}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" maxLength={40} {...f.bind('displayName')} />
        <Field label="Email" value={user.email} disabled hint={user.emailVerified ? 'Verified' : 'Not verified yet'} />
      </div>
      <AvatarUpload onUploaded={(u) => { setUser(u); f.setValues((v) => ({ ...v, avatarUrl: u.avatarUrl ?? '' })); }} />
      <Button type="submit" loading={f.busy}>Save profile</Button>
    </form>
  );
}

function PasswordForm() {
  const f = useForm({ currentPassword: '', newPassword: '', confirm: '' });
  const submit = (e) => {
    e.preventDefault();
    if (f.values.newPassword !== f.values.confirm) return f.setErrors({ confirm: 'Passwords don’t match' });
    f.run(async () => {
      await api.post('/auth/change-password', { currentPassword: f.values.currentPassword, newPassword: f.values.newPassword });
      f.setValues({ currentPassword: '', newPassword: '', confirm: '' });
    }, 'Password changed. Other devices have been signed out.');
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {f.msg && <FormAlert tone={f.msg.tone}>{f.msg.text}</FormAlert>}
      <Field label="Current password" type="password" autoComplete="current-password" {...f.bind('currentPassword')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" type="password" autoComplete="new-password" {...f.bind('newPassword')} hint="At least 10 characters." />
        <Field label="Confirm new password" type="password" autoComplete="new-password" {...f.bind('confirm')} />
      </div>
      <Button type="submit" loading={f.busy}>Change password</Button>
    </form>
  );
}

function Sessions() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sessions'], queryFn: () => api.get('/users/me/sessions').then((r) => r.data) });
  const f = useForm({});
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-300">{q.data ? `${q.data.active} active session${q.data.active === 1 ? '' : 's'}` : 'Loading…'}</p>
      <Button variant="secondary" loading={f.busy} disabled={q.data?.active <= 1}
        onClick={() => f.run(async () => { await api.post('/users/me/sessions/revoke-others'); qc.invalidateQueries({ queryKey: ['sessions'] }); }, 'Signed out of all other devices.')}>
        Sign out other devices
      </Button>
      {f.msg && <div className="w-full"><FormAlert tone={f.msg.tone}>{f.msg.text}</FormAlert></div>}
    </div>
  );
}

function Toggle({ label, desc, checked, onChange, disabled }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-ink-100">{label}</span>
        {desc && <span className="block text-xs text-ink-400">{desc}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-ink-600 transition peer-checked:bg-dragon-500 peer-focus-visible:ring-2 peer-focus-visible:ring-dragon-400 peer-disabled:opacity-50 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

function NotificationPrefs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notification-prefs'], queryFn: () => api.get('/me/notification-preferences').then((r) => r.data) });
  const [msg, setMsg] = useState(null);
  const save = async (patch) => {
    setMsg(null);
    qc.setQueryData(['notification-prefs'], (old) => ({ ...old, ...patch })); // optimistic
    try {
      const r = await api.put('/me/notification-preferences', patch);
      qc.setQueryData(['notification-prefs'], r.data);
    } catch (err) {
      setMsg({ tone: 'error', text: err.message });
      qc.invalidateQueries({ queryKey: ['notification-prefs'] });
    }
  };
  if (q.isPending) return <p className="text-sm text-ink-400">Loading…</p>;
  if (q.isError) return <FormAlert tone="error">{q.error.message}</FormAlert>;
  return (
    <div className="divide-y divide-ink-700">
      {msg && <FormAlert tone={msg.tone}>{msg.text}</FormAlert>}
      <Toggle label="In-app live alerts" desc="Show alerts on your dashboard when creators you follow go live." checked={q.data.inAppEnabled} onChange={(v) => save({ inAppEnabled: v })} />
      <Toggle label="Email me when a creator I follow goes live"
        desc={user.emailVerified ? 'At most one email per creator every 3 hours.' : 'Verify your email first to receive email alerts.'}
        checked={q.data.emailLiveAlerts} onChange={(v) => save({ emailLiveAlerts: v })} />
      <Toggle label="Email event reminders" desc="An email about an hour before events you set a reminder for." checked={q.data.emailEventReminders} onChange={(v) => save({ emailEventReminders: v })} />
      <Toggle label="Email DRZ announcements" desc="Important news from the DRZ team — a few times a month at most." checked={q.data.emailAnnouncements} onChange={(v) => save({ emailAnnouncements: v })} />
      <p className="pt-3 text-xs text-ink-500">Choose which creators alert you with the bell button on each creator’s profile.</p>
    </div>
  );
}

function DeleteAccount() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const f = useForm({ password: '', confirm: '' });
  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      await api.del('/users/me', { password: f.values.password });
      setUser(null);
      navigate('/', { replace: true });
    });
  };
  if (!open) return <Button variant="danger" onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" /> Delete my account</Button>;
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormAlert tone="error">This permanently removes your profile, follows and preferences. It can’t be undone.</FormAlert>
      {f.msg && <FormAlert tone={f.msg.tone}>{f.msg.text}</FormAlert>}
      <Field label="Password" type="password" autoComplete="current-password" {...f.bind('password')} />
      <Field label='Type "DELETE" to confirm' {...f.bind('confirm')} />
      <div className="flex gap-2">
        <Button type="submit" variant="danger" loading={f.busy} disabled={f.values.confirm !== 'DELETE' || !f.values.password}>Permanently delete</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export default function Settings() {
  usePageTitle('Settings');
  const { user } = useAuth();
  return (
    <div className="container-page max-w-3xl py-12">
      <p className="eyebrow mb-1">Account</p>
      <h1 className="mb-8 text-4xl font-bold">Settings</h1>
      <div className="space-y-6">
        <Card id="profile" icon={User} title="Profile"><ProfileForm /></Card>
        <Card id="notifications" icon={Bell} title="Notifications" desc="Choose how you hear about live streams, events and announcements.">
          <NotificationPrefs />
        </Card>
        <Card id="supporters" icon={Heart} title="Supporter badges" desc="Badges you’ve claimed on creators’ profiles."><MySupporterBadges /></Card>
        <Card id="password" icon={KeyRound} title="Password"><PasswordForm /></Card>
        <Card id="sessions" icon={ShieldCheck} title="Sessions" desc={`Signed in as ${user.email}`}><Sessions /></Card>
        <Card id="delete" icon={Trash2} title="Delete account" desc="Remove your Dragonz Central account and personal data." danger><DeleteAccount /></Card>
      </div>
    </div>
  );
}
