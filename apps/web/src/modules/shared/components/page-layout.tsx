import { type ComponentProps } from 'react';

import { cn } from '@homewise/ui/lib';

/**
 * The `<main>` every page renders into.
 *
 * `flex-1` is load-bearing — a page sits directly inside an unconstrained `SidebarInset` and has to
 * claim the height itself — and the padding is all that stands between the content and the viewport
 * edge. Neither is visible from a route file, which is how they drifted in the first place.
 *
 * Width is deliberately *not* capped here: that belongs on the block which would otherwise stretch
 * (`lg:max-w-2/3`), never on the page. The vertical rhythm is the one thing a page overrides —
 * `className="space-y-4"` for the denser pages.
 */
export function PageLayout({ className, ...props }: ComponentProps<'main'>) {
  return <main className={cn('flex-1 space-y-6 p-4', className)} {...props} />;
}
