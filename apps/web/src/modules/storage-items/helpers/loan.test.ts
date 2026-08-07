import { describe, expect, it } from 'vitest';

import { resolveLoanStatus } from './loan';

/**
 * The overdue boundary. A stored loan is three nullable columns and the answer the UI wants is one
 * word, so this is the parsing-shaped kind of logic a unit test is for — and the day boundary in
 * particular is not something an E2E flow can hold still.
 */

const TODAY = '2026-08-06';

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
    expect(resolveLoanStatus(null, TODAY)).toBe('available');
  });

  it('should report an open-ended loan as on loan, however old', () => {
    // GIVEN: a loan with no due date — most of them
    // THEN: it can never be overdue, because nothing was promised
    expect(resolveLoanStatus(loan(null), TODAY)).toBe('onLoan');
  });

  it('should report a loan due in the future as on loan', () => {
    expect(resolveLoanStatus(loan('2026-08-07'), TODAY)).toBe('onLoan');
  });

  it('should still be on loan on the day it is due', () => {
    // GIVEN: a loan due today — you have until the end of the day, so this is the boundary that
    // decides whether a badge turns red a day early
    expect(resolveLoanStatus(loan(TODAY), TODAY)).toBe('onLoan');
  });

  it('should report a loan due yesterday as overdue', () => {
    expect(resolveLoanStatus(loan('2026-08-05'), TODAY)).toBe('overdue');
  });

  it('should compare across a year boundary', () => {
    // GIVEN: dates whose string comparison could plausibly disagree with their calendar order
    expect(resolveLoanStatus(loan('2025-12-31'), '2026-01-01')).toBe('overdue');
    expect(resolveLoanStatus(loan('2026-01-01'), '2025-12-31')).toBe('onLoan');
  });
});
