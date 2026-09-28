import { useState } from 'react';
import { useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Check, Heart } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button } from '../ui/Button.jsx';

/** Follow a creator (+ toggle live alerts). Anonymous visitors are sent to sign in and brought back. */
export function FollowButton({ slug, name, viewer }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const [state, setState] = useState({ following: Boolean(viewer?.following), notifyLive: viewer?.notifyLive ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user) {
    return <Button to={`/login?next=${encodeURIComponent(location.pathname)}`}><Heart className="h-4 w-4" /> Follow for live alerts</Button>;
  }

  const run = async (fn) => {
    setBusy(true); setError('');
    try {
      const r = await fn();
      setState({ following: r.data.following, notifyLive: r.data.notifyLive ?? state.notifyLive });
      qc.invalidateQueries({ queryKey: ['my-follows'] });
      qc.invalidateQueries({ queryKey: ['member', slug] });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        {state.following ? (
          <Button variant="secondary" loading={busy} onClick={() => run(() => api.del(`/members/${slug}/follow`))} aria-label={`Unfollow ${name}`}>
            <Check className="h-4 w-4 text-dragon-400" /> Following
          </Button>
        ) : (
          <Button loading={busy} onClick={() => run(() => api.put(`/members/${slug}/follow`, { notifyLive: true }))}>
            <Heart className="h-4 w-4" /> Follow
          </Button>
        )}
        {state.following && (
          <Button variant="secondary" disabled={busy} onClick={() => run(() => api.put(`/members/${slug}/follow`, { notifyLive: !state.notifyLive }))}
            aria-pressed={state.notifyLive} aria-label={state.notifyLive ? `Turn off live alerts for ${name}` : `Turn on live alerts for ${name}`}
            title={state.notifyLive ? 'Live alerts on' : 'Live alerts off'}>
            {state.notifyLive ? <Bell className="h-4 w-4 text-dragon-400" /> : <BellOff className="h-4 w-4 text-ink-400" />}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
    </div>
  );
}
