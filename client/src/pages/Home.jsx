import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Clock, Camera, Clapperboard, Film, Megaphone, Palette, Pin, Sparkles, Trophy, Upload, Users, Image as ImageIcon, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { compact, formatDate, formatDateTime, safeUrl, timeAgo, titleCase } from '../lib/format.js';
import { PLATFORM_META } from '../lib/platforms.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { Hero } from '../components/home/Hero.jsx';
import { CrewSection } from '../components/home/CrewSection.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Badge, LiveDot, SectionHeader } from '../components/ui/Bits.jsx';
import { ErrorState, Skeleton } from '../components/ui/States.jsx';
import { MemberCard } from '../components/members/MemberCard.jsx';
import { LiveCard, VideoCard } from '../components/media/MediaCards.jsx';

function Section({ children, className = '' }) {
  return <section className={`container-page py-10 sm:py-14 ${className}`}>{children}</section>;
}

/** "From the Boss's desk": latest post as a lead story, the next two as compact rows. */
function Announcements({ items }) {
  const [lead, ...rest] = items;
  return (
    <div className="flex flex-col">
      <SectionHeader eyebrow="From the Boss's desk" title="Announcements" to="/news" />
      {!lead ? (
        <div className="card flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <Megaphone className="h-7 w-7 text-dragon-400" aria-hidden="true" />
          <p className="font-display text-xl font-bold">No announcements yet</p>
          <p className="max-w-xs text-sm text-ink-400">Crew news, recruitment calls and notices from the Boss will land here.</p>
        </div>
      ) : (
        <div className="card flex flex-1 flex-col overflow-hidden">
          <Link to={`/news/${lead.slug}`} className="group relative block overflow-hidden">
            {safeUrl(lead.featuredImageUrl) ? (
              <img src={lead.featuredImageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[21/9] w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
            ) : (
              <div className="relative aspect-[2/1] w-full sm:aspect-[3/1] bg-[radial-gradient(90%_140%_at_0%_0%,rgb(217_165_20/.22),transparent_60%),linear-gradient(180deg,#141416,#0e0e10)]" aria-hidden="true">
                <Megaphone className="absolute right-6 top-5 h-14 w-14 -rotate-12 text-dragon-400/20" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/40 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
                <Badge tone={lead.category === 'RECRUITMENT' ? 'ember' : 'dragon'}>{titleCase(lead.category)}</Badge>
                {lead.isPinned && <Badge tone="dragon"><Pin className="h-3 w-3" /> Pinned</Badge>}
                <span>{timeAgo(lead.publishedAt)}</span>
              </div>
              <h3 className="mt-2 font-display text-2xl font-bold leading-tight text-white group-hover:text-dragon-200 sm:text-3xl">{lead.title}</h3>
            </div>
          </Link>
          <div className="px-5 pb-5 pt-3">
            {lead.excerpt && <p className="line-clamp-2 text-sm text-ink-300">{lead.excerpt}</p>}
            <Link to={`/news/${lead.slug}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-dragon-300 hover:text-white">Read more <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {rest.length > 0 && (
            <ul className="mt-auto divide-y divide-ink-700/70 border-t border-ink-700/70">
              {rest.map((n) => (
                <li key={n.id}>
                  <Link to={`/news/${n.slug}`} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-ink-800/60">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-dragon-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink-100 group-hover:text-white">{n.title}</span>
                    <span className="shrink-0 text-xs text-ink-500">{timeAgo(n.publishedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function countdown(startsAt, now, status) {
  const diff = new Date(startsAt).getTime() - now;
  if (status === 'LIVE' || diff <= 0) return { live: true, label: 'Happening now' };
  const d = Math.floor(diff / 86_400_000), h = Math.floor((diff % 86_400_000) / 3_600_000), m = Math.floor((diff % 3_600_000) / 60_000);
  return { live: false, label: d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m` };
}

function DateChip({ date, className = '' }) {
  const d = new Date(date);
  return (
    <div className={`grid w-14 shrink-0 place-items-center rounded-xl border border-ink-600 bg-ink-900/90 py-2 text-center backdrop-blur ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-dragon-400">{d.toLocaleString('en', { month: 'short' })}</span>
      <span className="font-display text-2xl font-bold leading-none text-ink-100">{d.getDate()}</span>
    </div>
  );
}

/** "Mark your calendar": next event as a lead card with countdown, the rest as compact rows. */
function UpcomingEvents({ items }) {
  const now = useNow();
  const [next, ...rest] = items;
  return (
    <div className="flex flex-col">
      <SectionHeader eyebrow="Mark your calendar" title="Upcoming events" to="/events" />
      {!next ? (
        <div className="card flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <CalendarDays className="h-7 w-7 text-dragon-400" aria-hidden="true" />
          <p className="font-display text-xl font-bold">Nothing scheduled yet</p>
          <p className="max-w-xs text-sm text-ink-400">Races, tournaments and community nights will show up here.</p>
        </div>
      ) : (
        <div className="card flex flex-1 flex-col overflow-hidden">
          {(() => {
            const cd = countdown(next.startsAt, now, next.status);
            return (
              <Link to={`/events/${next.slug}`} className="group relative block overflow-hidden">
                {safeUrl(next.bannerUrl) ? (
                  <img src={next.bannerUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[2/1] w-full object-cover transition duration-500 group-hover:scale-[1.03] sm:aspect-[3/1]" />
                ) : (
                  <div className="relative aspect-[2/1] w-full bg-[radial-gradient(90%_140%_at_100%_0%,rgb(217_165_20/.22),transparent_60%),linear-gradient(180deg,#141416,#0e0e10)] sm:aspect-[3/1]" aria-hidden="true">
                    <CalendarDays className="absolute right-6 top-5 h-14 w-14 rotate-6 text-dragon-400/20" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/40 to-transparent" aria-hidden="true" />
                <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-5">
                  <DateChip date={next.startsAt} />
                  <div className="min-w-0">
                    <p className="text-xs text-ink-300">{next.category} · {formatDateTime(next.startsAt)}</p>
                    <h3 className="mt-0.5 font-display text-2xl font-bold leading-tight text-white group-hover:text-dragon-200 sm:text-3xl">{next.title}</h3>
                  </div>
                </div>
                <span className={`absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wider ${cd.live ? 'bg-live text-white' : 'border border-dragon-500/40 bg-ink-950/80 text-dragon-300 backdrop-blur'}`}>
                  {cd.live ? <><span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-white" /> {cd.label}</> : <><Clock className="h-3.5 w-3.5" /> Starts in {cd.label}</>}
                </span>
              </Link>
            );
          })()}
          <div className="px-5 pb-5 pt-3">
            <Link to={`/events/${next.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-dragon-300 hover:text-white">Details &amp; reminder <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {rest.length > 0 && (
            <ul className="mt-auto divide-y divide-ink-700/70 border-t border-ink-700/70">
              {rest.map((e) => {
                const d = new Date(e.startsAt);
                return (
                  <li key={e.id}>
                    <Link to={`/events/${e.slug}`} className="group flex items-center gap-3 px-5 py-3 hover:bg-ink-800/60">
                      <span className="w-12 shrink-0 text-center font-display leading-none">
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-dragon-400">{d.toLocaleString('en', { month: 'short' })}</span>
                        <span className="text-lg font-bold text-ink-100">{d.getDate()}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink-100 group-hover:text-white">{e.title}</span>
                        <span className="block truncate text-xs text-ink-500">{e.category} · {formatDateTime(e.startsAt)}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-dragon-300" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Achievements({ items }) {
  if (!items.length) return null;
  return (
    <Section>
      <SectionHeader eyebrow="Written in history" title="Dragonz achievements" to="/hall-of-fame" linkLabel="Hall of Fame" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((a) => (
          <article key={a.id} className="card relative overflow-hidden p-5">
            <Trophy className="absolute -right-3 -top-3 h-20 w-20 text-ember-500/10" aria-hidden="true" />
            <Badge tone="ember">{titleCase(a.category)}</Badge>
            <h3 className="mt-3 text-lg font-bold leading-snug">{a.title}</h3>
            {a.description && <p className="mt-2 line-clamp-3 text-sm text-ink-300">{a.description}</p>}
            <p className="mt-3 text-xs text-ink-500">{formatDate(a.achievedAt)}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function Milestones({ items }) {
  if (!items.length) return null;
  return (
    <Section>
      <SectionHeader eyebrow="Growing together" title="Creator milestones" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m) => {
          const meta = PLATFORM_META[m.platform];
          return (
            <Link key={m.id} to={`/members/${m.member.slug}`} className="card card-hover flex items-center gap-4 p-4">
              <Avatar src={m.member.avatarUrl} name={m.member.displayName} accent={m.member.accentColor} size="md" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-ink-400">
                  {meta && <meta.Icon className="h-3 w-3" style={{ color: meta.color }} aria-hidden="true" />}
                  {m.member.displayName} · {timeAgo(m.achievedAt)}
                </p>
                <p className="font-display text-lg font-bold leading-tight text-ink-100">{m.title}</p>
              </div>
              {m.value ? <span className="ml-auto font-display text-2xl font-bold text-dragon-400">{compact(m.value)}</span> : <TrendingUp className="ml-auto h-5 w-5 text-dragon-400" />}
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

const mosaic = (n) => {
  if (n >= 5) return { big: true, grid: 'grid auto-rows-[160px] grid-cols-2 gap-3 md:grid-cols-4 lg:auto-rows-[190px]' };
  if (n === 1) return { big: false, grid: 'grid auto-rows-[260px] grid-cols-1 gap-3 sm:auto-rows-[360px]' };
  if (n === 3) return { big: true, grid: 'grid auto-rows-[150px] grid-cols-2 gap-3 md:grid-cols-4 md:auto-rows-[190px] md:[&>*:nth-child(n+2)]:col-span-2' };
  return { big: false, grid: 'grid auto-rows-[200px] grid-cols-2 gap-3 md:auto-rows-[240px]' }; // 2 or 4
};

/** Community showcase: real fan images in a mosaic, or an invitation to post the first one. */
function Community({ items }) {
  return (
    <Section>
      <SectionHeader eyebrow="Made by the fans" title="Community showcase" to="/community" />
      {items.length === 0 ? (
        <div className="card relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(60%_140%_at_100%_50%,rgb(217_165_20/.16),transparent_65%)]" aria-hidden="true" />
          <div className="relative grid gap-8 p-6 sm:p-10 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-display text-3xl font-bold leading-tight sm:text-4xl">Your clip could be <span className="text-dragon-300">first on the wall</span>.</p>
              <p className="mt-3 max-w-xl text-ink-300">Share fan art, screenshots, edits and your best Dragonz moments. Every post is reviewed by the crew before it goes live.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button to="/community?submit=1"><Upload className="h-4 w-4" /> Share your post</Button>
                <Button to="/community" variant="ghost">Browse showcase</Button>
              </div>
            </div>
            <ul className="hidden grid-cols-3 gap-3 md:grid" aria-hidden="true">
              {[ImageIcon, Clapperboard, Palette, Camera, Film, Sparkles].map((Icon, i) => (
                <li key={i} className={`grid h-20 w-20 place-items-center rounded-2xl border border-ink-700 bg-ink-900/80`}>
                  <Icon className="h-6 w-6 text-dragon-400/70" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        // 5+ posts → mosaic (one big + four small fills two full rows); fewer → equal tiles so nothing leaves holes.
        <div className={mosaic(items.length).grid}>
          {items.slice(0, 5).map((c, i) => (
            <Link key={c.id} to="/community"
              className={`group card relative overflow-hidden ${mosaic(items.length).big && i === 0 ? 'col-span-2 row-span-2' : ''}`}>
              {safeUrl(c.previewUrl) ? (
                <img src={c.previewUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              ) : (
                <div className="scales absolute inset-0 grid place-items-center bg-ink-800" aria-hidden="true"><ImageIcon className="h-8 w-8 text-ink-500" /></div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/20 to-transparent" aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Badge tone={c.status === 'FEATURED' ? 'dragon' : 'default'}>{c.status === 'FEATURED' ? '★ Featured' : titleCase(c.type)}</Badge>
                </div>
                <p className={`line-clamp-2 font-display font-bold leading-tight text-white ${i === 0 && items.length !== 2 && items.length !== 4 ? 'text-2xl sm:text-3xl' : 'text-base'}`}>{c.title}</p>
                <p className="mt-0.5 truncate text-xs text-ink-300">by {c.authorName}{c.memberName ? ` · ft. ${c.memberName}` : ''}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}

function HomeSkeleton() {
  return (
    <div className="container-page space-y-10 py-16">
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-64" />)}</div>
    </div>
  );
}

export default function Home() {
  usePageTitle(null);
  // Refresh every minute so live status stays current without reloading.
  const q = useQuery({ queryKey: ['home'], queryFn: () => api.get('/home').then((r) => r.data), refetchInterval: 60_000 });

  if (q.isPending) return <HomeSkeleton />;
  if (q.isError) return <div className="container-page py-20"><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  const d = q.data;

  return (
    <>
      <Hero stats={d.stats} liveNow={d.liveNow} roster={d.roster ?? []} />

      {d.liveNow.length > 0 && (
        <Section className="pt-0">
          <SectionHeader eyebrow={<span className="inline-flex items-center gap-2"><LiveDot /> Streaming right now</span>} title="Live now" to="/live" linkLabel="Live hub" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.liveNow.map((s) => <LiveCard key={s.id} stream={s} />)}
          </div>
        </Section>
      )}

      <Section>
        <SectionHeader eyebrow="The crew" title="Featured members" to="/members" linkLabel="All members" />
        {d.featuredMembers.length === 0 ? <p className="text-sm text-ink-400">No featured members yet.</p> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* keep full rows on the 4-column grid */}
            {d.featuredMembers.slice(0, d.featuredMembers.length >= 4 ? d.featuredMembers.length - (d.featuredMembers.length % 4) : undefined).map((m) => <MemberCard key={m.id} member={m} />)}
          </div>
        )}
      </Section>

      {d.latestVideos.length > 0 && (
        <Section>
          <SectionHeader eyebrow="Picked by the crew" title="Featured videos" to="/videos" linkLabel="All videos" />
          <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {d.latestVideos.map((v) => <VideoCard key={v.id} video={v} />)}
          </div>
        </Section>
      )}

      <CrewSection crew={d.crew ?? []} />

      <Section>
        <div className="grid gap-10 lg:grid-cols-2">
          <Announcements items={d.announcements} />
          <UpcomingEvents items={d.upcomingEvents} />
        </div>
      </Section>

      <Achievements items={d.achievements} />
      <Milestones items={d.milestones} />
      <Community items={d.community} />

      <Section>
        <div className="card relative overflow-hidden px-6 py-12 text-center sm:px-12">
          <div className="absolute inset-0 bg-[radial-gradient(60%_120%_at_50%_0%,rgb(217_165_20/.25),transparent)]" aria-hidden="true" />
          <div className="relative">
            <Sparkles className="mx-auto h-6 w-6 text-ember-400" aria-hidden="true" />
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Never miss a Dragonz stream</h2>
            <p className="mx-auto mt-3 max-w-xl text-ink-300">Create a free account to follow your favourite creators. Live alerts are rolling out next.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button to="/register" size="lg"><Users className="h-4 w-4" /> Create account</Button>
              <Button to="/about" size="lg" variant="ghost"><Megaphone className="h-4 w-4" /> About the Dragonz</Button>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

