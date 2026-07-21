import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import { type HouseholdSummary, HouseholdsService } from '@/modules/households/households.service';
import { type AppContext } from '@/types/app.type';

export type HouseholdContext = {
  Variables: AppContext['Variables'] & { household: HouseholdSummary };
};

/**
 * Resolves the caller's household once per request and puts it on the context, so handlers can read
 * `c.var.household` instead of repeating a lookup + 404 check. Mount it on household-scoped sub-apps
 * only — routes that must work without a household (creating one, reading/accepting an invite) stay
 * outside of it.
 */
export const withHousehold = createMiddleware<HouseholdContext>(async (c, next) => {
  const household = await HouseholdsService.readSummaryForUser(c.var.user.id);

  if (!household) {
    throw new HTTPException(404, { message: 'Household not found' });
  }

  c.set('household', household);

  return next();
});

/** Guards owner-only actions. Must run after {@link withHousehold}. */
export const withHouseholdOwner = createMiddleware<HouseholdContext>(async (c, next) => {
  if (c.var.household.ownerId !== c.var.user.id) {
    throw new HTTPException(403, { message: 'Only household owners can perform this action.' });
  }

  return next();
});
