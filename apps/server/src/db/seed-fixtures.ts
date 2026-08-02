/**
 * Deterministic seed fixtures — the single source of truth for the known data
 * the seed (`seed.ts`) writes and the e2e suite asserts against.
 *
 * Both the seed script and `@homewise/e2e` import from here (the server exposes
 * it via the `./seed-fixtures` package export), so credentials and names can
 * never drift between what's seeded and what the tests expect.
 */

export const SEED_USER = {
  email: 'preview@home-wise.app',
  name: 'Preview User',
  // Deterministic dev credential — previews and the local test DB are throwaway,
  // isolated databases.
  password: 'PreviewPassword123!',
} as const;

export const SEED_HOUSEHOLD_NAME = 'Preview Household';

/**
 * A second real account user, seeded as a non-owner `adult` member of the seed
 * household. The e2e suite needs a second account-linked member to exercise the
 * owner-only flows that a single account can't reach on its own — transferring
 * ownership and changing an account member's role.
 */
export const SEED_SECOND_USER = {
  email: 'preview.second@home-wise.app',
  name: 'Second User',
  password: 'PreviewPassword123!',
} as const;

/**
 * A real account user seeded with NO household and NO membership, so the e2e
 * suite can drive the onboarding flow (create-household) from a clean slate.
 * The onboarding spec owns this user's household state end-to-end (creates then
 * deletes), so reruns start clean.
 */
export const SEED_ONBOARDING_USER = {
  email: 'preview.onboarding@home-wise.app',
  name: 'Onboarding User',
  password: 'PreviewPassword123!',
} as const;

/** The non-user (managed child) member seeded into the household. */
export const SEED_CHILD_MEMBER = {
  name: 'Robin',
  nickname: 'Robbie',
} as const;

/**
 * Pantry staples seeded into the household's ingredient library. A brand-new household would
 * otherwise open the recipe form to an empty ingredient picker, which reads as broken; the e2e suite
 * also needs known ingredients it can attach to a recipe without creating any first.
 */
export const SEED_INGREDIENTS = [
  { name: 'Onion', category: 'produce', defaultUnit: 'piece' },
  { name: 'Garlic', category: 'produce', defaultUnit: 'clove' },
  { name: 'Olive oil', category: 'pantry', defaultUnit: 'tbsp' },
  { name: 'Flour', category: 'pantry', defaultUnit: 'g' },
  { name: 'Eggs', category: 'dairy_eggs', defaultUnit: 'piece' },
  { name: 'Butter', category: 'dairy_eggs', defaultUnit: 'g' },
  { name: 'Salt', category: 'spices', defaultUnit: 'tsp' },
  { name: 'Black pepper', category: 'spices', defaultUnit: 'tsp' },
] as const;

/**
 * One complete recipe, so the list, the detail read view and search-by-ingredient all have known
 * data to assert against. The e2e suite only ever *reads* this one — specs that mutate create their
 * own uniquely-named recipe.
 */
export const SEED_RECIPE = {
  title: 'Garlic Butter Pasta',
  description: 'The weeknight fallback — on the table in fifteen minutes.',
  mealType: 'dinner',
  cuisine: 'Italian',
  servings: 4,
  prepTimeMinutes: 5,
  cookTimeMinutes: 10,
  sourceName: 'Family notebook',
  /** Ingredient names, resolved against SEED_INGREDIENTS when seeding. */
  ingredients: [
    { name: 'Garlic', quantity: 4, unit: 'clove', note: 'thinly sliced' },
    { name: 'Butter', quantity: 60, unit: 'g', note: null },
    { name: 'Olive oil', quantity: 2, unit: 'tbsp', note: null },
    { name: 'Salt', quantity: null, unit: null, note: 'to taste' },
  ],
  steps: [
    'Boil the pasta in well-salted water until al dente.',
    'Melt the butter with the olive oil over low heat and add the garlic.',
    'Toss the drained pasta through the garlic butter and season.',
  ],
  tags: ['quick', 'weeknight'],
} as const;

/**
 * A small planned week, so a preview environment opens the meal plan on something rather than seven
 * empty cards.
 *
 * Days are **offsets from the current ISO-week Monday, resolved at seed time** — never literal dates.
 * A hard-coded `2026-08-03` would be in the past by the following week, leaving the default view
 * blank again and any assertion about it meaningless.
 *
 * The e2e suite plans its own meals on far-future weeks, so nothing here is mutated by a test.
 */
export const SEED_MEAL_PLAN = {
  meals: [
    /** Monday: the seeded recipe, for the whole household. */
    { dayOffset: 0, recipeTitle: SEED_RECIPE.title, memberNames: [] },
    /** Wednesday: free text for one person — the "I'm eating at work" case. */
    { dayOffset: 2, title: 'At work', memberNames: [SEED_USER.name] },
  ],
  notes: [{ dayOffset: 5, note: 'Picnic — 8 adults, 2 children' }],
} as const;
