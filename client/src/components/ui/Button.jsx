import { Link } from 'react-router';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-dragon-400 text-ink-950 hover:bg-dragon-300 shadow-[0_8px_28px_-10px_rgb(217_165_20/.7)]',
  secondary: 'bg-ink-700 text-ink-100 hover:bg-ink-600 border border-ink-600',
  ghost: 'text-ink-200 hover:bg-ink-700/70 hover:text-ink-100',
  outline: 'border border-ink-500 text-ink-100 hover:border-dragon-500 hover:text-white',
  danger: 'bg-red-700 text-white hover:bg-red-600',
};
const SIZES = { sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-base gap-2' };

export function Button({ as, to, href, variant = 'primary', size = 'md', loading = false, className = '', children, disabled, ...rest }) {
  const cls = `inline-flex items-center justify-center rounded-xl font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
  const content = (
    <>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </>
  );
  if (to) return <Link to={to} className={cls} {...rest}>{content}</Link>;
  if (href) return <a href={href} className={cls} target="_blank" rel="noopener noreferrer" {...rest}>{content}</a>;
  const Comp = as ?? 'button';
  return <Comp className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>{content}</Comp>;
}
