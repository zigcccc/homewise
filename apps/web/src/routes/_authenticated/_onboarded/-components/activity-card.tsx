import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, HistoryIcon } from 'lucide-react';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@homewise/ui/core';

import {
  ActivityChanges,
  type ActivityEntry,
  ActivityEntryLine,
  collapseChanges,
  RECENT_ACTIVITY_LIMIT,
  recentActivityQueryOptions,
} from '@/modules/activity';
import { TimeAgo } from '@/modules/shared';

import {
  DashboardCard,
  DashboardCardEmpty,
  type DashboardCardFrame,
  DashboardCardRow,
  DashboardCardRowsSkeleton,
} from './dashboard-card';

/** The frame, shared with the skeleton so a renamed card can't say two things at once. */
const CARD = {
  action: (
    <Button asChild size="sm" variant="ghost">
      <Link to="/manage/activity">
        View all
        <ArrowRightIcon />
      </Link>
    </Button>
  ),
  icon: HistoryIcon,
  title: 'Recent activity',
} satisfies DashboardCardFrame;

/**
 * Sliced by the *server*, unlike every other card here, which fetches its domain whole and takes the
 * first few. This is the one table with no ceiling on it, so "give me five" has to be the request.
 */
export const dashboardActivityQueryOptions = () => recentActivityQueryOptions();

/**
 * One row. The tooltip exists only when there is something in it — asked once, here, rather than as
 * a `disabled` on the trigger.
 *
 * That distinction is the whole bug this shape prevents: `TooltipContent` *is* the bubble, padding
 * and arrow included, so content that renders nothing still paints one. Deciding on the trigger
 * instead means two expressions answering the same question, and a folded run whose fields all ended
 * where they began is enough to make them disagree.
 *
 * The trigger stays a button for the keyboard's sake — a tooltip nobody can focus is one a good
 * share of people can't read — but takes `cursor-default` against the base rule that makes every
 * button a pointer. Hovering to reveal a detail is not a click, and a pointer promises a navigation
 * that never happens.
 */
function ActivityCardLine({ entry }: { entry: ActivityEntry }) {
  const changes = collapseChanges(entry.changes);

  if (changes.length === 0) {
    return <ActivityEntryLine entry={entry} />;
  }

  return (
    <Tooltip>
      <TooltipTrigger className="cursor-default text-left">
        <ActivityEntryLine entry={entry} />
      </TooltipTrigger>
      <TooltipContent>
        <ActivityChanges changes={entry.changes} />
      </TooltipContent>
    </Tooltip>
  );
}

function ActivityCardSkeleton() {
  return (
    <DashboardCard {...CARD}>
      <DashboardCardRowsSkeleton rows={RECENT_ACTIVITY_LIMIT} />
    </DashboardCard>
  );
}

export function ActivityCard() {
  const { data } = useSuspenseQuery(dashboardActivityQueryOptions());

  return (
    <DashboardCard {...CARD}>
      {data.entries.length === 0 ? (
        <DashboardCardEmpty>Nothing has happened yet.</DashboardCardEmpty>
      ) : (
        <div className="divide-y">
          {data.entries.map((entry) => (
            <DashboardCardRow className="items-start" key={entry.id}>
              {/*
                What changed sits in a tooltip here rather than under the line: the card is a glance
                at five rows, and a second line on each would double its height for a detail the feed
                is one click away from showing in full.
              */}
              <ActivityCardLine entry={entry} />
              <TimeAgo className="shrink-0 text-muted-foreground text-xs" value={entry.updatedAt} />
            </DashboardCardRow>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

ActivityCard.Skeleton = ActivityCardSkeleton;
