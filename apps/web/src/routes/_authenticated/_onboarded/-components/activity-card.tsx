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

/** Sliced by the *server*, unlike every other card — this is the one table with no ceiling on it. */
export const dashboardActivityQueryOptions = () => recentActivityQueryOptions();

/**
 * One row. The `Tooltip` exists only when there is something in it: `TooltipContent` *is* the bubble,
 * padding and arrow included, so content that renders nothing still paints one.
 *
 * The trigger is a `span` rather than its default button — the line already holds a link, and a
 * button around an anchor is invalid markup. The same detail is plain text on the feed page.
 */
function ActivityCardLine({ entry }: { entry: ActivityEntry }) {
  const changes = collapseChanges(entry.changes);

  if (changes.length === 0) {
    return <ActivityEntryLine entry={entry} />;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="min-w-0">
          <ActivityEntryLine entry={entry} />
        </span>
      </TooltipTrigger>
      {/* Bounded, so the `truncate` on a change line has a width to bite on — the bubble is `w-fit`. */}
      <TooltipContent className="max-w-xs">
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
      {data.items.length === 0 ? (
        <DashboardCardEmpty>Nothing has happened yet.</DashboardCardEmpty>
      ) : (
        <div className="divide-y">
          {data.items.map((entry) => (
            <DashboardCardRow className="items-start" key={entry.id}>
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
