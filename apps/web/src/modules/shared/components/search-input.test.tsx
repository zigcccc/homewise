import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchInput } from './search-input';

const box = () => screen.getByRole('textbox', { name: 'Search contacts' });

const type = (term: string) => fireEvent.change(box(), { target: { value: term } });

function shownTerm() {
  const input = box();
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('The search box is not an input');
  }
  return input.value;
}

function renderBox(onChange: (value: string | undefined) => void, value?: string) {
  return render(<SearchInput label="Search contacts" onChange={onChange} placeholder="Search" value={value} />);
}

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should report the term once the typing stops, not once per letter', () => {
    // GIVEN: a box nobody has typed in yet
    const onChange = vi.fn();
    renderBox(onChange);

    // WHEN: somebody types a word
    for (const term of ['a', 'an', 'ana']) {
      type(term);
    }
    vi.advanceTimersByTime(400);

    // THEN: the list should be filtered once, by the whole word
    expect(onChange).toHaveBeenCalledExactlyOnceWith('ana');
  });

  it('should report an empty box as no filter at all', () => {
    // GIVEN: a box holding a term
    const onChange = vi.fn();
    renderBox(onChange, 'ana');

    // WHEN: it is cleared
    type('');
    vi.advanceTimersByTime(400);

    // THEN: the param should be dropped rather than set to nothing
    expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('should show the term the list is actually filtered by when the param moves on its own', () => {
    // GIVEN: a box someone has typed a different term into
    const { rerender } = renderBox(vi.fn(), 'ana');
    type('anab');

    // WHEN: the param changes underneath — a Back button, or a filter cleared elsewhere
    rerender(<SearchInput label="Search contacts" onChange={vi.fn()} placeholder="Search" value="novak" />);

    // THEN: the box should follow, rather than claim a filter the list is not applying
    expect(shownTerm()).toBe('novak');
  });

  it('should leave what is being typed alone when the param merely catches up', () => {
    // GIVEN: a box that has run ahead of the URL
    const { rerender } = renderBox(vi.fn());
    type('ana');

    // WHEN: the debounce lands and the param becomes what was typed a moment ago
    rerender(<SearchInput label="Search contacts" onChange={vi.fn()} placeholder="Search" value="ana" />);

    // THEN: nothing should move — this happens on every change of our own
    expect(shownTerm()).toBe('ana');
  });
});
