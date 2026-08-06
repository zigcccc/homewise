import { format } from 'date-fns';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ageInYears,
  DATE_DISPLAY_FORMAT,
  formatDate,
  formatDateTime,
  monthLabel,
  monthOptions,
  monthRange,
  parseDayFirst,
  todayISODay,
  yearOptions,
} from './dates';

afterEach(() => {
  vi.useRealTimers();
});

/** Freezes the clock, so "is this in the future?" and "how old is this?" have one answer. */
function freezeAt(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('parseDayFirst', () => {
  it('reads a date day-first, not month-first', () => {
    // The whole reason this exists: `new Date('03. 07. 2026')` is 7 March in the US reading, and
    // 3 July here. Both are valid dates, so nothing else catches it.
    const parsed = parseDayFirst('03. 07. 2026', true);

    expect(parsed && format(parsed, 'yyyy-MM-dd')).toBe('2026-07-03');
  });

  it.each([
    ['dd. MM. yyyy', '03. 07. 2026'],
    ['d. M. yyyy', '3. 7. 2026'],
    ['dd.MM.yyyy', '03.07.2026'],
    ['d.M.yyyy', '3.7.2026'],
    ['dd/MM/yyyy', '03/07/2026'],
    ['d/M/yyyy', '3/7/2026'],
    ['dd-MM-yyyy', '03-07-2026'],
    ['d-M-yyyy', '3-7-2026'],
    ['yyyy-MM-dd', '2026-07-03'],
    ['d MMMM yyyy', '3 July 2026'],
    ['d MMM yyyy', '3 Jul 2026'],
  ])('accepts %s', (_pattern, input) => {
    const parsed = parseDayFirst(input, true);

    expect(parsed && format(parsed, 'yyyy-MM-dd')).toBe('2026-07-03');
  });

  it('takes back exactly what formatDate renders', () => {
    const rendered = formatDate('2026-07-03');
    const parsed = parseDayFirst(rendered!, true);

    expect(parsed && format(parsed, 'yyyy-MM-dd')).toBe('2026-07-03');
  });

  it('trims surrounding whitespace', () => {
    expect(parseDayFirst('  03. 07. 2026  ', true)).toBeDefined();
  });

  it.each(['31. 02. 2026', '32. 01. 2026', '01. 13. 2026'])('refuses the impossible date %s', (input) => {
    expect(parseDayFirst(input, true)).toBeUndefined();
  });

  it.each(['', '   ', 'nope', '2026', '03. 07.', 'yesterday'])('refuses %s', (input) => {
    expect(parseDayFirst(input, true)).toBeUndefined();
  });

  it('refuses a future date unless it is allowed', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(parseDayFirst('01. 01. 2030', false)).toBeUndefined();
    expect(parseDayFirst('01. 01. 2030', true)).toBeDefined();
  });

  it('accepts today and the past either way', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(parseDayFirst('06. 08. 2026', false)).toBeDefined();
    expect(parseDayFirst('01. 01. 1990', false)).toBeDefined();
  });
});

describe('formatDate', () => {
  it('renders day-first with both tokens padded', () => {
    expect(formatDate('2026-04-06')).toBe('06. 04. 2026');
    expect(DATE_DISPLAY_FORMAT).toBe('dd. MM. yyyy');
  });

  it('reads a bare ISO day as a local day', () => {
    // `new Date('2026-04-06')` is UTC midnight, which renders as the 5th anywhere west of Greenwich.
    expect(formatDate('2026-04-06')).toBe('06. 04. 2026');
  });

  it('accepts a Date as well as a string', () => {
    expect(formatDate(new Date(2026, 3, 6))).toBe('06. 04. 2026');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['unparseable text', 'nope'],
  ])('returns null for %s rather than throwing', (_what, value) => {
    expect(formatDate(value)).toBeNull();
  });
});

describe('formatDateTime', () => {
  it('renders minutes as minutes, not as the month', () => {
    // `mm` vs `MM`: the uppercase token would render 14:08 as "14:04".
    expect(formatDateTime(new Date(2026, 3, 6, 14, 8))).toBe('06. 04. 2026 @ 14:08');
  });

  it('uses a 24-hour clock', () => {
    expect(formatDateTime(new Date(2026, 3, 6, 23, 5))).toBe('06. 04. 2026 @ 23:05');
  });
});

describe('todayISODay', () => {
  it('names the local day, not the UTC one', () => {
    // 23:30 local on the 6th is already the 7th in UTC for anyone east of Greenwich; the API takes
    // the day the user is actually having.
    freezeAt('2026-08-06T23:30:00');

    expect(todayISODay()).toBe('2026-08-06');
  });
});

describe('monthRange', () => {
  it('spans a whole 31-day month', () => {
    expect(monthRange(8, 2026)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('takes months as 1–12, the way the URL carries them', () => {
    // `?month=8` has to mean August, not September.
    expect(monthRange(8, 2026).from).toBe('2026-08-01');
    expect(monthRange(1, 2026)).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(monthRange(12, 2026)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('ends February on the right day in both a common and a leap year', () => {
    expect(monthRange(2, 2026).to).toBe('2026-02-28');
    expect(monthRange(2, 2028).to).toBe('2028-02-29');
  });
});

describe('monthLabel', () => {
  it('names the month and year', () => {
    expect(monthLabel(8, 2026)).toBe('August 2026');
    expect(monthLabel(1, 2026)).toBe('January 2026');
  });
});

describe('monthOptions', () => {
  it('lists twelve months numbered 1–12', () => {
    const options = monthOptions();

    expect(options).toHaveLength(12);
    expect(options[0]).toEqual({ label: 'January', value: 1 });
    expect(options[11]).toEqual({ label: 'December', value: 12 });
  });

  it('is unaffected by what today is', () => {
    // Anchored to a fixed year on purpose: building these off `new Date()` on a 31st rolls the
    // short months over and yields two Marches.
    freezeAt('2026-01-31T12:00:00');
    const onThe31st = monthOptions();

    vi.setSystemTime(new Date('2026-08-15T12:00:00'));

    expect(onThe31st).toEqual(monthOptions());
    expect(onThe31st.map(({ label }) => label)).toContain('February');
  });
});

describe('yearOptions', () => {
  it('lists every year back to the given one, newest first', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(yearOptions('2023-04-01')).toEqual([2026, 2025, 2024, 2023]);
  });

  it('lists just this year when the date is in it', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(yearOptions('2026-01-01')).toEqual([2026]);
  });

  it('clamps rather than throwing when the date is in the future', () => {
    // Reachable through clock skew, and `Array.from({ length: -1 })` throws.
    freezeAt('2026-08-06T12:00:00');

    expect(yearOptions('2030-01-01')).toEqual([2026]);
  });
});

describe('ageInYears', () => {
  it('counts whole years', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(ageInYears('2020-08-06')).toBe(6);
  });

  it('does not count a birthday that has not happened yet', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(ageInYears('2020-08-07')).toBe(5);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['unparseable text', 'nope'],
  ])('returns null for %s, so a profile with no birth date shows no age', (_what, value) => {
    expect(ageInYears(value)).toBeNull();
  });
});
