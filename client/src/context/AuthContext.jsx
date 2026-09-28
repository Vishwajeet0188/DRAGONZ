import { createContext, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

const PROTECTED = /^\/(dashboard|settings|admin)(\/|$)/;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('dz-auth') : null;

/** Leave any signed-in-only page with a full reload, so no in-memory data survives sign-out. */
function leaveProtectedPage() {
  if (PROTECTED.test(window.location.pathname)) window.location.replace('/login');
}

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((r) => r.data.user),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    const dropUser = () => {
      if (!qc.getQueryData(['me'])) return;
      qc.clear();
      qc.setQueryData(['me'], null);
      leaveProtectedPage();
    };
    // Signed out in another tab.
    const onMessage = (e) => { if (e.data === 'logout') dropUser(); };
    // Any API call answered 401 → the session is gone.
    const onUnauthorized = () => dropUser();
    // Page restored from the Back/Forward cache → re-check who is signed in.
    const onPageShow = (e) => { if (e.persisted) qc.invalidateQueries({ queryKey: ['me'] }); };
    channel?.addEventListener('message', onMessage);
    window.addEventListener('dz:unauthorized', onUnauthorized);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      channel?.removeEventListener('message', onMessage);
      window.removeEventListener('dz:unauthorized', onUnauthorized);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [qc]);

  const value = useMemo(() => {
    const user = data ?? null;
    return {
      user,
      loading: isLoading,
      // UI hint only — the server enforces every permission independently.
      can: (perm) => Boolean(user?.permissions?.includes(perm)),
      setUser: (u) => qc.setQueryData(['me'], u),
      async login(body) {
        const r = await api.post('/auth/login', body);
        qc.setQueryData(['me'], r.data.user);
        return r.data.user;
      },
      async register(body) {
        const r = await api.post('/auth/register', body);
        qc.setQueryData(['me'], r.data.user);
        return r.data.user;
      },
      async logout() {
        try {
          await api.post('/auth/logout');
        } finally {
          // Even if the request failed, forget everything locally and start fresh.
          qc.clear();
          qc.setQueryData(['me'], null);
          channel?.postMessage('logout');
          window.location.replace('/');
        }
      },
    };
  }, [data, isLoading, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
