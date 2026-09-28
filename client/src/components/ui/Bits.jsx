import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { PLATFORM_META } from '../../lib/platforms.js';
import { compact, safeUrl } from '../../lib/format.js';

export function LiveDot({ className = '' }) {
  return (
    <span className={`relative inline-flex h-2 w-2 ${className}`} aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-live animate-pulse-live" />
      <span className="relative h-2 w-2 rounded-full bg-live" />
    </span>
  );
}

export function LiveBadge({ platform, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md bg-live px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-widest text-white shadow-[0_0_20px_-4px_var(--color-live)] ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-live" aria-hidden="true" /> Live{platform ? ` · ${PLATFORM_META[platform]?.label}` : ''}
    </span>
  );
}

export function Badge({ children, tone = 'default', className = '' }) {
  const tones = {
    default: 'bg-ink-700 text-ink-200 border-ink-600',
    dragon: 'bg-dragon-500/15 text-dragon-300 border-dragon-500/30',
    ember: 'bg-ember-500/15 text-ember-400 border-ember-500/30',
    success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  };
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}

export function PlatformChip({ platform, url, handle, followerCount, showCount = false, size = 'md' }) {
  const meta = PLATFORM_META[platform];
  if (!meta) return null;
  const { Icon } = meta;
  const href = safeUrl(url);
  const sm = size === 'sm';
  const cls = `inline-flex items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-800 font-medium text-ink-200 transition hover:border-ink-400 hover:text-white ${sm ? 'h-7 w-7 justify-center' : 'px-2.5 py-1.5 text-xs'}`;
  const label = `${meta.label}${handle ? ` — ${handle}` : ''}`;
  const inner = (
    <>
      <Icon className={sm ? 'h-3.5 w-3.5' : 'h-3.5 w-3.5'} style={{ color: meta.color }} aria-hidden="true" />
      {!sm && <span>{meta.label}</span>}
      {!sm && showCount && followerCount ? <span className="text-ink-400">{compact(followerCount)}</span> : null}
    </>
  );
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={`${label} (opens in new tab)`} title={label} onClick={(e) => e.stopPropagation()}>{inner}</a>
    : <span className={cls} title={label}>{inner}</span>;
}

export function SectionHeader({ eyebrow, title, to, linkLabel = 'View all', children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
      </div>
      {children}
      {to && (
        <Link to={to} className="group inline-flex items-center gap-1 text-sm font-semibold text-ink-300 hover:text-white">
          {linkLabel} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  const { page, totalPages } = meta;
  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
      <button type="button" className="rounded-lg border border-ink-600 px-3 py-1.5 text-sm disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="px-3 text-sm text-ink-300">Page {page} of {totalPages}</span>
      <button type="button" className="rounded-lg border border-ink-600 px-3 py-1.5 text-sm disabled:opacity-40" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}
