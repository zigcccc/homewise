import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveLoanStatus } from './loan';

/**
 * The overdue boundary. A stored loan is three nullable columns and the answer the UI wants is one
 * word, so this is the parsing-shaped kind of logic a unit test is for — and the day boundary in
 * particular is not something an E2E flow can hold still.
 */

const TODAY = '2026-08-06';

afterEach(() => {
  vi.useRealTimers();
});

/** The helper reads the clock, so the clock is what a test about days has to set. */
function freezeAt(isoDay: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${isoDay}T12:00:00`));
}

const loan = (dueOn: string | null) => ({
  borrowedOn: '2026-07-01',
  contactId: 1,
  dueOn,
  email: null,
  name: 'Ana Novak',
  phone: null,
});

describe('resolveLoanStatus', () => {
  it('should report an item with no loan as available', () => {
    freezeAt(TODAY);

    expect(resolveLoanStatus(null)).toBe('available');
  });

  it('should report an open-ended loan as on loan, however old', () => {
    // GIVEN: a loan with no due date — most of them
    // THEN: it can never be overdue, because nothing was promised
    freezeAt(TODAY);

    expect(resolveLoanStatus(loan(null))).toBe('onLoan');
  });

  it('should report a loan due in the future as on loan', () => {
    freezeAt(TODAY);

    expect(resolveLoanStatus(loan('2026-08-07'))).toBe('onLoan');
  });

  it('should still be on loan on the day it is due', () => {
    // GIVEN: a loan due today — you have until the end of the day, so this is the boundary that
    // decides whether a badge turns red a day early
    freezeAt(TODAY);

    expect(resolveLoanStatus(loan(TODAY))).toBe('onLoan');
  });

  it('should report a loan due yesterday as overdue', () => {
    freezeAt(TODAY);

    expect(resolveLoanStatus(loan('2026-08-05'))).toBe('overdue');
  });

  it('should compare across a year boundary', () => {
    // GIVEN: dates whose string comparison could plausibly disagree with their calendar order
    freezeAt('2026-01-01');
    expect(resolveLoanStatus(loan('2025-12-31'))).toBe('overdue');

    freezeAt('2025-12-31');
    expect(resolveLoanStatus(loan('2026-01-01'))).toBe('onLoan');
  });
});
