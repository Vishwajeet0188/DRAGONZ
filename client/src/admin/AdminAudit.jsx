import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { Pagination } from '../components/ui/Bits.jsx';
import { ErrorState, Skeleton } from '../components/ui/States.jsx';
import { AdminHeader, Table } from './ui.jsx';

export default function AdminAudit() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'audit', page], queryFn: () => api.get(`/admin/audit-logs?page=${page}`), placeholderData: keepPreviousData });
  return (
    <>
      <AdminHeader title="Audit log" desc="Every admin and security-relevant action, newest first." />
      {q.isPending ? <Skeleton className="h-96" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          <Table head={['When', 'Actor', 'Action', 'Entity', 'Details']} empty={q.data.data.length === 0 && <p className="p-8 text-center text-sm text-ink-400">No entries yet.</p>}>
            {q.data.data.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap px-4 py-3 text-ink-400">{formatDate(a.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-4 py-3 text-ink-100">{a.actorName ?? 'System'}</td>
                <td className="px-4 py-3"><code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs text-ember-400">{a.action}</code></td>
                <td className="px-4 py-3 text-ink-300">{a.entityType}<span className="text-ink-500"> {a.entityId?.slice(0, 8)}</span></td>
                <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-ink-400" title={a.metadata ? JSON.stringify(a.metadata) : ''}>{a.metadata ? JSON.stringify(a.metadata) : '—'}</td>
              </tr>
            ))}
          </Table>
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
