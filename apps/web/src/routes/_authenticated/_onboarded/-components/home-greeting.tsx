import { useSuspenseQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import { getMyHouseholdQueryOptions } from '@/modules/households';
import { formatDate } from '@/modules/shared';

/** Off the local clock, so it agrees with the day the user is actually having. */
function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  return hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * The heading both homes open with — the dashboard's and the guest one's.
 *
 * `testId` rather than one shared value: it is what tells the two pages apart in the e2e suite, and
 * the household name alone can't, since the sidebar carries it on every page.
 */
export function HomeGreeting({ testId, userName }: { testId: string; userName: string }) {
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());

  return (
    <div>
      <h1 className="font-medium text-lg">
        {greeting()}, {userName}
      </h1>
      <p className="text-muted-foreground text-sm" data-testid={testId}>
        {format(new Date(), 'EEEE')}, {formatDate(new Date())} · {household.name}
      </p>
    </div>
  );
}
