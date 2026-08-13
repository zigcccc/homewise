import { useSyncExternalStore } from 'react';

/** How stale a relative timestamp may get. Half a minute, since the fastest unit shown is minutes. */
const TICK_MS = 30_000;

const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

const publish = () => {
  now = Date.now();

  for (const listener of listeners) {
    listener();
  }
};

/** A background tab throttles timers and a sleeping machine runs none — so catch it waking up too. */
const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    publish();
  }
};

function subscribe(listener: () => void) {
  listeners.add(listener);

  // One timer for the whole page, so every timestamp on it also turns over together.
  if (timer === undefined) {
    // A first subscriber after a quiet spell would otherwise read whatever the last one left behind.
    now = Date.now();
    timer = setInterval(publish, TICK_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}

const getSnapshot = () => now;

/** The current time, as something a component can re-render on. */
export const useNow = () => useSyncExternalStore(subscribe, getSnapshot);
