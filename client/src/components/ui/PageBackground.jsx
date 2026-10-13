import { BrandMark } from './Logo.jsx';

/**
 * Ambient dragon-themed backdrop shown behind every page (rendered once in SiteLayout).
 * Fixed + pointer-events-none so it never interferes with content; kept very faint so cards,
 * which are translucent, read clearly on top of it. The DRZ mark sits on pure black and uses
 * mix-blend-lighten, so at this low opacity its dark square disappears over the dark page and
 * only the gold of the dragon glows through. A radial mask fades the crest out towards the
 * edges so it never looks like a cropped or half-visible logo.
 */
export function PageBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* warm aura from the top, like a sunrise behind the crest */}
      <div className="absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(55%_70%_at_50%_-10%,rgb(217_165_20/.07),transparent_62%)]" />
      {/* faint ember glow rising from a bottom corner */}
      <div className="absolute inset-x-0 bottom-0 h-[45vh] bg-[radial-gradient(55%_60%_at_15%_110%,rgb(249_115_22/.04),transparent_60%)]" />
      {/* the dragon crest — fully visible, centred high on the page, watermark-faint, edges masked so it dissolves into the page */}
      <BrandMark
        className="absolute left-1/2 top-[8vh] h-[72vmin] w-[72vmin] max-h-[560px] max-w-[560px] -translate-x-1/2 opacity-[0.04] [mask-image:radial-gradient(closest-side,#000_55%,transparent_100%)] [-webkit-mask-image:radial-gradient(closest-side,#000_55%,transparent_100%)]"
        imgClassName="h-full w-full object-contain animate-float"
        eager
      />
      {/* dragon-scale texture, barely there */}
      <div className="scales absolute inset-0 opacity-[0.35]" />
      {/* a hairline of gold at the very top */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-dragon-500/25 to-transparent" />
    </div>
  );
}
