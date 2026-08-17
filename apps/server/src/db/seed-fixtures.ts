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

/**
 * The three accounts for one seeded household, addressed by slot.
 *
 * The e2e suite seeds one household per Playwright worker so parallel specs stop mutating each
 * other's rows, and a slot is one of those. Only the **emails** vary — every name stays identical
 * across slots, because names are household-scoped in the database and the specs assert on them.
 *
 * Slot 0 keeps the bare addresses, so a preview or a plain `db:seed` is exactly what it always was.
 */
export function seedAccounts(slot: number) {
  const at = (email: string) => (slot === 0 ? email : email.replace('@', `+w${slot}@`));

  return {
    user: { ...SEED_USER, email: at(SEED_USER.email) },
    secondUser: { ...SEED_SECOND_USER, email: at(SEED_SECOND_USER.email) },
    onboardingUser: { ...SEED_ONBOARDING_USER, email: at(SEED_ONBOARDING_USER.email) },
  };
}

/** The non-user (managed child) member seeded into the household. */
export const SEED_CHILD_MEMBER = {
  name: 'Robin',
  nickname: 'Robbie',
} as const;

/**
 * The shops the seeded household buys at. Two of them, so the e2e suite can prove a shopping list
 * splits into one section per shop rather than merging everything into one.
 */
export const SEED_STORES = [{ name: 'Spar' }, { name: 'Hofer' }] as const;

/**
 * Pantry staples seeded into the household's ingredient library. A brand-new household would
 * otherwise open the recipe form to an empty ingredient picker, which reads as broken; the e2e suite
 * also needs known ingredients it can attach to a recipe without creating any first.
 *
 * `store` names one of `SEED_STORES`, resolved at seed time. Some are deliberately left without
 * one — an ingredient with no shop is the ungrouped case a shopping list also has to handle.
 */
export const SEED_INGREDIENTS = [
  { name: 'Onion', category: 'produce', defaultUnit: 'piece', store: 'Spar' },
  { name: 'Garlic', category: 'produce', defaultUnit: 'clove', store: 'Spar' },
  { name: 'Olive oil', category: 'pantry', defaultUnit: 'tbsp', store: 'Hofer' },
  { name: 'Flour', category: 'pantry', defaultUnit: 'g', store: null },
  { name: 'Eggs', category: 'dairy_eggs', defaultUnit: 'piece', store: null },
  { name: 'Butter', category: 'dairy_eggs', defaultUnit: 'g', store: 'Hofer' },
  { name: 'Salt', category: 'spices', defaultUnit: 'tsp', store: null },
  { name: 'Black pepper', category: 'spices', defaultUnit: 'tsp', store: null },
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

/**
 * Where the seeded household keeps things. Two of them, so the e2e suite can move an item from one
 * to the other without creating either first.
 *
 * The garage carries coordinates and the cellar doesn't — those are the two states the map has to
 * render, and a seed with only pinned locations would never show the unpinned one.
 */
export const SEED_STORAGE_LOCATIONS = [
  { name: 'Garage', address: 'Slovenska cesta 1, 1000 Ljubljana', latitude: 46.051389, longitude: 14.506111 },
  { name: 'Cellar', address: null, latitude: null, longitude: null },
] as const;

/**
 * The contact the seeded loan is lent to. A borrower is a household contact, so a preview environment
 * opens the lend dialog on an address book with something in it.
 *
 * `birthdayOffsetDays` is **resolved against today at seed time**, like the loan dates below and the
 * meal plan's week offsets — a literal birth date would drift out of the dashboard's window and leave
 * the birthdays card permanently empty in every preview. Only the month and day come from the offset;
 * the seed backdates the year, since a birth date in the future is not a birthday anyone is having.
 */
export const SEED_STORAGE_CONTACT = {
  name: 'Ana Novak',
  type: 'other',
  phone: '+386 40 123 456',
  birthdayOffsetDays: 10,
} as const;

/**
 * What's in the seeded locations. One item is out on loan and one is overdue, because "available",
 * "on loan" and "overdue" are three filters and a seed showing only the first proves none of them.
 *
 * `dueOffsetDays` is **resolved against today at seed time** — never a literal date, for the same
 * reason `SEED_MEAL_PLAN` uses week offsets: a hard-coded date stops being overdue-or-not the moment
 * it passes, and the assertion about it stops meaning anything.
 *
 * The e2e suite creates its own uniquely-named items and only ever *reads* these.
 */
export const SEED_STORAGE_ITEMS = [
  { name: 'Winter tyres', location: 'Garage', notes: 'Set of four, 205/55 R16.', quantity: 4, loan: null },
  { name: 'Christmas decorations', location: 'Cellar', notes: null, quantity: 2, loan: null },
  {
    name: 'Cordless drill',
    location: 'Garage',
    notes: null,
    quantity: 1,
    loan: { borrowedOffsetDays: -14, dueOffsetDays: 7 },
  },
  {
    name: 'Camping tent',
    location: 'Cellar',
    notes: 'Four-person, poles in the side pocket.',
    quantity: 1,
    /** Already past its due date — the overdue filter needs a row it can find. */
    loan: { borrowedOffsetDays: -60, dueOffsetDays: -5 },
  },
] as const;

/**
 * The categories the seeded household files its spending under. Two of them, so the monthly breakdown
 * has more than one slice to draw and the picker opens on something.
 */
export const SEED_EXPENSE_CATEGORIES = [{ name: 'Groceries' }, { name: 'Utilities' }] as const;

/**
 * A handful of expenses in the current month, so a preview environment opens the page on real numbers
 * rather than an empty table with a zero total.
 *
 * `dayOfMonth` is **resolved against the current month at seed time** — never a literal date, for the
 * same reason `SEED_MEAL_PLAN` uses week offsets. The page opens on today's month, so a hard-coded
 * `2026-08-03` would leave that view blank the following month and make any assertion about it
 * meaningless. It is clamped to the month's length, so 31 is safe in February.
 *
 * The e2e suite logs its own expenses in far-future months and only ever *reads* these — the monthly
 * total is a shared aggregate, so a spec that wrote here would race every other worker.
 */
/**
 * A few logged changes, so the feed and the card open on something real. Written directly, because
 * the log is written by `withHousehold` and the seed talks to the database rather than the API.
 *
 * `hoursAgo` is resolved at seed time, so the feed always spans more than one day heading.
 */
export const SEED_ACTIVITY = [
  { actor: 'owner', entity: 'contact', operation: 'create', label: 'Ana Novak', hoursAgo: 2, count: 1, changes: [] },
  {
    actor: 'second',
    entity: 'shopping_list',
    operation: 'update',
    label: 'Weekly shop',
    hoursAgo: 5,
    count: 1,
    changes: [{ field: 'name', from: 'Shopping list', to: 'Weekly shop' }],
  },
  { actor: 'owner', entity: 'expense', operation: 'create', label: 'Electricity', hoursAgo: 9, count: 1, changes: [] },
  {
    actor: 'second',
    entity: 'recipe',
    operation: 'update',
    label: 'Garlic Butter Pasta',
    hoursAgo: 27,
    count: 3,
    // A folded run, stored the way one is written: every edit in order, one field moved twice. The
    // feed collapses it to "Cook time minutes 30 → 45".
    changes: [
      { field: 'cookTimeMinutes', from: 30, to: 40 },
      { field: 'servings', from: 4, to: 6 },
      { field: 'cookTimeMinutes', from: 40, to: 45 },
    ],
  },
  {
    actor: 'owner',
    entity: 'storage_item',
    operation: 'update',
    label: 'Drill',
    hoursAgo: 32,
    count: 1,
    changes: [{ field: 'borrowedByName', from: null, to: 'Ana Novak' }],
  },
  {
    actor: 'owner',
    entity: 'child_profile',
    operation: 'create',
    label: 'Robbie',
    hoursAgo: 74,
    count: 1,
    changes: [],
  },
] as const;

export const SEED_EXPENSES = [
  { title: 'Weekly shop', amount: 87.4, category: 'Groceries', dayOfMonth: 3, paidBack: false },
  { title: 'Electricity', amount: 62.15, category: 'Utilities', dayOfMonth: 8, paidBack: false },
  /** Uncategorised — the default state, and the one the breakdown has to render as its own slice. */
  { title: 'Parking', amount: 4.2, category: null, dayOfMonth: 11, paidBack: false },
  /** Bought and returned: the total must exclude it while the row stays on the table. */
  { title: 'Returned kettle', amount: 39.99, category: null, dayOfMonth: 12, paidBack: true },
] as const;
