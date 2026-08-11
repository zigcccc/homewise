import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addDays,
  clampRange,
  eachDayInclusive,
  endOfMonth,
  startOfISOWeek,
  startOfMonth,
  todayISO,
  todayMonthDay,
} from '#lib/dates';

describe('todayISO', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should read the calendar day in UTC rather than the process timezone', () => {
    // GIVEN: the clock reads half past midnight UTC, when a machine in UTC-5 is still on the 5th
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T00:30:00Z'));

    // WHEN: today is asked for
    // THEN: it should be the UTC day
    expect(todayISO()).toBe('2026-08-06');
  });
});

describe('todayMonthDay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should drop the year and pad both parts', () => {
    // GIVEN: a day whose month and date are both single-digit
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'));

    // WHEN: today's month and day are asked for
    // THEN: both should be zero-padded, so a string comparison orders the calendar
    expect(todayMonthDay()).toBe('01-05');
  });

  it('should read the calendar day in UTC rather than the process timezone', () => {
    // GIVEN: the clock has rolled into a new month in UTC but not in UTC-5
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:30:00Z'));

    // WHEN: today's month and day are asked for
    // THEN: it should be the UTC day, matching `todayISO`
    expect(todayMonthDay()).toBe('09-01');
  });
});

describe('addDays', () => {
  it('should cross a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('should cross a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('should account for the leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('should walk backwards for a negative count', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('should not lose a day across a DST transition', () => {
    // GIVEN: the weekend most of Europe springs forward
    // WHEN: days are added across it
    // THEN: each step should still advance one calendar day — a local-time Date would make one of
    // these 23 hours and format back to the day it started on
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });
});

describe('startOfISOWeek', () => {
  it('should treat Monday as the first day of the week', () => {
    expect(startOfISOWeek('2026-08-05')).toBe('2026-08-03');
  });

  it('should put a Sunday in the week that is ending, not the one starting', () => {
    // GIVEN: Sunday the 9th of August
    // WHEN: the start of its week is asked for
    // THEN: it should be the Monday six days back, not the next day — the US-week trap
    expect(startOfISOWeek('2026-08-09')).toBe('2026-08-03');
  });

  it('should return a Monday unchanged', () => {
    expect(startOfISOWeek('2026-08-03')).toBe('2026-08-03');
  });
});

describe('startOfMonth / endOfMonth', () => {
  it('should find both ends of a 31-day month', () => {
    expect(startOfMonth('2026-08-06')).toBe('2026-08-01');
    expect(endOfMonth('2026-08-06')).toBe('2026-08-31');
  });

  it('should find the end of a 30-day month', () => {
    expect(endOfMonth('2026-04-15')).toBe('2026-04-30');
  });

  it('should find the end of February in both a common and a leap year', () => {
    expect(endOfMonth('2026-02-15')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-15')).toBe('2028-02-29');
  });
});

describe('eachDayInclusive', () => {
  it('should include both ends of the range', () => {
    expect(eachDayInclusive('2026-08-03', '2026-08-06')).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
    ]);
  });

  it('should return the single day when both ends match', () => {
    expect(eachDayInclusive('2026-08-06', '2026-08-06')).toEqual(['2026-08-06']);
  });

  it('should return nothing for an inverted range', () => {
    expect(eachDayInclusive('2026-08-06', '2026-08-03')).toEqual([]);
  });
});

describe('clampRange', () => {
  it('should leave a range inside the limit alone', () => {
    expect(clampRange('2026-08-01', '2026-08-07', 30)).toEqual({ from: '2026-08-01', to: '2026-08-07' });
  });

  it('should clamp to maxDays counted inclusively', () => {
    // GIVEN: a five-month range and a 7-day limit
    // WHEN: it is clamped
    // THEN: it should end on the 7th, not the 8th — the start day is one of the seven
    expect(clampRange('2026-08-01', '2026-12-31', 7)).toEqual({ from: '2026-08-01', to: '2026-08-07' });
  });

  it('should collapse an inverted range onto its start', () => {
    // GIVEN: a range whose end precedes its start, as a hand-edited link can produce
    // WHEN: it is clamped
    // THEN: it should become a single day rather than a 400
    expect(clampRange('2026-08-06', '2026-08-01', 30)).toEqual({ from: '2026-08-06', to: '2026-08-06' });
  });

  it('should accept a range that lands exactly on the limit', () => {
    expect(clampRange('2026-08-01', '2026-08-07', 7)).toEqual({ from: '2026-08-01', to: '2026-08-07' });
  });

  it('should collapse to a single day when maxDays is 1', () => {
    expect(clampRange('2026-08-01', '2026-08-31', 1)).toEqual({ from: '2026-08-01', to: '2026-08-01' });
  });
});
