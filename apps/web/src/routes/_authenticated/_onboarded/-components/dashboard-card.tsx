import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

/**
 * The frame every dashboard card shares: an icon, a title, and the way through to the page that owns
 * the data.
 *
 * Extracted rather than written six times, because the cards differ in their rows and not in their
 * chrome — and the one thing that must stay identical between them is how they line up beside each
 * other. `h-full` is part of that: two cards in a grid row are only the same height if both claim it.
 */
export function DashboardCard({
  action,
  children,
  className,
  icon: Icon,
  title,
}: {
  /**
   * The link through to the full page. Taken as a node rather than a `to`, so each card keeps the
   * router's typed route — a `to` threaded through here would widen to `string` and stop checking.
   */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon: LucideIcon;
  title: string;
}) {
  // A named `region`, so the dashboard is navigable as landmarks rather than as one wall of text —
  // and so a spec can scope an assertion to the card it means instead of to the whole page. The name
  // has to be given explicitly: `CardTitle` renders a styled div, not a heading, so there is nothing
  // for the region to be labelled by.
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

/**
 * A card's "nothing here yet" line.
 *
 * Deliberately **not** the `Empty` composition the pages use: that one carries a centred media block
 * and `md:p-12`, which is right for a page that has nothing else on it and would make one card three
 * times the height of the card beside it. The full `Empty` stays where a whole route is empty.
 */
export function DashboardCardEmpty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

/** The row every card's list is built from — a label on the left, a value or badge on the right. */
export function DashboardCardRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', className)}>{children}</div>;
}
