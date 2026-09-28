import { createContext, useContext, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((r) => r.data.user),
    staleTime: 5 * 60_000,
    retry: 1,
  });

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
        await api.post('/auth/logout');
        qc.clear();
        qc.setQueryData(['me'], null);
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
