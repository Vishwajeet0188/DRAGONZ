import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePageTitle } from '../../lib/usePageTitle.js';
import { Field, FormAlert } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { AuthShell } from './AuthShell.jsx';

function strength(p) {
  let s = 0;
  if (p.length >= 10) s++;
  if (p.length >= 14) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return s;
}
const LABELS = ['Too short', 'Weak', 'Okay', 'Strong', 'Excellent'];
const COLORS = ['bg-ink-600', 'bg-dragon-500', 'bg-ember-500', 'bg-emerald-500', 'bg-emerald-400'];

export default function Register() {
  usePageTitle('Create account');
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const s = strength(form.password);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setErrors({});
    try {
      await register(form);
      navigate('/dashboard?welcome=1', { replace: true });
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      if (!err.details) setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthShell title="Join Dragonz Central" subtitle="Follow creators, get live alerts, and share your clips." footer={<>Already have an account? <Link to="/login" className="font-semibold text-dragon-300 hover:text-white">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormAlert>{error}</FormAlert>
        <Field label="Display name" autoComplete="nickname" required maxLength={40} value={form.displayName} onChange={set('displayName')} error={errors.displayName} />
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} />
        <div>
          <Field label="Password" type="password" autoComplete="new-password" required maxLength={128} value={form.password} onChange={set('password')} error={errors.password} hint="At least 10 characters. A short phrase works great." />
          {form.password && (
            <div className="mt-2 flex items-center gap-2" aria-live="polite">
              <div className="flex flex-1 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < s ? COLORS[s] : 'bg-ink-700'}`} />)}</div>
              <span className="text-xs text-ink-400">{LABELS[s]}</span>
            </div>
          )}
        </div>
        <Button type="submit" className="w-full" size="lg" loading={busy}>Create account</Button>
        <p className="text-center text-xs text-ink-500">We’ll send a link to verify your email. We never share your email.</p>
      </form>
    </AuthShell>
  );
}
