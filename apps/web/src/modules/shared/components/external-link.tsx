import { type ComponentProps } from 'react';

/**
 * An anchor to somewhere outside the app. Exists so `target`/`rel` are decided once: a `_blank` link
 * without `noopener` hands the opened page a live `window.opener` reference back into ours.
 */
export function ExternalLink({ children, ...props }: ComponentProps<'a'>) {
  return (
    <a rel="noopener noreferrer" target="_blank" {...props}>
      {children}
    </a>
  );
}
