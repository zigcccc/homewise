import * as LabelPrimitive from '@radix-ui/react-label';
import { type ComponentProps } from 'react';

import { cn } from '../lib/utils';

function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className
      )}
      data-slot="label"
      {...props}
    />
  );
}

export { Label };
