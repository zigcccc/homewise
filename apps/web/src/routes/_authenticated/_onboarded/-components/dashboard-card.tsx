import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

import { Card, CardAction, CardContent, CardHeader, CardTitle, Skeleton } from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

/**
 * The frame every dashboard card shares. `h-full` is load-bearing: two cards in a grid row are only
 * the same height if both claim it.
 */
export function DashboardCard({
  action,
  children,
  className,
  icon: Icon,
  title,
}: {
  /** A node rather than a `to`: a route threaded through here would widen to `string`. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon: LucideIcon;
  title: string;
}) {
  // Named explicitly, because `CardTitle` renders a div rather than a heading for the region to
  // borrow its name from.
  return (
    <Card aria-label={title} className={cn('h-full', className)} role="region">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** A card's "nothing here yet" line — not the page-level `Empty`, whose `md:p-12` would dwarf a card. */
export function DashboardCardEmpty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

/** A label on the left, a value or badge on the right. */
export function DashboardCardRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', className)}>{children}</div>;
}

/** Uneven, so the placeholder reads as a list of names rather than a bar chart. Also the row keys. */
const PLACEHOLDER_WIDTHS = ['w-40', 'w-28', 'w-36', 'w-24', 'w-32'];

/** What a row-shaped card shows while its query is in flight. */
export function DashboardCardRowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y">
      {PLACEHOLDER_WIDTHS.slice(0, rows).map((width) => (
        <DashboardCardRow key={width}>
          <Skeleton className={cn('h-4 max-w-full', width)} />
          <Skeleton className="h-4 w-16 shrink-0" />
        </DashboardCardRow>
      ))}
    </div>
  );
}
