// Global search: a header command palette (Ctrl/⌘ K or "/") and a full /search page.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Image as ImageIcon, Newspaper, Search as SearchIcon, Trophy, Users, Video, X } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useDebounce } from '../../lib/useDebounce.js';
import { formatDate, safeUrl, titleCase } from '../../lib/format.js';
import { usePageTitle } from '../../lib/usePageTitle.js';
import { Avatar } from '../ui/Avatar.jsx';
import { EmptyState, ErrorState, Skeleton } from '../ui/States.jsx';

function useSearch(term, limit) {
  const q = useDebounce(term.trim(), 250);
  return useQuery({
    queryKey: ['search', q, limit],
    queryFn: () => api.get(`/search${qs({ q, limit })}`).then((r) => r.data),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
}

function Results({ data, onPick }) {
  const groups = [
    ['Members', Users, data.members.map((m) => ({ key: m.slug, to: `/members/${m.slug}`, title: m.displayName, sub: `${m.rank}${m.rpCharacter ? ` · ${m.rpCharacter}` : ''}`, avatar: m }))],
    ['Videos', Video, data.videos.map((v) => ({ key: v.id, href: safeUrl(v.url), title: v.title, sub: v.member }))],
    ['News', Newspaper, data.news.map((n) => ({ key: n.slug, to: `/news/${n.slug}`, title: n.title, sub: `${titleCase(n.category)} · ${formatDate(n.publishedAt)}` }))],
    ['Events', CalendarDays, data.events.map((e) => ({ key: e.slug, to: `/events/${e.slug}`, title: e.title, sub: formatDate(e.startsAt) }))],
    ['Hall of Fame', Trophy, data.achievements.map((a) => ({ key: a.id, to: '/hall-of-fame', title: a.title, sub: titleCase(a.category) }))],
    ['Community', ImageIcon, data.community.map((c) => ({ key: c.id, to: '/community', title: c.title, sub: titleCase(c.type) }))],
  ].filter(([, , items]) => items.length);
  if (!groups.length) return <p className="p-6 text-center text-sm text-ink-400">No results.</p>;
  return (
    <div className="divide-y divide-ink-700/70">
      {groups.map(([label, Icon, items]) => (
        <section key={label} className="py-2">
          <h3 className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-ink-500"><Icon className="h-3.5 w-3.5" /> {label}</h3>
          <ul>
            {items.map((it) => {
              const inner = (
                <>
                  {it.avatar ? <Avatar src={it.avatar.avatarUrl} name={it.avatar.displayName} accent={it.avatar.accentColor} size="sm" className="!h-8 !w-8" /> : null}
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink-100">{it.title}</span><span className="block truncate text-xs text-ink-400">{it.sub}</span></span>
                </>
              );
              const cls = 'flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-ink-700 focus:bg-ink-700 focus:outline-none';
              return <li key={it.key}>{it.to ? <Link to={it.to} className={cls} onClick={onPick}>{inner}</Link> : <a href={it.href} target="_blank" rel="noopener noreferrer" className={cls} onClick={onPick}>{inner}</a>}</li>;
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const input = useRef(null);
  const navigate = useNavigate();
  const q = useSearch(term, 4);

  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName ?? '');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setOpen(true); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); else setTerm(''); }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl text-ink-300 hover:bg-ink-800 hover:text-white" aria-label="Search (Ctrl+K)">
        <SearchIcon className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Search">
          <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close search" />
          <div className="card relative z-10 w-full max-w-xl overflow-hidden">
            <form onSubmit={(e) => { e.preventDefault(); if (term.trim().length >= 2) { setOpen(false); navigate(`/search?q=${encodeURIComponent(term.trim())}`); } }}
              className="flex items-center gap-2 border-b border-ink-700 px-4">
              <SearchIcon className="h-5 w-5 text-ink-400" aria-hidden="true" />
              <input ref={input} value={term} onChange={(e) => setTerm(e.target.value)} maxLength={60} placeholder="Search members, videos, news, events…"
                className="h-14 flex-1 bg-transparent text-ink-100 placeholder:text-ink-500 focus:outline-none" aria-label="Search" />
              <button type="button" onClick={() => setOpen(false)} className="text-ink-400 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
            </form>
            <div className="max-h-[60vh] overflow-y-auto">
              {term.trim().length < 2 ? <p className="p-6 text-center text-sm text-ink-500">Type at least 2 characters · press Enter for all results</p>
                : q.isPending ? <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
                : q.isError ? <p className="p-6 text-center text-sm text-red-400">{q.error.message}</p>
                : <Results data={q.data} onPick={() => setOpen(false)} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  usePageTitle('Search');
  const q = useSearch(term, 10);
  useEffect(() => { const t = term.trim(); setParams(t ? { q: t } : {}, { replace: true }); }, [term, setParams]);
  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="mb-6 text-5xl font-bold uppercase">Search</h1>
      <label className="relative block">
        <span className="sr-only">Search</span>
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
        <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} maxLength={60} className="input h-14 pl-12 text-base" placeholder="Members, videos, news, events…" />
      </label>
      <div className="mt-6">
        {term.trim().length < 2 ? <EmptyState icon={SearchIcon} title="Search Dragonz Central">Find members, creators, videos, news, events and community posts.</EmptyState>
          : q.isPending ? <Skeleton className="h-60" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} />
          : <div className="card p-2"><Results data={q.data} onPick={() => {}} /></div>}
      </div>
    </div>
  );
}
