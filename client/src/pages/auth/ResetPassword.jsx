import { useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { usePageTitle } from '../../lib/usePageTitle.js';
import { Field, FormAlert } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { AuthShell, takeUrlToken } from './AuthShell.jsx';

export default function ResetPassword() {
  usePageTitle('Choose a new password');
  const qc = useQueryClient();
  const [token] = useState(() => takeUrlToken());
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setErrors({ confirm: 'Passwords don’t match' });
    setBusy(true);
    setErrors({});
    try {
      await api.post('/auth/reset-password', { token, password: form.password });
      qc.setQueryData(['me'], null); // all sessions were revoked server-side
      setMsg({ tone: 'success', text: 'Password updated. You can now sign in with your new password.' });
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      if (!err.details) setMsg({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Link incomplete">
        <p className="text-sm text-ink-300">This reset link is missing its token. Request a new one.</p>
        <Button to="/forgot-password" className="mt-4 w-full">Request new link</Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" footer={<Link to="/login" className="hover:text-white">Back to sign in</Link>}>
      {msg?.tone === 'success' ? (
        <div className="space-y-4"><FormAlert tone="success">{msg.text}</FormAlert><Button to="/login" className="w-full">Sign in</Button></div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {msg && <FormAlert tone={msg.tone}>{msg.text}</FormAlert>}
          <Field label="New password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} hint="At least 10 characters." />
          <Field label="Confirm password" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} error={errors.confirm} />
          <Button type="submit" className="w-full" size="lg" loading={busy}>Update password</Button>
        </form>
      )}
    </AuthShell>
  );
}
