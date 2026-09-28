import { useState } from 'react';
import { safeUrl } from '../../lib/format.js';

const initials = (name = '') => name.replace(/^dragon\s+/i, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

/** Avatar with graceful fallback: accent-coloured monogram when no image or the image fails. */
export function Avatar({ src, name, accent = '#d9a514', size = 'md', ring = false, live = false, className = '' }) {
  const [failed, setFailed] = useState(false);
  const sizes = { sm: 'h-9 w-9 text-xs', md: 'h-14 w-14 text-base', lg: 'h-20 w-20 text-2xl', xl: 'h-28 w-28 text-4xl sm:h-36 sm:w-36 sm:text-5xl' };
  const url = safeUrl(src);
  const ringCls = live ? 'ring-2 ring-live ring-offset-2 ring-offset-ink-900' : ring ? 'ring-2 ring-ink-600 ring-offset-2 ring-offset-ink-900' : '';
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-2xl font-display font-bold text-white ${sizes[size]} ${ringCls} ${className}`}
      style={{ background: `linear-gradient(135deg, ${accent}, #0b0b0f 130%)` }}
    >
      {url && !failed ? (
        <img src={url} alt={`${name} avatar`} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="grid h-full w-full place-items-center" aria-label={name}>{initials(name)}</span>
      )}
    </div>
  );
}
