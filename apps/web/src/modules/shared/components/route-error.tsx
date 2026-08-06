import { type LucideIcon, TriangleAlertIcon } from 'lucide-react';
import { type ReactNode } from 'react';

import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

/**
 * What a route renders as its `errorComponent`.
 *
 * **Every route with a loader needs one.** Without it a loader rejection — or a realtime refetch
 * that lands on a 404 because another member deleted the thing — climbs to the root boundary and
 * replaces the *entire app*, sidebar included, with "Something went wrong!". Scoped here, only the
 * pane that lost its subject says so.
 *
 * Only the title is required, because only the title is genuinely per-route. Everything else has a
 * default that is honest for the common case: a generic reason, and a reload rather than a
 * navigation, since most failures are a request that did not come back.
 */
export function RouteError({
  children,
  className,
  description = "The request didn't come back. Try again in a moment.",
  icon: Icon = TriangleAlertIcon,
  title,
}: {
  /** The way out. Defaults to a reload; pass a `Link` where somewhere else is the better answer. */
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: LucideIcon;
  /**
   * What is missing, in the user's terms. Say it specifically where a subject can genuinely vanish
   * ("This list is gone"); a generic "Couldn't load X" is right where it cannot.
   */
  title: ReactNode;
}) {
  return (
    <Empty className={cn('min-h-64', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {children ?? (
          <Button onClick={() => window.location.reload()} variant="outline">
            Reload
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}
