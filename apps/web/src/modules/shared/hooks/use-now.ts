import { useSyncExternalStore } from 'react';

/**
 * How stale a relative timestamp is allowed to get. Half a minute, because the unit that moves
 * fastest is minutes and being a whole one behind is the thing that reads as broken.
 */
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

/**
 * A background tab has its timers throttled to minutes at best, and a sleeping machine runs none at
 * all — so coming back to a dashboard left open overnight would otherwise read "9 minutes ago" until
 * the next tick happened to fire. Catching the tab waking up is what makes the first glance right.
 */
const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    publish();
  }
};

function subscribe(listener: () => void) {
  listeners.add(listener);

  // One timer for the whole page, however many timestamps read it — a dashboard card and a full feed
  // would otherwise each run their own, all ticking at slightly different moments.
  if (timer === undefined) {
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

/**
 * The current time, as something a component can re-render on. Anything showing an age rather than a
 * clock reading has to be told when to say a bigger number, or it keeps whatever it was rendered
 * with — which on a screen nobody has touched for an hour is simply wrong.
 */
export const useNow = () => useSyncExternalStore(subscribe, getSnapshot);
