import { LoaderCircleIcon } from 'lucide-react';
import { type ComponentProps } from 'react';

import { cn } from '../lib/utils';

/**
 * Centred loading state. Defaults to filling its container — use it as a route `pendingComponent`
 * inside the app's content area; pass `className="min-h-dvh min-w-dvw"` for a full-viewport variant.
 */
function Spinner({ className, label = 'Loading...', ...props }: ComponentProps<'div'> & { label?: string }) {
  return (
    <div className={cn('flex h-full w-full flex-1 items-center justify-center p-8', className)} {...props}>
      <div className="flex flex-col items-center gap-2">
        <LoaderCircleIcon className="animate-spin" />
        {label && <span className="text-muted-foreground text-sm">{label}</span>}
      </div>
    </div>
  );
}

export { Spinner };
