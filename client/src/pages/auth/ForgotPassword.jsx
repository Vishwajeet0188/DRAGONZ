import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../lib/api.js';
import { usePageTitle } from '../../lib/usePageTitle.js';
import { Field, FormAlert } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { AuthShell } from './AuthShell.jsx';

export default function ForgotPassword() {
  usePageTitle('Forgot password');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post('/auth/forgot-password', { email });
      setMsg({ tone: 'success', text: r.data.message });
    } catch (err) {
      setMsg({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we’ll send you a reset link." footer={<Link to="/login" className="hover:text-white">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {msg && <FormAlert tone={msg.tone}>{msg.text}</FormAlert>}
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" className="w-full" size="lg" loading={busy}>Send reset link</Button>
      </form>
    </AuthShell>
  );
}
