import { ImageIcon } from 'lucide-react';
import { type ComponentProps, type ReactNode } from 'react';

import { cn } from '../lib/utils';

/**
 * A small square picture with something to show when there isn't one.
 *
 * The fallback is the *common* case for most lists — the majority of records never get a photo — so
 * it has to read as deliberate rather than as a picture that failed to load. That's the whole reason
 * this is a component and not an `<img>` with an `onError`: the empty state is the design, not an
 * accident, and every list that shows pictures needs the same one.
 *
 * `alt` is required rather than defaulted: an `<img>` with no alternative text in a table of records
 * is a real gap for a screen reader, and a silent `''` would hide it. A thumbnail that genuinely adds
 * nothing beside the name next to it says so by passing `alt=""`.
 */
function Thumbnail({
  alt,
  className,
  fallback = <ImageIcon className="size-4" />,
  src,
  ...props
}: Omit<ComponentProps<'img'>, 'alt' | 'src'> & { alt: string; fallback?: ReactNode; src?: string | null }) {
  if (!src) {
    return (
      <div
        aria-hidden
        className={cn('flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground', className)}
        data-slot="thumbnail-fallback"
      >
        {fallback}
      </div>
    );
  }

  return (
    <img
      alt={alt}
      className={cn('size-10 rounded-md border object-cover', className)}
      data-slot="thumbnail"
      src={src}
      {...props}
    />
  );
}

export { Thumbnail };
