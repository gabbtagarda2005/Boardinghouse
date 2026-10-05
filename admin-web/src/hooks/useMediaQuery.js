import { useEffect, useState } from 'react';

/** True while the media query matches, e.g. useMediaQuery('(max-width: 767px)'). */
export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Phones: below Tailwind's md breakpoint (768px). */
export const usePhone = () => useMediaQuery('(max-width: 767.98px)');
