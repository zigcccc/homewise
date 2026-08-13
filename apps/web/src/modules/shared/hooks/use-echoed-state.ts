import { useState } from 'react';

/**
 * State that follows a value it is usually ahead of.
 *
 * For a control that reports its changes somewhere slower than it renders — a debounced search box
 * against a URL search param. What is typed has to be local, or every keystroke waits for the round
 * trip; but when the outside value moves on its own (a Back button, a filter cleared elsewhere) the
 * control has to follow, or it sits there claiming a filter that is no longer applied.
 *
 * Re-syncs **during render** rather than in an effect: an effect runs after the paint, so the stale
 * value is on screen first, and it would also fight the debounce every time our own change lands.
 */
export function useEchoedState<T>(value: T) {
  const [local, setLocal] = useState(value);
  const [echoed, setEchoed] = useState(value);

  if (value !== echoed) {
    setEchoed(value);
    setLocal(value);
  }

  return [local, setLocal] as const;
}
