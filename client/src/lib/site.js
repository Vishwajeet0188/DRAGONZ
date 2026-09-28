import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { DISCORD_URL } from '../config.js';

const FALLBACK = { discordUrl: DISCORD_URL, heroTagline: '', bannerText: '', bannerUrl: '', recruitmentOpen: false };

/** Public site settings (editable in Admin → Settings). */
export function useSiteSettings() {
  const q = useQuery({ queryKey: ['site-settings'], queryFn: () => api.get('/settings').then((r) => r.data), staleTime: 5 * 60_000 });
  return { ...FALLBACK, ...(q.data ?? {}) };
}

/** Privacy-friendly page-view counting: path only, no cookies/IDs; respects Do Not Track. */
export function usePageViewTracking() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (navigator.doNotTrack === '1' || pathname.startsWith('/admin')) return;
    const t = setTimeout(() => api.beacon('/analytics/pv', { path: pathname }), 800); // skip instant bounces/redirects
    return () => clearTimeout(t);
  }, [pathname]);
}

export const trackClick = (type, id) => { if (navigator.doNotTrack !== '1' && id) api.beacon('/analytics/click', { type, id }); };
