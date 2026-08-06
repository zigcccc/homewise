import { type StorageItem } from '../storage-items.queries';

/** Where a thing stands: here, out, or out past when it was promised back. */
export type LoanStatus = 'available' | 'onLoan' | 'overdue';

/**
 * `today` is a parameter rather than something read in here, for the same reason the API takes
 * explicit dates: which day it is, is the *client's* question, and a function that reaches for the
 * clock can't be told about tomorrow.
 *
 * Both sides are `YYYY-MM-DD`, which compares correctly as a string — no Date to build, and no
 * timezone to get wrong on the way.
 */
export function resolveLoanStatus(loan: StorageItem['loan'], today: string): LoanStatus {
  if (!loan) {
    return 'available';
  }

  // An open-ended loan is never overdue; most of them are.
  return loan.dueOn !== null && loan.dueOn < today ? 'overdue' : 'onLoan';
}

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  available: 'Here',
  onLoan: 'On loan',
  overdue: 'Overdue',
};

/** The filter's options, in the order they read as a narrowing: everything, then the two halves. */
export const LOAN_FILTER_LABELS = { all: 'All items', ...LOAN_STATUS_LABELS };
