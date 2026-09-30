import { CrewProgress } from '../components/crew/Crew.jsx';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Award, Calendar, Check, Heart, ExternalLink, Share2, Sparkles, Star, Trophy, TrendingUp, Video, Image as ImageIcon } from 'lucide-react';
import { api } from '../lib/api.js';
import { compact, formatDate, safeUrl, timeAgo, titleCase } from '../lib/format.js';
import { PLATFORM_META } from '../lib/platforms.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Badge, LiveBadge, SectionHeader } from '../components/ui/Bits.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { Thumb, VideoCard } from '../components/media/MediaCards.jsx';
import { FollowButton } from '../components/members/FollowButton.jsx';
import { SupportersSection } from '../components/members/Supporters.jsx';

function ShareButton({ name }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${name} · Dragonz Central`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* user cancelled share sheet */ }
  };
  return (
    <Button variant="secondary" onClick={share} aria-live="polite">
      {copied ? <><Check className="h-4 w-4" /> Link copied</> : <><Share2 className="h-4 w-4" /> Share profile</>}
    </Button>
  );
}

function PlatformRow({ p }) {
  const meta = PLATFORM_META[p.platform];
  const href = safeUrl(p.url);
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="card card-hover flex items-center gap-3 p-3.5" aria-label={`${meta.label}: ${p.handle} (opens in new tab)`}>
      <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${meta.color}1f` }}>
        <meta.Icon className="h-5 w-5" style={{ color: meta.color }} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink-100">{meta.label}{p.isPrimary && <Star className="ml-1.5 inline h-3 w-3 fill-ember-400 text-ember-400" aria-label="Primary platform" />}</span>
        <span className="block truncate text-xs text-ink-400">{p.handle}</span>
      </span>
      {p.followerCount ? <span className="text-right"><span className="block font-display text-lg font-bold text-ink-100">{compact(p.followerCount)}</span><span className="block text-[10px] uppercase tracking-wider text-ink-500">{meta.noun}</span></span> : null}
      <ExternalLink className="h-4 w-4 text-ink-500" aria-hidden="true" />
    </a>
  );
}

function ProfileSkeleton() {
  return (
    <div>
      <Skeleton className="h-52 rounded-none sm:h-72" />
      <div className="container-page -mt-16 space-y-4">
        <Skeleton className="h-36 w-36 rounded-2xl" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
    </div>
  );
}

export default function MemberProfile() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ['member', slug], queryFn: () => api.get(`/members/${slug}`).then((r) => r.data) });
  usePageTitle(q.data?.displayName ?? 'Member');

  if (q.isPending) return <ProfileSkeleton />;
  if (q.isError) {
    return (
      <div className="container-page py-20">
        {q.error.status === 404
          ? <EmptyState title="Member not found" action={<Button to="/members" variant="secondary">Browse members</Button>}>This profile doesn’t exist or has been removed.</EmptyState>
          : <ErrorState error={q.error} onRetry={q.refetch} />}
      </div>
    );
  }

  const m = q.data;
  const accent = m.accentColor ?? '#d9a514';
  const live = m.liveStreams[0];
  const banner = safeUrl(m.bannerUrl);
  const videos = m.latestVideos.map((v) => ({ ...v, member: m }));
  const featuredIds = new Set(m.featuredVideos.map((v) => v.id));

  return (
    <article>
      {/* Banner */}
      <div className="relative h-52 overflow-hidden sm:h-72">
        {banner
          ? <img src={banner} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          : <div className="scales h-full w-full" style={{ background: `radial-gradient(80% 140% at 80% 0%, ${accent}80, transparent 60%), linear-gradient(135deg, #16161c, #0b0b0f)` }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/40 to-transparent" />
        <div className="container-page absolute inset-x-0 top-4">
          <Link to="/members" className="inline-flex items-center gap-1.5 rounded-lg bg-black/40 px-3 py-1.5 text-sm text-ink-100 backdrop-blur hover:bg-black/60"><ArrowLeft className="h-4 w-4" /> Members</Link>
        </div>
      </div>

      <div className="container-page">
        {/* Identity */}
        <header className="relative z-10 -mt-20 flex flex-col gap-6 sm:-mt-24 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <Avatar src={m.avatarUrl} name={m.displayName} accent={accent} size="xl" live={Boolean(live)} className="shadow-2xl" />
            <div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Badge tone="dragon">{m.rank}</Badge>
                {m.isCreator && <Badge tone="ember"><Sparkles className="h-3 w-3" aria-hidden="true" /> Creator</Badge>}
                {m.status === 'ALUMNI' && <Badge>Alumni</Badge>}
                {live && <LiveBadge platform={live.platform} />}
              </div>
              <h1 className="text-4xl font-bold leading-none sm:text-6xl">{m.displayName}</h1>
              {m.rpCharacter && <p className="mt-2 text-ink-300">In the city as <span className="font-semibold text-ink-100">{m.rpCharacter}</span></p>}
              {m.tagline && <p className="mt-1 text-sm italic text-ink-400">“{m.tagline}”</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {live && <Button href={live.url}><ExternalLink className="h-4 w-4" /> Watch live</Button>}
            <FollowButton key={String(m.viewer.following)} slug={m.slug} name={m.displayName} viewer={m.viewer} />
            <ShareButton name={m.displayName} />
          </div>
        </header>

        {/* Live banner */}
        {live && (
          <a href={safeUrl(live.url)} target="_blank" rel="noopener noreferrer" className="group card mt-8 grid overflow-hidden border-live/40 sm:grid-cols-[320px_1fr]" style={{ boxShadow: '0 0 0 1px rgb(255 45 85 / .25), 0 20px 50px -20px rgb(255 45 85 / .5)' }}>
            <div className="p-2"><Thumb src={live.thumbnailUrl} accent={accent} platform={live.platform}><LiveBadge platform={live.platform} className="absolute left-2 top-2" /></Thumb></div>
            <div className="flex flex-col justify-center gap-1 p-5">
              <p className="eyebrow text-live">Live now on {PLATFORM_META[live.platform]?.label}</p>
              <h2 className="text-2xl font-bold group-hover:text-white">{live.title}</h2>
              <p className="text-sm text-ink-400">Started {timeAgo(live.startedAt)}{live.viewerCount != null ? ` · ${compact(live.viewerCount)} watching` : ''}</p>
            </div>
          </a>
        )}

        <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-14">
            {m.bio && (
              <section aria-labelledby="about-h">
                <h2 id="about-h" className="mb-3 text-2xl font-bold">About</h2>
                <p className="max-w-3xl whitespace-pre-line leading-relaxed text-ink-300">{m.bio}</p>
              </section>
            )}

            <section aria-labelledby="videos-h">
              <SectionHeader title={<span id="videos-h">Latest videos</span>} />
              {videos.length === 0 ? (
                <EmptyState icon={Video} title="No videos yet">When {m.displayName} uploads, their videos will appear here.</EmptyState>
              ) : (
                <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                  {videos.map((v) => (
                    <div key={v.id} className="relative">
                      {featuredIds.has(v.id) && <Badge tone="ember" className="absolute right-2 top-2 z-10"><Star className="h-3 w-3" /> Featured</Badge>}
                      <VideoCard video={v} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {m.achievements.length > 0 && (
              <section aria-labelledby="ach-h">
                <SectionHeader title={<span id="ach-h">Achievements</span>} />
                <ol className="relative space-y-6 border-l border-ink-700 pl-6">
                  {m.achievements.map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[33px] top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-ember-500 bg-ink-900" aria-hidden="true" />
                      <p className="text-xs text-ink-400">{formatDate(a.achievedAt)} · {titleCase(a.category)}</p>
                      <h3 className="text-lg font-bold">{a.title}</h3>
                      {a.description && <p className="text-sm text-ink-300">{a.description}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {m.communityHighlights.length > 0 && (
              <section aria-labelledby="comm-h">
                <SectionHeader title={<span id="comm-h">Community highlights</span>} />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {m.communityHighlights.map((c) => (
                    <Link key={c.id} to="/community" className="card card-hover relative block aspect-video overflow-hidden">
                      {safeUrl(c.previewUrl)
                        ? <img src={c.previewUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
                        : <div className="scales absolute inset-0" style={{ background: `linear-gradient(160deg, ${accent}33, #0b0b0f)` }} />}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-8">
                        <Badge className="mb-1">{titleCase(c.type)}</Badge>
                        <p className="text-sm font-semibold text-white">{c.title}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-8">
            {m.platforms.length > 0 && (
              <section aria-labelledby="where-h">
                <h2 id="where-h" className="mb-3 text-xl font-bold">Where to watch</h2>
                <div className="space-y-2">{m.platforms.map((p) => <PlatformRow key={p.platform} p={p} />)}</div>
              </section>
            )}

            <CrewProgress crew={m.crew} name={m.displayName} />

            <SupportersSection slug={m.slug} name={m.displayName} />

            {m.milestones.length > 0 && (
              <section aria-labelledby="ms-h">
                <h2 id="ms-h" className="mb-3 text-xl font-bold">Creator milestones</h2>
                <ul className="card divide-y divide-ink-700">
                  {m.milestones.map((ms) => (
                    <li key={ms.id} className="flex items-center gap-3 p-3.5">
                      <TrendingUp className="h-4 w-4 shrink-0 text-dragon-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-100">{ms.title}</p>
                        <p className="text-xs text-ink-500">{formatDate(ms.achievedAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="card p-4 text-sm">
              <dl className="space-y-3">
                {m.joinedAt && <div className="flex items-center justify-between"><dt className="flex items-center gap-2 text-ink-400"><Calendar className="h-4 w-4" /> Joined Dragonz</dt><dd className="font-medium text-ink-100">{formatDate(m.joinedAt, { month: 'short', year: 'numeric' })}</dd></div>}
                <div className="flex items-center justify-between"><dt className="flex items-center gap-2 text-ink-400"><Heart className="h-4 w-4" /> Followers</dt><dd className="font-medium text-ink-100">{m.stats.followers}</dd></div>
                <div className="flex items-center justify-between"><dt className="flex items-center gap-2 text-ink-400"><Trophy className="h-4 w-4" /> Achievements</dt><dd className="font-medium text-ink-100">{m.achievements.length}</dd></div>
                <div className="flex items-center justify-between"><dt className="flex items-center gap-2 text-ink-400"><Award className="h-4 w-4" /> Milestones</dt><dd className="font-medium text-ink-100">{m.milestones.length}</dd></div>
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </article>
  );
}
