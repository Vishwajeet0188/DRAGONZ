const compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const compact = (n) => (n == null ? '' : compactFmt.format(n));

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
export function timeAgo(date) {
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  for (const [unit, secs] of UNITS) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  return 'just now';
}

export const formatDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Intl.DateTimeFormat('en-IN', opts).format(new Date(d));
export const formatDateTime = (d) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(d));

export function duration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export const titleCase = (s) => String(s).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Only allow http(s) links to be rendered as hrefs (defence in depth against javascript: URLs). */
export const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : undefined);
