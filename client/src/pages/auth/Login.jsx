import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePageTitle } from '../../lib/usePageTitle.js';
import { Field, FormAlert } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { AuthShell } from './AuthShell.jsx';

/** Only allow internal redirect targets (prevents open-redirects via ?next=). */
export const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard');

export default function Login() {
  usePageTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to follow creators and manage your alerts." footer={<>New here? <Link to="/register" className="font-semibold text-dragon-300 hover:text-white">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormAlert>{error}</FormAlert>
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-ink-300 hover:text-white">Forgot password?</Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={busy}>Sign in</Button>
      </form>
    </AuthShell>
  );
}
