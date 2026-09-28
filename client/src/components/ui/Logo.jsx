import { Link } from 'react-router';

export const LOGO_SRC = '/brand/drz-logo.webp';

/**
 * The official DRZ dragon mark. The artwork sits on pure black, so `mix-blend-mode: lighten`
 * lets it float over any dark background with no visible square. The glow is a separate layer
 * (a drop-shadow on an opaque image would outline the square). Pass display + size classes.
 * Never put transform/opacity animations on an ANCESTOR of this mark — that isolates the blend
 * and the black square reappears. Animate the image itself via `imgClassName` instead.
 */
export function BrandMark({ className = 'block h-8 w-8', imgClassName = '', glow = false, eager = false }) {
  const pos = /\b(absolute|fixed)\b/.test(className) ? '' : 'relative';
  return (
    <span className={`${pos} ${className}`} aria-hidden="true">
      {glow && <span className="absolute -inset-1/4 rounded-full bg-[radial-gradient(circle,rgb(217_165_20/.28),transparent_62%)]" />}
      <img
        src={LOGO_SRC}
        alt=""
        width="440"
        height="440"
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        className={`relative h-full w-full select-none object-contain mix-blend-lighten ${imgClassName}`}
        draggable="false"
      />
    </span>
  );
}

export function Logo({ to = '/', compact = false }) {
  return (
    <Link to={to} className="group flex items-center gap-2" aria-label="Dragonz Central home">
      <BrandMark className="block h-10 w-10 transition-transform duration-300 group-hover:scale-110" eager />
      {!compact && (
        <span className="font-display leading-none">
          <span className="block text-2xl font-extrabold tracking-[0.08em] text-dragon-400">DRZ</span>
          <span className="block text-[9px] font-semibold tracking-[0.34em] text-ink-300">DRAGONZ CENTRAL</span>
        </span>
      )}
    </Link>
  );
}
