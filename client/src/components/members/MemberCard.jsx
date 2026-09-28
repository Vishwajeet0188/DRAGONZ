import { Link } from 'react-router';
import { Sparkles } from 'lucide-react';
import { Avatar } from '../ui/Avatar.jsx';
import { Badge, LiveBadge } from '../ui/Bits.jsx';
import { PLATFORM_META } from '../../lib/platforms.js';
import { compact, safeUrl } from '../../lib/format.js';

/** Big, labelled social button: brand icon + name (+ follower count). */
function SocialButton({ platform, url, followerCount, name }) {
  const meta = PLATFORM_META[platform];
  const href = safeUrl(url);
  if (!meta || !href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${name} on ${meta.label} (opens in new tab)`}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-600 bg-ink-800/80 px-3 text-sm font-semibold text-ink-100 transition hover:border-[var(--c)] hover:bg-ink-700"
      style={{ '--c': meta.color }}>
      <meta.Icon className="h-5 w-5" style={{ color: meta.color }} aria-hidden="true" />
      {meta.label}
      {followerCount ? <span className="text-xs font-medium text-ink-400">{compact(followerCount)}</span> : null}
    </a>
  );
}

export function MemberCard({ member }) {
  const accent = member.accentColor ?? '#d9a514';
  return (
    <article className="group card card-hover relative flex flex-col overflow-hidden">
      {/* accent strip */}
      <div className="scales h-16" style={{ background: `linear-gradient(120deg, ${accent}66, transparent 75%)` }} aria-hidden="true" />
      <div className="-mt-9 flex flex-1 flex-col px-4 pb-4">
        <div className="flex items-end justify-between">
          <Avatar src={member.avatarUrl} name={member.displayName} accent={accent} size="lg" live={Boolean(member.live)} />
          {member.live && <LiveBadge platform={member.live.platform} />}
        </div>
        <h3 className="mt-3 text-xl font-bold leading-tight">
          <Link to={`/members/${member.slug}`} className="after:absolute after:inset-0 hover:text-dragon-300 focus-visible:outline-none">
            {member.displayName}
          </Link>
        </h3>
        {member.rpCharacter && <p className="text-sm text-ink-300">as {member.rpCharacter}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="dragon">{member.rank}</Badge>
          {member.isCreator && <Badge tone="ember"><Sparkles className="h-3 w-3" aria-hidden="true" /> Creator</Badge>}
          {member.status === 'ALUMNI' && <Badge>Alumni</Badge>}
        </div>
        {member.platforms?.length > 0 && (
          // z-10 keeps social links clickable above the full-card profile link
          <div className="relative z-10 mt-auto flex flex-wrap gap-2 pt-4">
            {member.platforms.map((p) => <SocialButton key={p.platform} {...p} name={member.displayName} />)}
          </div>
        )}
      </div>
    </article>
  );
}
