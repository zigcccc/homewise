import { type ComponentProps } from 'react';

/**
 * An anchor to somewhere outside the app. Exists so `target`/`rel` are decided once: a `_blank` link
 * without `noopener` hands the opened page a live `window.opener` reference back into ours.
 *
 * Both are settled here and can't be reopened — `rel`/`target` are omitted from the props, and the
 * spread comes first so passing them anyway (`rel="opener"` as an untyped prop) still can't win.
 */
export function ExternalLink({ children, ...props }: Omit<ComponentProps<'a'>, 'rel' | 'target'>) {
  return (
    <a {...props} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}
