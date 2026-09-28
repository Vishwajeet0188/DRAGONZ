import { useEffect } from 'react';

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Dragonz Central` : 'Dragonz Central — Home of the Dragonz';
  }, [title]);
}
