import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function Field({ label, error, hint, type = 'text', className = '', as = 'input', children, ...props }) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const describedBy = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  const common = { id, 'aria-invalid': Boolean(error) || undefined, 'aria-describedby': describedBy, ...props };
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="label">{label}</label>}
      <div className="relative">
        {as === 'textarea' ? <textarea className="input min-h-28" {...common} />
          : as === 'select' ? <select className="input" {...common}>{children}</select>
          : <input className={`input ${isPassword ? 'pr-10' : ''} ${error ? 'border-dragon-500' : ''}`} type={isPassword && show ? 'text' : type} {...common} />}
        {isPassword && (
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-ink-400 hover:text-ink-100" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-400">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1.5 text-xs font-medium text-dragon-300" role="alert">{error}</p>}
    </div>
  );
}

export function FormAlert({ tone = 'error', children }) {
  if (!children) return null;
  const tones = { error: 'border-dragon-600/50 bg-dragon-500/10 text-dragon-300', success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', info: 'border-ink-500 bg-ink-800 text-ink-200' };
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2.5 text-sm ${tones[tone]}`}>{children}</div>;
}
