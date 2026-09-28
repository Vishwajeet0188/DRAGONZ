import ReactMarkdown from 'react-markdown';
import { safeUrl } from '../../lib/format.js';

// react-markdown never renders raw HTML, so stored content can't inject scripts.
// Links/images are additionally limited to http(s).
const components = {
  a: ({ href, children }) => {
    const url = safeUrl(href) ?? (href?.startsWith('/') ? href : undefined);
    const external = url?.startsWith('http');
    return <a href={url} className="font-medium text-dragon-300 underline decoration-dragon-500/40 underline-offset-2 hover:text-white" {...(external && { target: '_blank', rel: 'noopener noreferrer nofollow' })}>{children}</a>;
  },
  img: ({ src, alt }) => (safeUrl(src) ? <img src={src} alt={alt ?? ''} loading="lazy" className="my-4 rounded-xl" referrerPolicy="no-referrer" /> : null),
  h1: (p) => <h2 className="mt-8 text-3xl font-bold" {...p} />,
  h2: (p) => <h2 className="mt-8 text-2xl font-bold" {...p} />,
  h3: (p) => <h3 className="mt-6 text-xl font-bold" {...p} />,
  p: (p) => <p className="my-4 leading-relaxed text-ink-200" {...p} />,
  ul: (p) => <ul className="my-4 list-disc space-y-1.5 pl-6 text-ink-200 marker:text-dragon-500" {...p} />,
  ol: (p) => <ol className="my-4 list-decimal space-y-1.5 pl-6 text-ink-200 marker:text-dragon-500" {...p} />,
  blockquote: (p) => <blockquote className="my-5 border-l-2 border-dragon-500 pl-4 italic text-ink-300" {...p} />,
  code: (p) => <code className="rounded bg-ink-800 px-1.5 py-0.5 text-sm text-ember-400" {...p} />,
  hr: () => <hr className="my-8 border-ink-700" />,
  strong: (p) => <strong className="font-semibold text-ink-100" {...p} />,
};

export function Markdown({ children }) {
  return <div className="max-w-none">{<ReactMarkdown components={components} skipHtml>{children ?? ''}</ReactMarkdown>}</div>;
}
