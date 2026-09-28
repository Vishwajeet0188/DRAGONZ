import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { usePageTitle } from '../../lib/usePageTitle.js';
import { Button } from '../../components/ui/Button.jsx';
import { PageLoader } from '../../components/ui/States.jsx';
import { AuthShell, takeUrlToken } from './AuthShell.jsx';

export default function VerifyEmail() {
  usePageTitle('Verify email');
  const qc = useQueryClient();
  const [state, setState] = useState({ status: 'loading' });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-invoke guard — token is single-use
    ran.current = true;
    const token = takeUrlToken();
    if (!token) return setState({ status: 'error', message: 'This verification link is incomplete.' });
    api.post('/auth/verify-email', { token })
      .then(() => { setState({ status: 'ok' }); qc.invalidateQueries({ queryKey: ['me'] }); })
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [qc]);

  if (state.status === 'loading') return <PageLoader />;
  const ok = state.status === 'ok';
  return (
    <AuthShell title={ok ? 'Email verified' : 'Verification failed'}>
      <div className="flex flex-col items-center gap-4 text-center">
        {ok ? <CheckCircle2 className="h-10 w-10 text-emerald-400" /> : <XCircle className="h-10 w-10 text-dragon-400" />}
        <p className="text-sm text-ink-300">{ok ? 'You’re all set. Live alerts can now reach your inbox.' : state.message}</p>
        <Button to="/dashboard" className="w-full">{ok ? 'Go to dashboard' : 'Back to dashboard'}</Button>
      </div>
    </AuthShell>
  );
}
