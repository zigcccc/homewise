import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useEchoedState } from './use-echoed-state';

describe('useEchoedState', () => {
  it('should let the control run ahead of the value it follows', () => {
    // GIVEN: a search box whose term has not reached the URL yet
    const { result } = renderHook(({ term }) => useEchoedState(term), { initialProps: { term: '' } });

    // WHEN: somebody types
    act(() => {
      result.current[1]('ana');
    });

    // THEN: the box should show it immediately, rather than waiting for the debounce to land
    expect(result.current[0]).toBe('ana');
  });

  it('should follow the outside value when it moves on its own', () => {
    // GIVEN: a box showing a term that was typed into it
    const { rerender, result } = renderHook(({ term }) => useEchoedState(term), { initialProps: { term: 'ana' } });
    act(() => {
      result.current[1]('anab');
    });

    // WHEN: the URL changes underneath — a Back button, or a filter cleared elsewhere
    rerender({ term: 'novak' });

    // THEN: the box should say what is actually being filtered by. Keeping the typed value here is
    // the bug this exists for: a box claiming a filter the list is not applying
    expect(result.current[0]).toBe('novak');
  });

  it('should leave what is being typed alone when the value merely catches up', () => {
    // GIVEN: a box that has run ahead twice
    const { rerender, result } = renderHook(({ term }) => useEchoedState(term), { initialProps: { term: '' } });
    act(() => {
      result.current[1]('ana');
    });

    // WHEN: the debounce lands and the outside value becomes what was typed a moment ago
    rerender({ term: 'ana' });

    // THEN: nothing should move — this fires on every one of our own changes, and a reset here would
    // fight the debounce rather than follow it
    expect(result.current[0]).toBe('ana');
  });
});
