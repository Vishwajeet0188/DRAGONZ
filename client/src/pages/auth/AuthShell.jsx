import { BrandMark } from '../../components/ui/Logo.jsx';

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="container-page grid min-h-[calc(100dvh-4rem)] place-items-center py-12">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-6 text-center">
          <BrandMark className="mx-auto block h-16 w-16" glow />
          <h1 className="mt-4 text-3xl font-bold">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-300">{subtitle}</p>}
        </div>
        <div className="card p-6 sm:p-8">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-ink-400">{footer}</div>}
      </div>
    </div>
  );
}

/** Read a one-time token from the URL, then strip it so it never lingers in history or leaks via Referer. */
export function takeUrlToken() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (token) {
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  }
  return token;
}
