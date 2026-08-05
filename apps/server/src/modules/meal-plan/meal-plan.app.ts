import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import {
  createPlannedMealModel,
  mealPlanDayPathParamsModel,
  mealPlanRangeQueryParamsModel,
  patchPlannedMealModel,
  plannedMealPathParamsModel,
  putDayNoteModel,
} from './meal-plan.model';
import { MealPlanService } from './meal-plan.service';

/**
 * The household's meal plan. Fully collaborative — planning lunch is a two-person job.
 *
 * `/meals` and `/days` are both static prefixes, so the registration-order trap documented in
 * `recipes.app.ts` doesn't apply here: nothing sits at the same depth as a numeric `:id`.
 *
 * Every mutation emits a single `meal_plan` event. The client caches the whole window under one
 * range key, so a finer-grained entity (a separate one for day notes, say) would map to a
 * byte-identical invalidation.
 */
const mealPlanApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', zValidator('query', mealPlanRangeQueryParamsModel), async (c) => {
    const range = await MealPlanService.listRange(c.var.household.id, c.req.valid('query'));

    return c.json(range, 200);
  })
  .post('/meals', zValidator('json', createPlannedMealModel), async (c) => {
    const { household, user } = c.var;
    const meal = await MealPlanService.createMeal(household.id, c.req.valid('json'), user.id);

    c.var.emit({ entity: 'meal_plan', id: meal.id, operation: 'create' });

    return c.json(meal, 201);
  })
  .patch(
    '/meals/:id',
    zValidator('param', plannedMealPathParamsModel),
    zValidator('json', patchPlannedMealModel),
    async (c) => {
      const meal = await MealPlanService.patchMeal(c.var.household.id, c.req.valid('param').id, c.req.valid('json'));

      c.var.emit({ entity: 'meal_plan', id: meal.id, operation: 'update' });

      return c.json(meal, 200);
    }
  )
  .delete('/meals/:id', zValidator('param', plannedMealPathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    await MealPlanService.deleteMeal(c.var.household.id, id);

    c.var.emit({ entity: 'meal_plan', id, operation: 'delete' });

    return c.json({ success: true }, 202);
  })
  .put(
    '/days/:day',
    zValidator('param', mealPlanDayPathParamsModel),
    zValidator('json', putDayNoteModel),
    async (c) => {
      const saved = await MealPlanService.putDayNote(
        c.var.household.id,
        c.req.valid('param').day,
        c.req.valid('json').note
      );

      // A day note has no id worth sending — its key is a date, which is what `id: null` is for.
      c.var.emit({ entity: 'meal_plan', id: null, operation: 'update' });

      return c.json(saved, 200);
    }
  );

export default mealPlanApp;
