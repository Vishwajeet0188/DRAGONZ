import { AlertTriangle, RefreshCw } from 'lucide-react';
import { BrandMark } from './Logo.jsx';
import { Button } from './Button.jsx';

export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <BrandMark className="block h-12 w-12 animate-pulse" />
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-ink-700/60 ${className}`} aria-hidden="true" />;
}

export function CardGridSkeleton({ count = 8, className = 'h-64' }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className={`${className} rounded-[var(--radius-card)]`} />)}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="card scales flex flex-col items-center gap-3 px-6 py-12 text-center">
      {Icon && <Icon className="h-8 w-8 text-ink-400" aria-hidden="true" />}
      <h3 className="text-xl font-bold">{title}</h3>
      {children && <p className="max-w-md text-sm text-ink-300">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="card flex flex-col items-center gap-3 border-dragon-700/50 px-6 py-10 text-center" role="alert">
      <AlertTriangle className="h-8 w-8 text-dragon-400" aria-hidden="true" />
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="max-w-md text-sm text-ink-300">{error?.message ?? 'Please try again.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={() => onRetry()}>
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}

/** Renders loading / error / empty / content for a TanStack query. */
export function QueryState({ query, loading, empty, isEmpty, children }) {
  if (query.isPending) return loading ?? <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (isEmpty?.(query.data)) return empty ?? null;
  return children(query.data);
}
