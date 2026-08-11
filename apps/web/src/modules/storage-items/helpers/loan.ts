import { todayISODay } from '@/modules/shared';

import { type StorageItem } from '../storage-items.queries';

/** Where a thing stands: here, out, or out past when it was promised back. */
export type LoanStatus = 'available' | 'onLoan' | 'overdue';

/**
 * Both dates are `YYYY-MM-DD`, which compares correctly as a string — no Date to build, and no
 * timezone to get wrong on the way. `todayISODay` names the *local* day, which is the one whose
 * badge the user is looking at.
 */
export function resolveLoanStatus(loan: StorageItem['loan']): LoanStatus {
  if (!loan) {
    return 'available';
  }

  const today = todayISODay();

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
