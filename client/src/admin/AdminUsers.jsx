import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { formatDate, timeAgo } from '../lib/format.js';
import { useDebounce } from '../lib/useDebounce.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Pagination } from '../components/ui/Bits.jsx';
import { FormAlert } from '../components/ui/Field.jsx';
import { ErrorState, Skeleton } from '../components/ui/States.jsx';
import { AdminHeader, Table } from './ui.jsx';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER', 'USER'];

export default function AdminUsers() {
  const { can, user: me } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState(null);
  const q = useDebounce(search.trim(), 300);
  const query = useQuery({ queryKey: ['admin', 'users', q, role, page], queryFn: () => api.get(`/admin/users${qs({ q, role, page })}`), placeholderData: keepPreviousData });
  const canRoles = can('users:manage_roles');

  const changeRole = async (u, next) => {
    setMsg(null);
    try {
      await api.patch(`/admin/users/${u.id}/role`, { role: next });
      setMsg({ tone: 'success', text: `${u.displayName} is now ${next.replace('_', ' ')}. They’ll need to sign in again.` });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (err) { setMsg({ tone: 'error', text: err.message }); }
  };

  return (
    <>
      <AdminHeader title="Users" desc={canRoles ? 'Registered accounts and their roles.' : 'Registered accounts (read-only — only super-admins can change roles).'} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" placeholder="Search email or name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <select className="input sm:w-52" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Role">
          <option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
      </div>
      {msg && <div className="mb-4"><FormAlert tone={msg.tone}>{msg.text}</FormAlert></div>}
      {query.isPending ? <Skeleton className="h-96" /> : query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> : (
        <>
          <Table head={['User', 'Role', 'Email', 'Joined', 'Last sign-in']} empty={query.data.data.length === 0 && <p className="p-8 text-center text-sm text-ink-400">No users found.</p>}>
            {query.data.data.map((u) => (
              <tr key={u.id} className="hover:bg-ink-800/50">
                <td className="px-4 py-3"><p className="font-semibold text-ink-100">{u.displayName}</p><p className="text-xs text-ink-400">{u.email}</p></td>
                <td className="px-4 py-3">
                  {canRoles && u.id !== me.id ? (
                    <select className="input h-9 w-44 py-0 text-xs" value={u.role} onChange={(e) => changeRole(u, e.target.value)} aria-label={`Role for ${u.displayName}`}>
                      {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                    </select>
                  ) : <Badge tone={u.role === 'USER' ? 'default' : 'dragon'}>{u.role.replace('_', ' ')}</Badge>}
                </td>
                <td className="px-4 py-3">{u.emailVerifiedAt ? <Badge tone="success">Verified</Badge> : <Badge>Unverified</Badge>} {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge tone="dragon">Locked</Badge>}</td>
                <td className="px-4 py-3 text-ink-300">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3 text-ink-400">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : '—'}</td>
              </tr>
            ))}
          </Table>
          <Pagination meta={query.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
