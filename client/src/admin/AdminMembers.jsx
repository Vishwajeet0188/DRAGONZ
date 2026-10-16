import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Star } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { useDebounce } from '../lib/useDebounce.js';
import { PLATFORM_META } from '../lib/platforms.js';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Badge, Pagination } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ErrorState, Skeleton } from '../components/ui/States.jsx';
import { AdminHeader, Table } from './ui.jsx';

/** Inline "position in the roster" editor — type a number, the row jumps there. Lower = shown first. */
function OrderInput({ member, onSaved }) {
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    const n = Number(e.target.value);
    if (!Number.isFinite(n) || n === (member.rankOrder ?? 0)) return;
    setBusy(true);
    try { await api.patch(`/admin/members/${member.id}`, { rankOrder: n }); await onSaved(); }
    finally { setBusy(false); }
  };
  return (
    <input
      type="number" min="0" max="1000" defaultValue={member.rankOrder ?? 0} key={member.rankOrder}
      onBlur={save} disabled={busy}
      className="input !h-9 !w-16 !px-2 !py-1 text-center text-sm"
      title="Position in the roster (lower = shown first). Founder 1, Leader 2, …"
      aria-label={`Order for ${member.displayName}`}
    />
  );
}

export default function AdminMembers({ creatorsOnly = false }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search.trim(), 300);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'members', q, status, page, creatorsOnly],
    queryFn: () => api.get(`/admin/members${qs({ q, status, page, pageSize: 20, ...(creatorsOnly && { creator: true }) })}`),
    placeholderData: keepPreviousData,
  });
  const refreshOrder = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['admin', 'members'] }),
    qc.invalidateQueries({ queryKey: ['members'] }),
    qc.invalidateQueries({ queryKey: ['home'] }),
  ]);

  return (
    <>
      <AdminHeader title={creatorsOnly ? 'Creators' : 'Members'} desc={creatorsOnly ? 'Members marked as creators — their channels sync automatically.' : 'Manage the Dragonz roster, roles and platform links.'}>
        <Button to="/admin/members/new"><Plus className="h-4 w-4" /> Add member</Button>
      </AdminHeader>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" placeholder="Search name or character…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <select className="input sm:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ALUMNI">Alumni</option>
        </select>
      </div>
      {!creatorsOnly && <p className="mb-3 text-xs text-ink-400">Tip: the <span className="font-semibold text-ink-200">Order</span> number sets where a member appears on the site (lower = first). Set your Founder to 1, Leader to 2, and so on. New members are added to the end automatically.</p>}

      {query.isPending ? <Skeleton className="h-96" /> : query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> : (
        <>
          <Table head={['Order', 'Member', 'Role', 'Status', 'Platforms', '']}
            empty={query.data.data.length === 0 && <p className="p-8 text-center text-sm text-ink-400">No members found.</p>}>
            {query.data.data.map((m) => (
              <tr key={m.id} className="hover:bg-ink-800/50">
                <td className="px-4 py-3"><OrderInput member={m} onSaved={refreshOrder} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar src={m.avatarUrl} name={m.displayName} accent={m.accentColor ?? undefined} size="sm" />
                    <div>
                      <p className="font-semibold text-ink-100">{m.displayName} {m.isFeatured && <Star className="inline h-3 w-3 fill-ember-400 text-ember-400" aria-label="Featured" />}</p>
                      <p className="text-xs text-ink-400">/{m.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><span className="text-ink-200">{m.rank}</span> {m.isCreator && <Badge tone="ember">Creator</Badge>}</td>
                <td className="px-4 py-3"><Badge tone={m.status === 'ACTIVE' ? 'success' : 'default'}>{m.status}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {m.platforms.map((p) => { const meta = PLATFORM_META[p.platform]; return <meta.Icon key={p.id} className="h-4 w-4" style={{ color: meta.color }} aria-label={meta.label} />; })}
                    {m.platforms.length === 0 && <span className="text-xs text-ink-500">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/admin/members/${m.id}`} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-300 hover:bg-ink-700 hover:text-white"><Pencil className="h-3.5 w-3.5" /> Edit</Link>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination meta={query.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
