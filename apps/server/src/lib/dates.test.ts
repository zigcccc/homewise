import { afterEach, describe, expect, it, vi } from 'vitest';

import { addDays, clampRange, eachDayInclusive, endOfMonth, startOfISOWeek, startOfMonth, todayISO } from '#lib/dates';

describe('todayISO', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the calendar day in UTC, not the process timezone', () => {
    // 00:30 UTC on the 6th. A machine in UTC-5 would call this the 5th if the maths ran locally.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T00:30:00Z'));

    expect(todayISO()).toBe('2026-08-06');
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles February in a leap year', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('walks backwards', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('spans a DST transition without losing a day', () => {
    // 29 March 2026 is when most of Europe springs forward. A local-time Date would make this
    // 23 hours and format back as the 28th.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });
});

describe('startOfISOWeek', () => {
  it('treats Monday as the first day', () => {
    expect(startOfISOWeek('2026-08-05')).toBe('2026-08-03');
  });

  it('puts a Sunday in the week that is ending, not the one starting', () => {
    // The US-week trap: 9 August 2026 is a Sunday, and its ISO week began on the 3rd.
    expect(startOfISOWeek('2026-08-09')).toBe('2026-08-03');
  });

  it('returns a Monday unchanged', () => {
    expect(startOfISOWeek('2026-08-03')).toBe('2026-08-03');
  });
});

describe('startOfMonth / endOfMonth', () => {
  it('finds both ends of a 31-day month', () => {
    expect(startOfMonth('2026-08-06')).toBe('2026-08-01');
    expect(endOfMonth('2026-08-06')).toBe('2026-08-31');
  });

  it('finds the end of a 30-day month', () => {
    expect(endOfMonth('2026-04-15')).toBe('2026-04-30');
  });

  it('finds the end of February in both a common and a leap year', () => {
    expect(endOfMonth('2026-02-15')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-15')).toBe('2028-02-29');
  });
});

describe('eachDayInclusive', () => {
  it('includes both ends', () => {
    expect(eachDayInclusive('2026-08-03', '2026-08-06')).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
    ]);
  });

  it('returns the single day when both ends match', () => {
    expect(eachDayInclusive('2026-08-06', '2026-08-06')).toEqual(['2026-08-06']);
  });

  it('returns nothing for an inverted range', () => {
    expect(eachDayInclusive('2026-08-06', '2026-08-03')).toEqual([]);
  });
});

describe('clampRange', () => {
  it('leaves a range inside the limit alone', () => {
    expect(clampRange('2026-08-01', '2026-08-07', 30)).toEqual({ from: '2026-08-01', to: '2026-08-07' });
  });

  it('clamps to maxDays counted inclusively', () => {
    // 7 days starting on the 1st ends on the 7th, not the 8th.
    expect(clampRange('2026-08-01', '2026-12-31', 7)).toEqual({ from: '2026-08-01', to: '2026-08-07' });
  });

  it('collapses an inverted range onto its start', () => {
    expect(clampRange('2026-08-06', '2026-08-01', 30)).toEqual({ from: '2026-08-06', to: '2026-08-06' });
  });

  it('accepts a range that lands exactly on the limit', () => {
    expect(clampRange('2026-08-01', '2026-08-07', 7)).toEqual({ from: '2026-08-01', to: '2026-08-07' });
  });

  it('collapses to a single day when maxDays is 1', () => {
    expect(clampRange('2026-08-01', '2026-08-31', 1)).toEqual({ from: '2026-08-01', to: '2026-08-01' });
  });
});
