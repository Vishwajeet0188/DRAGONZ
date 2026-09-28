import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, Video, X } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { PLATFORM_META } from '../lib/platforms.js';
import { useDebounce } from '../lib/useDebounce.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { VideoCard } from '../components/media/MediaCards.jsx';
import { CardGridSkeleton, EmptyState, ErrorState } from '../components/ui/States.jsx';
import { Pagination } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';

const VIDEO_PLATFORMS = ['YOUTUBE', 'KICK', 'TWITCH'];

export default function Videos() {
  usePageTitle('Videos');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounce(search.trim(), 300);
  const f = {
    q: params.get('q') ?? '', member: params.get('member') ?? '', platform: params.get('platform') ?? '',
    sort: params.get('sort') ?? 'latest', page: Number(params.get('page') ?? 1),
  };
  const update = (patch) => {
    const next = { ...f, page: 1, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'sort' && v === 'latest') && !(k === 'page' && v === 1))), { replace: true });
  };
  useEffect(() => {
    if (debounced !== f.q) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const creators = useQuery({ queryKey: ['video-creators'], queryFn: () => api.get('/videos/creators').then((r) => r.data), staleTime: 300_000 });
  const q = useQuery({ queryKey: ['videos', f], queryFn: () => api.get(`/videos${qs({ ...f, pageSize: 12 })}`), placeholderData: keepPreviousData });
  const filtered = Boolean(f.q || f.member || f.platform);

  return (
    <div className="container-page py-12">
      <header className="mb-8">
        <p className="eyebrow mb-2">Video hub</p>
        <h1 className="text-5xl font-bold uppercase">Latest from DRZ</h1>
        <p className="mt-2 max-w-2xl text-ink-300">New uploads and past streams from every creator, pulled in automatically.</p>
      </header>

      <div className="card mb-8 flex flex-col gap-2 p-3 md:flex-row md:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search videos</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input type="search" className="input pl-10" placeholder="Search video titles…" value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="grid grid-cols-3 gap-2 md:flex">
          <select className="input md:w-44" value={f.member} onChange={(e) => update({ member: e.target.value })} aria-label="Creator">
            <option value="">All creators</option>
            {creators.data?.map((c) => <option key={c.slug} value={c.slug}>{c.displayName}</option>)}
          </select>
          <select className="input md:w-36" value={f.platform} onChange={(e) => update({ platform: e.target.value })} aria-label="Platform">
            <option value="">All platforms</option>
            {VIDEO_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_META[p].label}</option>)}
          </select>
          <select className="input md:w-48" value={f.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
            <option value="latest">Featured &amp; latest</option>
            <option value="popular">Most viewed</option>
          </select>
        </div>
        {filtered && (
          <button type="button" className="inline-flex items-center gap-1 px-2 text-sm text-ink-400 hover:text-white" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>
            <X className="h-4 w-4" /> Clear
          </button>
        )}
      </div>

      {q.isPending ? <CardGridSkeleton count={8} className="h-60" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data.data.length === 0 ? (
        <EmptyState icon={Video} title={filtered ? 'No videos match' : 'No videos yet'}
          action={filtered ? <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setParams({}); }}>Reset filters</Button> : null}>
          {filtered ? 'Try another creator, platform or search.' : 'Videos appear here automatically once creators’ channels are synced.'}
        </EmptyState>
      ) : (
        <>
          <div className={`grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-opacity ${q.isPlaceholderData ? 'opacity-60' : ''}`}>
            {q.data.data.map((v) => <VideoCard key={v.id} video={v} showFeatured />)}
          </div>
          <Pagination meta={q.data.meta} onPage={(page) => { update({ page }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        </>
      )}
    </div>
  );
}
