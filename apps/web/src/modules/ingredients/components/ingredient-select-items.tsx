import { ingredientCategory, measurementUnit } from '@homewise/server/ingredients';
import { SelectItem } from '@homewise/ui/core';

import { SELECT_NONE } from '@/modules/shared';

import { ingredientCategoryLabels, measurementUnitLabels } from '../helpers';

/** The full category list, for any `SelectContent` that picks an ingredient category. */
export function IngredientCategorySelectItems() {
  return ingredientCategory.options.map((option) => (
    <SelectItem key={option} value={option}>
      {ingredientCategoryLabels[option]}
    </SelectItem>
  ));
}

/**
 * The full unit list. `noneLabel` adds the "no unit" option on top — the wording differs by context
 * ("None" in the ingredient form, "—" where the value sits in a table), so the caller supplies it.
 * Omitting it leaves the unit required.
 */
export function MeasurementUnitSelectItems({ noneLabel }: { noneLabel?: string }) {
  return (
    <>
      {noneLabel !== undefined && <SelectItem value={SELECT_NONE}>{noneLabel}</SelectItem>}
      {measurementUnit.options.map((option) => (
        <SelectItem key={option} value={option}>
          {measurementUnitLabels[option]}
        </SelectItem>
      ))}
    </>
  );
}
