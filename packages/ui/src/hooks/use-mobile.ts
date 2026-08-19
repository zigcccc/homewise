import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(callback: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/**
 * The same check outside React, for a decision that belongs to a navigation rather than a render —
 * a route's `beforeLoad`, say. Shares {@link MOBILE_BREAKPOINT} so the two can't drift.
 */
export function isMobileViewport() {
  return window.matchMedia(query).matches;
}

function getSnapshot() {
  return isMobileViewport();
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
