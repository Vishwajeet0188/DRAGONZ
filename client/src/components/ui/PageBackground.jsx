import { BrandMark } from './Logo.jsx';

/**
 * Ambient dragon-themed backdrop shown behind every page (rendered once in SiteLayout).
 * Fixed + pointer-events-none so it never interferes with content; kept very faint so cards,
 * which are translucent, read clearly on top of it. The DRZ mark sits on pure black and uses
 * mix-blend-lighten, so at this low opacity its dark square disappears over the dark page and
 * only the gold of the dragon glows through. The look is a stronger version of the Hall of Fame
 * header, extended site-wide.
 */
export function PageBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* warm aura from the top, like a sunrise behind the crest */}
      <div className="absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(60%_80%_at_50%_-5%,rgb(217_165_20/.10),transparent_60%)]" />
      {/* faint ember glow rising from a bottom corner */}
      <div className="absolute inset-x-0 bottom-0 h-[55vh] bg-[radial-gradient(60%_70%_at_12%_105%,rgb(249_115_22/.06),transparent_58%)]" />
      {/* the dragon crest, watermark-faint, floating top-centre */}
      <BrandMark
        className="absolute left-1/2 top-[-120px] h-[620px] w-[620px] -translate-x-1/2 opacity-[0.05] blur-[1px]"
        imgClassName="h-full w-full object-contain animate-float"
        eager
      />
      {/* a second, smaller crest low and to the side for depth */}
      <BrandMark
        className="absolute bottom-[-140px] right-[-80px] hidden h-[440px] w-[440px] opacity-[0.035] blur-[2px] lg:block"
        imgClassName="h-full w-full object-contain"
      />
      {/* dragon-scale texture, barely there */}
      <div className="scales absolute inset-0 opacity-[0.5]" />
      {/* a hairline of gold at the very top */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-dragon-500/30 to-transparent" />
    </div>
  );
}
