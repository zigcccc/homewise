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

const asISO = (date: Date | undefined) => (date ? format(date, 'yyyy-MM-dd') : null);

describe('parseDayFirst', () => {
  it('should read a date day-first rather than month-first', () => {
    // GIVEN: "03. 07. 2026", which is a valid date under either reading
    // WHEN: it is parsed
    // THEN: it should be 3 July — `new Date()` would read it as 7 March, and nothing else catches it
    expect(asISO(parseDayFirst('03. 07. 2026', true))).toBe('2026-07-03');
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
  ])('should accept %s', (_pattern, input) => {
    expect(asISO(parseDayFirst(input, true))).toBe('2026-07-03');
  });

  it('should take back exactly what formatDate renders', () => {
    // GIVEN: a date as the app displays it
    const rendered = formatDate('2026-07-03');

    // WHEN: it is typed back into the field
    // THEN: it should parse to the same day
    expect(asISO(parseDayFirst(rendered!, true))).toBe('2026-07-03');
  });

  it('should trim surrounding whitespace', () => {
    expect(parseDayFirst('  03. 07. 2026  ', true)).toBeDefined();
  });

  it.each(['31. 02. 2026', '32. 01. 2026', '01. 13. 2026'])('should refuse the impossible date %s', (input) => {
    expect(parseDayFirst(input, true)).toBeUndefined();
  });

  it.each(['', '   ', 'nope', '2026', '03. 07.', 'yesterday'])('should refuse %s', (input) => {
    expect(parseDayFirst(input, true)).toBeUndefined();
  });

  it('should refuse a future date unless it is allowed', () => {
    // GIVEN: a fixed today
    freezeAt('2026-08-06T12:00:00');

    // WHEN: a date years ahead is parsed
    // THEN: it should only be accepted when the field allows future dates
    expect(parseDayFirst('01. 01. 2030', false)).toBeUndefined();
    expect(parseDayFirst('01. 01. 2030', true)).toBeDefined();
  });

  it('should accept today and the past either way', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(parseDayFirst('06. 08. 2026', false)).toBeDefined();
    expect(parseDayFirst('01. 01. 1990', false)).toBeDefined();
  });
});

describe('formatDate', () => {
  it('should render day-first with both tokens padded', () => {
    expect(formatDate('2026-04-06')).toBe('06. 04. 2026');
    expect(DATE_DISPLAY_FORMAT).toBe('dd. MM. yyyy');
  });

  it('should read a bare ISO day as a local day', () => {
    // `new Date('2026-04-06')` is UTC midnight, which renders as the 5th west of Greenwich.
    expect(formatDate('2026-04-06')).toBe('06. 04. 2026');
  });

  it('should accept a Date as well as a string', () => {
    expect(formatDate(new Date(2026, 3, 6))).toBe('06. 04. 2026');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['unparseable text', 'nope'],
  ])('should return null for %s rather than throwing', (_what, value) => {
    // These come from timestamps, nullable columns and form fields that can be empty.
    expect(formatDate(value)).toBeNull();
  });
});

describe('formatDateTime', () => {
  it('should render minutes as minutes rather than as the month', () => {
    // `mm` vs `MM`: the uppercase token would render 14:08 as "14:04".
    expect(formatDateTime(new Date(2026, 3, 6, 14, 8))).toBe('06. 04. 2026 @ 14:08');
  });

  it('should use a 24-hour clock', () => {
    expect(formatDateTime(new Date(2026, 3, 6, 23, 5))).toBe('06. 04. 2026 @ 23:05');
  });
});

describe('todayISODay', () => {
  it('should name the local day rather than the UTC one', () => {
    // GIVEN: half past eleven at night, when anyone east of Greenwich is already on the next UTC day
    freezeAt('2026-08-06T23:30:00');

    // WHEN: today is asked for
    // THEN: it should be the day the user is actually having
    expect(todayISODay()).toBe('2026-08-06');
  });
});

describe('monthRange', () => {
  it('should span a whole 31-day month', () => {
    expect(monthRange(8, 2026)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('should take months as 1–12, the way the URL carries them', () => {
    // `?month=8` has to mean August, not September.
    expect(monthRange(8, 2026).from).toBe('2026-08-01');
    expect(monthRange(1, 2026)).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(monthRange(12, 2026)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('should end February on the right day in both a common and a leap year', () => {
    expect(monthRange(2, 2026).to).toBe('2026-02-28');
    expect(monthRange(2, 2028).to).toBe('2028-02-29');
  });
});

describe('monthLabel', () => {
  it('should name the month and year', () => {
    expect(monthLabel(8, 2026)).toBe('August 2026');
    expect(monthLabel(1, 2026)).toBe('January 2026');
  });
});

describe('monthOptions', () => {
  it('should list twelve months numbered 1–12', () => {
    const options = monthOptions();

    expect(options).toHaveLength(12);
    expect(options[0]).toEqual({ label: 'January', value: 1 });
    expect(options[11]).toEqual({ label: 'December', value: 12 });
  });

  it('should be unaffected by what today is', () => {
    // GIVEN: today is the 31st, which is where building these off `new Date()` goes wrong
    freezeAt('2026-01-31T12:00:00');
    const onThe31st = monthOptions();

    // WHEN: the clock moves to a month with a 31st day
    vi.setSystemTime(new Date('2026-08-15T12:00:00'));

    // THEN: the list should be identical, with no short month rolled over into a second March
    expect(onThe31st).toEqual(monthOptions());
    expect(onThe31st.map(({ label }) => label)).toContain('February');
  });
});

describe('yearOptions', () => {
  it('should list every year back to the given one, newest first', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(yearOptions('2023-04-01')).toEqual([2026, 2025, 2024, 2023]);
  });

  it('should list just this year when the date is in it', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(yearOptions('2026-01-01')).toEqual([2026]);
  });

  it('should clamp rather than throwing when the date is in the future', () => {
    // Reachable through clock skew, and `Array.from({ length: -1 })` throws.
    freezeAt('2026-08-06T12:00:00');

    expect(yearOptions('2030-01-01')).toEqual([2026]);
  });
});

describe('ageInYears', () => {
  it('should count whole years', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(ageInYears('2020-08-06')).toBe(6);
  });

  it('should not count a birthday that has not happened yet', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(ageInYears('2020-08-07')).toBe(5);
  });

  it('should count a birth date of today as zero', () => {
    freezeAt('2026-08-06T12:00:00');

    expect(ageInYears('2026-08-06')).toBe(0);
  });

  it('should return null for a date in the future rather than a negative age', () => {
    // GIVEN: a birth date ahead of today, which `DateField` refuses but stored data can still carry
    freezeAt('2026-08-06T12:00:00');

    // WHEN: the age is worked out
    // THEN: there should be none — "-3 years old" is worse on a kid's card than no age at all
    expect(ageInYears('2029-01-01')).toBeNull();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['unparseable text', 'nope'],
  ])('should return null for %s, so a profile with no birth date shows no age', (_what, value) => {
    expect(ageInYears(value)).toBeNull();
  });
});
