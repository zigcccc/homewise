import { relations, sql } from 'drizzle-orm';
import { boolean, integer, numeric, pgEnum, pgTable, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { household } from './household';
import { plannedMeal } from './meal-plan';
import { store } from './store';
import { user } from './user';

/**
 * Aisle grouping for an ingredient. Deliberately shaped like a supermarket walk rather than a
 * culinary taxonomy — a shopping list sorts by this so it reads in the order you shop.
 */
export const ingredientCategoryEnum = pgEnum('ingredientCategory', [
  'produce',
  'meat_fish',
  'dairy_eggs',
  'bakery',
  'pantry',
  'frozen',
  'spices',
  'drinks',
  'household',
  'other',
]);

/**
 * A closed set, not free text: shopping lists will sum quantities across recipes, and that only
 * works if "tbsp" is one value. NULL on a row means "to taste" / no meaningful unit.
 */
export const measurementUnitEnum = pgEnum('measurementUnit', [
  'g',
  'kg',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'piece',
  'slice',
  'clove',
  'pinch',
  'can',
  'pack',
  'bunch',
]);

export const mealTypeEnum = pgEnum('mealType', [
  'breakfast',
  'lunch',
  'dinner',
  'dessert',
  'snack',
  'drink',
  'side',
  'baking',
]);

/**
 * A standalone, reusable household ingredient — the pantry vocabulary, not owned by any one recipe.
 * Recipes attach ingredients through `recipe_ingredient`; shopping lists and meal plans will reuse
 * the same rows.
 *
 * Unlike `contact`, duplicates are forbidden: "Onion" and "onion" as two rows would silently split
 * a shopping list into two entries, which is the whole thing this table exists to prevent.
 */
export const ingredient = pgTable(
  'ingredient',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: ingredientCategoryEnum().notNull().default('other'),
    /** Pre-fills the unit when this ingredient is added to a recipe. */
    defaultUnit: measurementUnitEnum(),
    /**
     * Where this is usually bought. Decides which section of a shopping list it lands in; NULL
     * leaves it ungrouped. `set null` because deleting a shop should clear a default, not block it.
     */
    storeId: integer('store_id').references(() => store.id, { onDelete: 'set null' }),
    notes: text('notes'),
  },
  (table) => [
    // Case-insensitive: a unique() on the raw column would let "Onion"/"onion" both through.
    uniqueIndex('ingredient_household_name_unique').on(table.householdId, sql`lower(${table.name})`),
  ]
);

export const recipe = pgTable('recipe', {
  ...baseDbEntityFields,
  householdId: integer('household_id')
    .notNull()
    .references(() => household.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  mealType: mealTypeEnum(),
  /** Free text — the tail of world cuisines is far too long for an enum. */
  cuisine: text('cuisine'),
  servings: integer('servings'),
  prepTimeMinutes: integer('prep_time_minutes'),
  cookTimeMinutes: integer('cook_time_minutes'),
  /** Where it came from: "Grandma's notebook", "Ottolenghi p.42", a blog name. */
  sourceName: text('source_name'),
  sourceUrl: text('source_url'),
  isFavorite: boolean('is_favorite').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
});

/**
 * One line of a recipe's ingredient list.
 *
 * `ingredientId` is `restrict`, not `cascade`: deleting "flour" must not silently gut every recipe
 * that used it. The service checks usage first and returns a 409 naming the count; this is the
 * database-level backstop for that.
 *
 * There is deliberately no unique on `(recipeId, ingredientId)` — butter legitimately appears in
 * both the dough section and the sauce section of the same recipe.
 */
export const recipeIngredient = pgTable('recipe_ingredient', {
  ...baseDbEntityFields,
  recipeId: integer('recipe_id')
    .notNull()
    .references(() => recipe.id, { onDelete: 'cascade' }),
  ingredientId: integer('ingredient_id')
    .notNull()
    .references(() => ingredient.id, { onDelete: 'restrict' }),
  /** NULL means "to taste". `mode: 'number'` — drizzle returns numeric as a string otherwise. */
  quantity: numeric('quantity', { precision: 10, scale: 3, mode: 'number' }),
  unit: measurementUnitEnum(),
  /** Preparation applied to this line: "finely chopped", "at room temperature". */
  note: text('note'),
  /** Optional heading this line sits under: "For the dough", "For the sauce". */
  section: text('section'),
  position: integer('position').notNull(),
});

/**
 * One numbered step of the method. Steps are replace-all on save (delete + reinsert in a
 * transaction, like `contact_link`), so `position` needs no unique constraint — that would only add
 * reorder friction without buying uniqueness the write pattern doesn't already guarantee.
 */
export const recipeStep = pgTable('recipe_step', {
  ...baseDbEntityFields,
  recipeId: integer('recipe_id')
    .notNull()
    .references(() => recipe.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  instruction: text('instruction').notNull(),
});

/** Free-form household labels ("quick", "kid-approved"), created by name from the recipe form. */
export const recipeTag = pgTable(
  'recipe_tag',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (table) => [uniqueIndex('recipe_tag_household_name_unique').on(table.householdId, sql`lower(${table.name})`)]
);

/** Cascades on both sides — unlike an ingredient, a tag has no data behind it worth protecting. */
export const recipeTagLink = pgTable(
  'recipe_tag_link',
  {
    ...baseDbEntityFields,
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => recipeTag.id, { onDelete: 'cascade' }),
  },
  (table) => [unique('recipe_tag_link_unique').on(table.recipeId, table.tagId)]
);

export const ingredientRelations = relations(ingredient, ({ many, one }) => ({
  household: one(household, { fields: [ingredient.householdId], references: [household.id] }),
  /** Every recipe line that references this ingredient. */
  recipeLinks: many(recipeIngredient),
  /** Where it's usually bought. Survives the shop's deletion as NULL. */
  store: one(store, { fields: [ingredient.storeId], references: [store.id] }),
}));

export const recipeRelations = relations(recipe, ({ many, one }) => ({
  /** Who added the recipe. Survives their account deletion as NULL. */
  creator: one(user, { fields: [recipe.createdBy], references: [user.id] }),
  household: one(household, { fields: [recipe.householdId], references: [household.id] }),
  ingredients: many(recipeIngredient),
  /** Every day this recipe is planned for. Nulled (and title-tombstoned) when the recipe is deleted. */
  plannedMeals: many(plannedMeal),
  steps: many(recipeStep),
  tagLinks: many(recipeTagLink),
}));

export const recipeIngredientRelations = relations(recipeIngredient, ({ one }) => ({
  ingredient: one(ingredient, { fields: [recipeIngredient.ingredientId], references: [ingredient.id] }),
  recipe: one(recipe, { fields: [recipeIngredient.recipeId], references: [recipe.id] }),
}));

export const recipeStepRelations = relations(recipeStep, ({ one }) => ({
  recipe: one(recipe, { fields: [recipeStep.recipeId], references: [recipe.id] }),
}));

export const recipeTagRelations = relations(recipeTag, ({ many, one }) => ({
  household: one(household, { fields: [recipeTag.householdId], references: [household.id] }),
  recipeLinks: many(recipeTagLink),
}));

export const recipeTagLinkRelations = relations(recipeTagLink, ({ one }) => ({
  recipe: one(recipe, { fields: [recipeTagLink.recipeId], references: [recipe.id] }),
  tag: one(recipeTag, { fields: [recipeTagLink.tagId], references: [recipeTag.id] }),
}));
