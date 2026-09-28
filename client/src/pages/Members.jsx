import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { PLATFORMS, PLATFORM_META } from '../lib/platforms.js';
import { useDebounce } from '../lib/useDebounce.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { MemberCard } from '../components/members/MemberCard.jsx';
import { CardGridSkeleton, EmptyState, ErrorState } from '../components/ui/States.jsx';
import { LiveDot, Pagination } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';

const Toggle = ({ active, onClick, children }) => (
  <button type="button" onClick={onClick} aria-pressed={active}
    className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition ${active ? 'border-dragon-500 bg-dragon-500/15 text-white' : 'border-ink-600 bg-ink-850 text-ink-300 hover:border-ink-400 hover:text-white'}`}>
    {children}
  </button>
);

export default function Members() {
  usePageTitle('Members');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounce(search.trim(), 300);
  const [showFilters, setShowFilters] = useState(false);

  const filters = {
    q: params.get('q') ?? '',
    rank: params.get('rank') ?? '',
    creator: params.get('creator') ?? '',
    platform: params.get('platform') ?? '',
    live: params.get('live') ?? '',
    sort: params.get('sort') ?? 'rank',
    page: Number(params.get('page') ?? 1),
  };

  // Filters live in the URL → shareable, back-button friendly.
  const update = (patch) => {
    const next = { ...filters, page: 1, ...patch };
    const clean = Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'sort' && v === 'rank') && !(k === 'page' && v === 1)));
    setParams(clean, { replace: true });
  };

  useEffect(() => {
    if (debounced !== filters.q) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const ranks = useQuery({ queryKey: ['ranks'], queryFn: () => api.get('/members/ranks').then((r) => r.data), staleTime: 5 * 60_000 });
  const q = useQuery({
    queryKey: ['members', filters],
    queryFn: () => api.get(`/members${qs({ ...filters, pageSize: 12 })}`),
    placeholderData: keepPreviousData,
  });

  const activeCount = ['rank', 'creator', 'platform', 'live'].filter((k) => filters[k]).length;

  return (
    <div className="container-page py-12">
      <header className="mb-8">
        <p className="eyebrow mb-2">The crew</p>
        <h1 className="text-4xl font-bold sm:text-5xl">Dragonz members</h1>
        <p className="mt-2 max-w-2xl text-ink-300">Every member of the Dragonz — their role in the crew, who they play in the city, and where to watch them.</p>
      </header>

      <div className="card mb-8 p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search members</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, character or role…" className="input pl-10" maxLength={60} />
          </label>
          <div className="flex gap-2">
            <select className="input w-auto" value={filters.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort members">
              <option value="rank">Sort: Rank</option>
              <option value="name">Sort: Name</option>
              <option value="newest">Sort: Newest</option>
            </select>
            <Button variant="secondary" className="md:hidden" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="member-filters">
              <SlidersHorizontal className="h-4 w-4" /> Filters{activeCount ? ` (${activeCount})` : ''}
            </Button>
          </div>
        </div>

        <div id="member-filters" className={`${showFilters ? 'flex' : 'hidden'} mt-3 flex-wrap items-center gap-2 md:flex`}>
          <Toggle active={filters.live === 'true'} onClick={() => update({ live: filters.live ? '' : 'true' })}><LiveDot /> Live now</Toggle>
          <Toggle active={filters.creator === 'true'} onClick={() => update({ creator: filters.creator ? '' : 'true' })}>Creators only</Toggle>
          <select className="input h-10 w-auto py-0" value={filters.rank} onChange={(e) => update({ rank: e.target.value })} aria-label="Filter by role">
            <option value="">All roles</option>
            {ranks.data?.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="input h-10 w-auto py-0" value={filters.platform} onChange={(e) => update({ platform: e.target.value })} aria-label="Filter by platform">
            <option value="">All platforms</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_META[p].label}</option>)}
          </select>
          {(activeCount > 0 || filters.q) && (
            <button type="button" className="inline-flex items-center gap-1 px-2 text-sm text-ink-400 hover:text-white" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>
              <X className="h-4 w-4" /> Clear
            </button>
          )}
        </div>
      </div>

      {q.isPending ? <CardGridSkeleton /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data.data.length === 0 ? (
        <EmptyState icon={Users} title="No members match" action={<Button variant="secondary" size="sm" onClick={() => { setSearch(''); setParams({}); }}>Reset filters</Button>}>
          Try a different name, or clear the filters.
        </EmptyState>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-400" aria-live="polite">{q.data.meta.total} member{q.data.meta.total === 1 ? '' : 's'}</p>
          <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-opacity ${q.isPlaceholderData ? 'opacity-60' : ''}`}>
            {q.data.data.map((m) => <MemberCard key={m.id} member={m} />)}
          </div>
          <Pagination meta={q.data.meta} onPage={(page) => { update({ page }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        </>
      )}
    </div>
  );
}
