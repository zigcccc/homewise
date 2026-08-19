import { redirect } from '@tanstack/react-router';

import { type HouseholdMemberRole } from '@homewise/server/households';
import { can, type PermissionArea } from '@homewise/server/permissions';

/**
 * `beforeLoad` for a route that only exists to write — a create form, an edit form, an import.
 *
 * The sections a member may *see* are guarded centrally off `NAV_GROUPS`; these three have nothing to
 * read, so they get the one line here instead of an entry there. Forgetting it on a new one costs a
 * 403 and the route's error component, never access.
 */
export const requireWrite =
  (area: PermissionArea) =>
  ({ context }: { context: { role: HouseholdMemberRole } }) => {
    if (!can(context.role, area, 'write')) {
      throw redirect({ to: '/' });
    }
  };
