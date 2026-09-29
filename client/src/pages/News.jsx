import { Discussion } from '../components/fanzone/FanZone.jsx';
import { Link, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Newspaper, Pin } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { formatDate, safeUrl, timeAgo, titleCase } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { Badge, Pagination } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Markdown } from '../components/ui/Markdown.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';

const CATS = ['ANNOUNCEMENT', 'RECRUITMENT', 'COMMUNITY', 'NOTICE'];

function Cover({ src, className = '' }) {
  const url = safeUrl(src);
  return url
    ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className={`object-cover ${className}`} />
    : <div className={`scales bg-[radial-gradient(90%_120%_at_100%_0%,rgb(217_165_20/.25),transparent_60%),linear-gradient(160deg,#151513,#090909)] ${className}`} aria-hidden="true" />;
}

export function NewsCard({ post, large = false }) {
  return (
    <Link to={`/news/${post.slug}`} className={`group card card-hover flex overflow-hidden ${large ? 'flex-col md:flex-row' : 'flex-col'}`}>
      <Cover src={post.featuredImageUrl} className={large ? 'aspect-video md:aspect-auto md:w-1/2' : 'aspect-video w-full'} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
          <Badge tone={post.category === 'RECRUITMENT' ? 'dragon' : 'default'}>{titleCase(post.category)}</Badge>
          {post.isPinned && <Badge tone="ember"><Pin className="h-3 w-3" /> Pinned</Badge>}
          <span>{formatDate(post.publishedAt)}</span>
        </div>
        <h2 className={`mt-3 font-bold leading-tight group-hover:text-dragon-300 ${large ? 'text-3xl' : 'text-xl'}`}>{post.title}</h2>
        {post.excerpt && <p className="mt-2 line-clamp-3 text-sm text-ink-300">{post.excerpt}</p>}
      </div>
    </Link>
  );
}

export function NewsList() {
  usePageTitle('News');
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const page = Number(params.get('page') ?? 1);
  const q = useQuery({ queryKey: ['news', category, page], queryFn: () => api.get(`/news${qs({ category, page })}`), placeholderData: keepPreviousData });
  const set = (patch) => setParams(Object.fromEntries(Object.entries({ category, page: 1, ...patch }).filter(([k, v]) => v && !(k === 'page' && v === 1))), { replace: true });

  return (
    <div className="container-page py-12">
      <header className="mb-8">
        <p className="eyebrow mb-2">Newsroom</p>
        <h1 className="text-5xl font-bold uppercase">News & announcements</h1>
      </header>
      <div className="mb-8 flex flex-wrap gap-2" role="tablist" aria-label="Category">
        {['', ...CATS].map((c) => (
          <button key={c || 'all'} type="button" role="tab" aria-selected={category === c} onClick={() => set({ category: c })}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${category === c ? 'border-dragon-500 bg-dragon-500/15 text-white' : 'border-ink-600 text-ink-300 hover:text-white'}`}>
            {c ? titleCase(c) : 'All'}
          </button>
        ))}
      </div>
      {q.isPending ? <Skeleton className="h-96" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data.data.length === 0 ? (
        <EmptyState icon={Newspaper} title="No posts yet">Announcements from the DRZ team will appear here.</EmptyState>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {q.data.data.map((p, i) => (
              <div key={p.id} className={i === 0 && page === 1 ? 'md:col-span-2 lg:col-span-3' : ''}><NewsCard post={p} large={i === 0 && page === 1} /></div>
            ))}
          </div>
          <Pagination meta={q.data.meta} onPage={(p) => set({ page: p })} />
        </>
      )}
    </div>
  );
}

export function NewsPost() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ['news-post', slug], queryFn: () => api.get(`/news/${slug}`).then((r) => r.data) });
  usePageTitle(q.data?.title ?? 'News');
  if (q.isPending) return <div className="container-page max-w-3xl py-12"><Skeleton className="h-96" /></div>;
  if (q.isError) {
    return <div className="container-page py-20">{q.error.status === 404
      ? <EmptyState icon={Newspaper} title="Post not found" action={<Button to="/news" variant="secondary">All news</Button>}>It may have been moved or archived.</EmptyState>
      : <ErrorState error={q.error} onRetry={q.refetch} />}</div>;
  }
  const p = q.data;
  return (
    <article className="pb-12">
      <div className="relative h-56 overflow-hidden sm:h-80">
        <Cover src={p.featuredImageUrl} className="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/50 to-transparent" />
      </div>
      <div className="container-page relative -mt-24 max-w-3xl">
        <Link to="/news" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> News</Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
          <Badge tone="dragon">{titleCase(p.category)}</Badge>
          <span>{formatDate(p.publishedAt)}</span>
          {p.authorName && <span>· by {p.authorName}</span>}
        </div>
        <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">{p.title}</h1>
        {p.excerpt && <p className="mt-4 text-lg text-ink-300">{p.excerpt}</p>}
        <div className="mt-8 border-t border-ink-700 pt-4"><Markdown>{p.content}</Markdown></div>
        <Discussion type="news" id={p.id} />
      </div>
      {p.more.length > 0 && (
        <section className="container-page mt-16" aria-labelledby="more-h">
          <h2 id="more-h" className="mb-5 text-2xl font-bold">More news</h2>
          <div className="grid gap-5 md:grid-cols-3">{p.more.map((m) => <NewsCard key={m.id} post={m} />)}</div>
        </section>
      )}
      <p className="sr-only">Published {timeAgo(p.publishedAt)}</p>
    </article>
  );
}
