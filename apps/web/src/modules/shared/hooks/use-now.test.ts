import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNow } from './use-now';

/**
 * The clock behind every relative timestamp. Worth pinning because both things it does are invisible
 * until they aren't: a feed left open goes quietly stale without the tick, and a page full of
 * timestamps quietly runs a timer each without the sharing.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useNow', () => {
  it('should move on as time passes', () => {
    // GIVEN: a component reading the clock
    const { result } = renderHook(() => useNow());
    const started = result.current;

    // WHEN: a minute goes by without anybody touching the page
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    // THEN: it should have moved — this is the whole difference between "9 minutes ago" ageing and
    // it sitting there saying 9 forever
    expect(result.current).toBeGreaterThan(started);
  });

  it('should run one timer however many timestamps are on the page', () => {
    // GIVEN: a dashboard card and a feed, five rows each
    const spy = vi.spyOn(globalThis, 'setInterval');
    const readers = Array.from({ length: 10 }, () => renderHook(() => useNow()));

    // THEN: they should share a single interval, so every timestamp also turns over together
    expect(spy).toHaveBeenCalledOnce();

    // WHEN: all but one go away
    for (const reader of readers.slice(1)) {
      reader.unmount();
    }

    // THEN: the timer should still be running for the one that's left
    const before = readers[0]!.result.current;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(readers[0]!.result.current).toBeGreaterThan(before);
  });

  it('should stop ticking once nothing is reading it', () => {
    // GIVEN: the last reader of the clock, unmounted
    const spy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useNow());

    // WHEN: it goes
    unmount();

    // THEN: the interval should go with it, rather than waking a tab that is showing nothing
    expect(spy).toHaveBeenCalled();
  });

  it('should catch up the moment a backgrounded tab is looked at again', () => {
    // GIVEN: a page that has been open in a background tab, where timers are throttled or stopped
    const { result } = renderHook(() => useNow());
    const started = result.current;
    vi.setSystemTime(new Date(started + 4 * 60 * 60 * 1000));

    // WHEN: the tab is brought back to the front
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // THEN: it should be right on the first glance rather than at the next tick — four hours of
    // "9 minutes ago" is the exact case this exists for
    expect(result.current).toBeGreaterThan(started);
  });
});
