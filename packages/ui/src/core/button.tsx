import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircleIcon } from 'lucide-react';
import { type ComponentProps } from 'react';

import { cn } from '../lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all not-disabled:hover:cursor-pointer focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 disabled:hover:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground not-disabled:hover:bg-primary/90',
        destructive:
          'bg-destructive text-white not-disabled:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
        outline:
          'border bg-background shadow-xs not-disabled:hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground not-disabled:hover:bg-secondary/80',
        ghost: 'not-disabled:hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 not-disabled:hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type Props = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

function Button({ children, className, variant, disabled, loading = false, size, asChild = false, ...props }: Props) {
  if (asChild) {
    return (
      <Slot
        aria-disabled={disabled}
        className={cn(buttonVariants({ variant, size, className }))}
        data-slot="button"
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={cn('relative', buttonVariants({ variant, size, className }))}
      data-slot="button"
      disabled={disabled || loading}
      {...props}
    >
      {loading && !asChild && (
        <span className="absolute inset-0 flex items-center justify-center">
          <LoaderCircleIcon className="animate-spin text-gray-400" />
        </span>
      )}
      <span className={cn('inline-flex items-center gap-2', loading ? 'invisible' : 'visible')}>{children}</span>
    </button>
  );
}

export { Button, buttonVariants };
