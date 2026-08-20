import { type ReactNode } from 'react';

import { type PermissionAccess, type PermissionArea } from '@homewise/server/permissions';

import { useCan } from '../hooks/use-can';

/**
 * Renders its children only when the current member may do `access` on `area`.
 *
 * Hiding rather than disabling is deliberate for whole controls: a row of greyed-out buttons is noise
 * to someone who can never use them, and a disabled `DropdownMenuItem` wrapped in a tooltip trigger
 * swallows its own click. Use `disabled` only where the control still says something in place, like a
 * form field showing a value.
 */
export function Can({
  access,
  area,
  children,
  fallback = null,
}: {
  access: PermissionAccess;
  area: PermissionArea;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useCan(area, access) ? children : fallback;
}
