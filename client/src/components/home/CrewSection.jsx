// Home: "The crew" — every active member with photo, name, rank and their YouTube / Kick links.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, Users } from 'lucide-react';
import { safeUrl } from '../../lib/format.js';
import { PLATFORM_META } from '../../lib/platforms.js';
import { LiveBadge, SectionHeader } from '../ui/Bits.jsx';

const INITIAL = 8;
const initials = (name = '') => name.replace(/^dragon\s+/i, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

function Photo({ member }) {
  const [failed, setFailed] = useState(false);
  const url = safeUrl(member.avatarUrl);
  const accent = member.accentColor ?? '#d9a514';
  return url && !failed ? (
    <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}
      className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
  ) : (
    <div className="grid h-full w-full place-items-center pb-14 font-display text-5xl font-bold text-white/90" style={{ background: `linear-gradient(150deg, ${accent}, #0b0b0f 120%)` }} aria-hidden="true">
      {initials(member.displayName)}
    </div>
  );
}

/** YouTube / Kick buttons. Missing channels simply aren't shown. */
function ChannelLinks({ member }) {
  const links = ['YOUTUBE', 'KICK']
    .map((p) => ({ p, acc: member.platforms?.find((x) => x.platform === p && safeUrl(x.url)) }))
    .filter((x) => x.acc);
  if (!links.length) return <p className="flex h-10 items-center justify-center rounded-xl border border-dashed border-ink-700 text-xs text-ink-500">Channels coming soon</p>;
  return (
    <div className={`grid gap-1.5 ${links.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {links.map(({ p, acc }) => {
        const meta = PLATFORM_META[p];
        return (
          <a key={p} href={acc.url} target="_blank" rel="noopener noreferrer"
            aria-label={`${member.displayName} on ${meta.label} (opens in new tab)`}
            className="relative z-10 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-ink-600 bg-ink-800/80 text-sm font-semibold text-ink-100 transition hover:border-[var(--c)] hover:bg-ink-700 hover:text-white"
            style={{ '--c': meta.color }}>
            <meta.Icon className="h-5 w-5" style={{ color: meta.color }} aria-hidden="true" /> {meta.label}
          </a>
        );
      })}
    </div>
  );
}

function CrewCard({ member }) {
  const accent = member.accentColor ?? '#d9a514';
  const about = member.bio || member.tagline;
  return (
    <li className="group card relative flex flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:border-dragon-500/40 hover:shadow-[0_20px_50px_-24px_rgb(217_165_20/.45)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-ink-800">
        <Photo member={member} />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/25 to-transparent" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} aria-hidden="true" />
        {member.live && <LiveBadge platform={member.live.platform} className="absolute left-3 top-3" />}
        <span className="absolute right-3 top-3 rounded-md border border-dragon-500/40 bg-ink-950/80 px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-dragon-300 backdrop-blur">{member.rank}</span>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="truncate font-display text-2xl font-bold leading-tight text-white">
            <Link to={`/members/${member.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">{member.displayName}</Link>
          </h3>
          {member.rpCharacter && <p className="truncate text-sm text-ink-300">as {member.rpCharacter}</p>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        {about
          ? <p className="line-clamp-3 text-sm leading-relaxed text-ink-300">{about}</p>
          : <p className="text-sm italic text-ink-500">Part of the Dragonz family.</p>}
        <div className="mt-auto"><ChannelLinks member={member} /></div>
      </div>
    </li>
  );
}

export function CrewSection({ crew }) {
  const ranks = useMemo(() => [...new Set(crew.map((m) => m.rank))], [crew]);
  const [rank, setRank] = useState('');
  const [showAll, setShowAll] = useState(false);
  if (!crew.length) return null;
  const list = rank ? crew.filter((m) => m.rank === rank) : crew;
  const visible = showAll ? list : list.slice(0, INITIAL);

  return (
    <section className="container-page py-10 sm:py-14" aria-labelledby="crew-h">
      <SectionHeader eyebrow={<span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {crew.length} members strong</span>} title={<span id="crew-h">The Dragonz crew</span>} to="/members" linkLabel="All profiles" />
      {ranks.length > 1 && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by rank">
          {['', ...ranks].map((r) => (
            <button key={r || 'all'} type="button" onClick={() => { setRank(r); setShowAll(false); }} aria-pressed={rank === r}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${rank === r ? 'border-dragon-400 bg-dragon-400 text-ink-950' : 'border-ink-600 text-ink-300 hover:border-ink-400 hover:text-white'}`}>
              {r || 'Everyone'}
            </button>
          ))}
        </div>
      )}
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((m) => <CrewCard key={m.id} member={m} />)}
      </ul>
      {list.length > INITIAL && (
        <div className="mt-6 text-center">
          <button type="button" onClick={() => setShowAll((s) => !s)} className="inline-flex items-center gap-1.5 rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold text-ink-200 hover:border-dragon-500 hover:text-white">
            {showAll ? 'Show less' : `Show all ${list.length}`} <ChevronDown className={`h-4 w-4 transition ${showAll ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}
    </section>
  );
}
