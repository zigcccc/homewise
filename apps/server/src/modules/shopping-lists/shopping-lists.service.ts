import { and, asc, count, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';
import { type Executor, emptyToNull, isUniqueViolation } from '@/db/utils';
import { addDays, todayISO } from '@/lib/dates';
import { type Amount, formatAmount, sumAmounts } from '@/modules/ingredients/units';
import { MAX_RANGE_DAYS } from '@/modules/meal-plan/models';

import {
  type CompleteShoppingList,
  type CreateItem,
  type CreateSection,
  type CreateShoppingList,
  IMPORT_DEFAULT_DAYS,
  type ImportFromMealPlan,
  type ListShoppingListsQueryParams,
  type MealPlanPreviewQueryParams,
  type PatchItem,
  type PatchSection,
  type PatchShoppingList,
  UNTITLED_LIST_LABEL,
} from './models';

const listNotFound = () => new HTTPException(404, { message: 'Shopping list not found' });
const sectionNotFound = () => new HTTPException(404, { message: 'Section not found' });
const itemNotFound = () => new HTTPException(404, { message: 'Item not found' });

/** Appending is "place me past everyone", resolved by the clamp in `resequence`. */
const APPEND = Number.MAX_SAFE_INTEGER;

const sectionWith = { with: { store: { columns: { id: true, name: true } } } } as const;
const itemWith = {
  with: {
    checker: { columns: { id: true, name: true } },
    ingredient: { columns: { id: true, name: true } },
  },
} as const;

type SectionRow = { name: string | null; store: { id: number; name: string } | null };

/**
 * The household's shopping lists — what to buy, split by where you buy it, ticked off as it goes in
 * the basket.
 *
 * A list is a thin parent: its sections and items carry everything, and its own label is usually
 * inferred rather than stored.
 */
export class ShoppingListsService {
  /** Resolves a list, scoped to its household so ids from elsewhere 404. */
  private static async readListRow(householdId: number, listId: number, executor: Executor = db) {
    const [list] = await executor
      .select()
      .from(schema.shoppingList)
      .where(and(eq(schema.shoppingList.householdId, householdId), eq(schema.shoppingList.id, listId)))
      .limit(1);

    if (!list) {
      throw listNotFound();
    }

    return list;
  }

  /**
   * A section's heading: the live shop name, or the free text, or the tombstone left behind when the
   * shop was deleted. Mirrors how a planned meal derives its label from recipe-or-title.
   */
  private static sectionLabel(section: SectionRow) {
    return section.store?.name ?? section.name ?? 'Section';
  }

  /**
   * What a list is called when nobody named it: the shops it covers, which is how you actually think
   * about a trip. Computed here rather than on the client so the master list and the detail can't
   * disagree about what the same list is called.
   */
  private static inferLabel(name: string | null, sectionLabels: string[]) {
    if (name) {
      return name;
    }

    const [first, second, ...rest] = sectionLabels;

    if (!first) {
      return UNTITLED_LIST_LABEL;
    }
    if (!second) {
      return first;
    }
    if (rest.length === 0) {
      return `${first}, ${second}`;
    }

    return `${first}, ${second}, and ${rest.length} other${rest.length === 1 ? '' : 's'}`;
  }

  /**
   * Renumbers one section's items to `0..n-1`, optionally splicing an item in at a given index.
   *
   * One routine covers appending on create and moving between sections — the item's `sectionId` must
   * already be updated when this runs, and the `ne(id)` exclusion is what stops it being counted
   * twice in its new section. `sectionId` is nullable because ungrouped items are a section too, just
   * an implicit one.
   *
   * A section holds a handful of items, so N single-row updates cost nothing; concurrent edits are
   * last-write-wins, reconciled by the realtime invalidation that follows.
   */
  private static async resequence(
    executor: Executor,
    listId: number,
    sectionId: number | null,
    place?: { index: number; itemId: number }
  ) {
    const siblings = await executor
      .select({ id: schema.shoppingListItem.id })
      .from(schema.shoppingListItem)
      .where(
        and(
          eq(schema.shoppingListItem.shoppingListId, listId),
          sectionId === null
            ? isNull(schema.shoppingListItem.sectionId)
            : eq(schema.shoppingListItem.sectionId, sectionId),
          place ? ne(schema.shoppingListItem.id, place.itemId) : undefined
        )
      )
      .orderBy(asc(schema.shoppingListItem.position), asc(schema.shoppingListItem.id));

    const ids = siblings.map((row) => row.id);

    if (place) {
      ids.splice(Math.min(Math.max(place.index, 0), ids.length), 0, place.itemId);
    }

    for (const [index, id] of ids.entries()) {
      await executor.update(schema.shoppingListItem).set({ position: index }).where(eq(schema.shoppingListItem.id, id));
    }
  }

  /**
   * The section an ingredient belongs in: the one for its shop, created if this list doesn't have it
   * yet. Returns `null` when the ingredient has no shop, which leaves the item ungrouped.
   *
   * This is what makes a list assemble itself — adding "Onion" to an empty list produces a Spar
   * heading with an onion under it, without the user ever thinking about sections.
   */
  private static async resolveSection(executor: Executor, listId: number, ingredientId: number) {
    const [ingredient] = await executor
      .select({ storeId: schema.ingredient.storeId })
      .from(schema.ingredient)
      .where(eq(schema.ingredient.id, ingredientId))
      .limit(1);

    const storeId = ingredient?.storeId;

    if (!storeId) {
      return null;
    }

    const readSection = async () =>
      executor
        .select({ id: schema.shoppingListSection.id })
        .from(schema.shoppingListSection)
        .where(
          and(eq(schema.shoppingListSection.shoppingListId, listId), eq(schema.shoppingListSection.storeId, storeId))
        )
        .limit(1);

    const [existing] = await readSection();

    if (existing) {
      return existing.id;
    }

    const [nextPosition] = await executor
      .select({ value: count() })
      .from(schema.shoppingListSection)
      .where(eq(schema.shoppingListSection.shoppingListId, listId));

    // onConflictDoNothing covers two ingredients from the same shop being added at once; the re-read
    // picks up whichever insert won, so they land under one heading rather than two.
    await executor
      .insert(schema.shoppingListSection)
      .values({ shoppingListId: listId, storeId, position: nextPosition?.value ?? 0 })
      .onConflictDoNothing();

    const [created] = await readSection();

    if (!created) {
      throw new HTTPException(500, { message: 'Could not resolve the shop’s section' });
    }

    return created.id;
  }

  /**
   * Drops a section once its last item has gone, so a shop heading doesn't outlive the reason it
   * appeared. `null` is the ungrouped bucket, which isn't a row and can't be pruned.
   *
   * Only ever called from the paths where an item *leaves* a section — never from `createSection`,
   * where a section is empty by definition and would delete itself the instant it was made.
   */
  private static async pruneSectionIfEmpty(executor: Executor, sectionId: number | null) {
    if (sectionId === null) {
      return;
    }

    const [remaining] = await executor
      .select({ value: count() })
      .from(schema.shoppingListItem)
      .where(eq(schema.shoppingListItem.sectionId, sectionId));

    if ((remaining?.value ?? 0) === 0) {
      await executor.delete(schema.shoppingListSection).where(eq(schema.shoppingListSection.id, sectionId));
    }
  }

  /** Confirms a section belongs to this list, so an id from another list can't be written into it. */
  private static async assertSectionInList(executor: Executor, listId: number, sectionId: number | null | undefined) {
    if (sectionId === null || sectionId === undefined) {
      return sectionId;
    }

    const [section] = await executor
      .select({ id: schema.shoppingListSection.id })
      .from(schema.shoppingListSection)
      .where(and(eq(schema.shoppingListSection.id, sectionId), eq(schema.shoppingListSection.shoppingListId, listId)))
      .limit(1);

    if (!section) {
      throw sectionNotFound();
    }

    return sectionId;
  }

  /**
   * Copies a shop's name onto the sections that stand for it, so they keep a heading once the shop is
   * gone. Runs inside `StoresService.delete`'s transaction, before the FK nulls the link — the check
   * constraint makes the delete fail otherwise, which is what stops this being forgotten.
   */
  public static async detachStore(executor: Executor, storeId: number, name: string) {
    await executor
      .update(schema.shoppingListSection)
      .set({ name })
      .where(and(eq(schema.shoppingListSection.storeId, storeId), isNull(schema.shoppingListSection.name)));
  }

  /** The same tombstone for an ingredient: a list keeps the line, it just stops being a library row. */
  public static async detachIngredient(executor: Executor, ingredientId: number, name: string) {
    await executor
      .update(schema.shoppingListItem)
      .set({ title: name })
      .where(and(eq(schema.shoppingListItem.ingredientId, ingredientId), isNull(schema.shoppingListItem.title)));
  }

  /**
   * Every list, active first and newest first within each. Carries the counts the master column shows
   * ("3 of 12") and the inferred label, so listing never has to read a list's items.
   */
  public static async list(householdId: number, { includeCompleted }: ListShoppingListsQueryParams) {
    const lists = await db.query.shoppingList.findMany({
      where: (fields, { and, eq, isNull }) =>
        and(eq(fields.householdId, householdId), includeCompleted ? undefined : isNull(fields.completedAt)),
      // Newest first, shopped or not — "done" is a state, not a rank. `id` breaks ties so two lists
      // made in the same millisecond never flip order between reads.
      orderBy: (fields, { desc }) => [desc(fields.createdAt), desc(fields.id)],
      with: { sections: { ...sectionWith, orderBy: (fields, { asc }) => [asc(fields.position), asc(fields.id)] } },
    });

    const counts = await ShoppingListsService.countItems(lists.map((row) => row.id));

    return lists.map(({ sections, ...list }) => ({
      ...list,
      label: ShoppingListsService.inferLabel(list.name, sections.map(ShoppingListsService.sectionLabel)),
      ...(counts.get(list.id) ?? { checkedCount: 0, itemCount: 0 }),
    }));
  }

  /** Item totals per list, constrained to the ids just read rather than grouping the whole table. */
  private static async countItems(listIds: number[]) {
    if (listIds.length === 0) {
      return new Map<number, { checkedCount: number; itemCount: number }>();
    }

    const rows = await db
      .select({
        listId: schema.shoppingListItem.shoppingListId,
        itemCount: count(),
        // `count(column)` skips NULLs, so this counts exactly the ticked ones.
        checkedCount: sql<number>`count(${schema.shoppingListItem.checkedAt})::int`,
      })
      .from(schema.shoppingListItem)
      .where(inArray(schema.shoppingListItem.shoppingListId, listIds))
      .groupBy(schema.shoppingListItem.shoppingListId);

    return new Map(rows.map((row) => [row.listId, { checkedCount: row.checkedCount, itemCount: row.itemCount }]));
  }

  /**
   * One list in full.
   *
   * `sections` and `items` come back as **sibling arrays**, not items nested under sections. Nesting
   * three arrays deep is what once collapsed the meal-plan response to `any` on the web; the client
   * stitches them with a helper instead.
   */
  public static async read(householdId: number, listId: number) {
    const list = await ShoppingListsService.readListRow(householdId, listId);

    const [sections, items] = await Promise.all([
      db.query.shoppingListSection.findMany({
        where: (fields, { eq }) => eq(fields.shoppingListId, listId),
        orderBy: (fields, { asc }) => [asc(fields.position), asc(fields.id)],
        ...sectionWith,
      }),
      db.query.shoppingListItem.findMany({
        where: (fields, { eq }) => eq(fields.shoppingListId, listId),
        orderBy: (fields, { asc }) => [asc(fields.position), asc(fields.id)],
        ...itemWith,
      }),
    ]);

    return {
      ...list,
      label: ShoppingListsService.inferLabel(list.name, sections.map(ShoppingListsService.sectionLabel)),
      sections: sections.map((section) => ({
        id: section.id,
        storeId: section.storeId,
        label: ShoppingListsService.sectionLabel(section),
        position: section.position,
      })),
      items: items.map((item) => ({
        id: item.id,
        sectionId: item.sectionId,
        ingredientId: item.ingredientId,
        label: item.ingredient?.name ?? item.title ?? 'Item',
        quantity: item.quantity,
        unit: item.unit,
        note: item.note,
        position: item.position,
        checkedAt: item.checkedAt,
        checkedBy: item.checker?.name ?? null,
      })),
    };
  }

  public static async create(householdId: number, data: CreateShoppingList, userId: string) {
    const [created] = await db
      .insert(schema.shoppingList)
      .values({ householdId, name: data.name ?? null, createdBy: userId })
      .returning({ id: schema.shoppingList.id });

    if (!created) {
      throw new HTTPException(400, { message: 'Something went wrong.' });
    }

    return ShoppingListsService.read(householdId, created.id);
  }

  public static async patch(householdId: number, listId: number, data: PatchShoppingList) {
    await ShoppingListsService.readListRow(householdId, listId);

    if (data.name !== undefined) {
      await db
        .update(schema.shoppingList)
        .set({ name: data.name })
        .where(and(eq(schema.shoppingList.householdId, householdId), eq(schema.shoppingList.id, listId)));
    }

    return ShoppingListsService.read(householdId, listId);
  }

  public static async delete(householdId: number, listId: number) {
    await ShoppingListsService.readListRow(householdId, listId);

    const [deleted] = await db
      .delete(schema.shoppingList)
      .where(and(eq(schema.shoppingList.householdId, householdId), eq(schema.shoppingList.id, listId)))
      .returning();

    if (!deleted) {
      throw listNotFound();
    }

    return deleted;
  }

  /**
   * Marks a list done. With `carry-over` the still-unticked items move to a fresh list first —
   * sections rebuilt so they land under the same headings — so the forgotten half of a trip becomes
   * the start of the next one instead of disappearing with it.
   *
   * Returns the id of any list it minted, because that's where the client wants to go next.
   */
  public static async complete(householdId: number, listId: number, { unchecked }: CompleteShoppingList) {
    const list = await ShoppingListsService.readListRow(householdId, listId);

    if (list.completedAt) {
      throw new HTTPException(409, { message: 'This list is already done' });
    }

    const carriedListId = await db.transaction(async (tx) => {
      const pending =
        unchecked === 'carry-over'
          ? await tx
              .select({ id: schema.shoppingListItem.id, sectionId: schema.shoppingListItem.sectionId })
              .from(schema.shoppingListItem)
              .where(and(eq(schema.shoppingListItem.shoppingListId, listId), isNull(schema.shoppingListItem.checkedAt)))
              .orderBy(asc(schema.shoppingListItem.position), asc(schema.shoppingListItem.id))
          : [];

      let nextListId: number | null = null;

      if (pending.length > 0) {
        const [created] = await tx
          .insert(schema.shoppingList)
          .values({ householdId, createdBy: list.createdBy })
          .returning({ id: schema.shoppingList.id });

        if (!created) {
          throw new HTTPException(400, { message: 'Something went wrong.' });
        }
        nextListId = created.id;

        // Rebuild only the sections the carried items actually sit in — an emptied heading has no
        // business following them to the new list.
        const usedSectionIds = [...new Set(pending.map((item) => item.sectionId).filter((id) => id !== null))];
        const sectionIdMap = new Map<number, number>();

        if (usedSectionIds.length > 0) {
          const sources = await tx.query.shoppingListSection.findMany({
            where: (fields, { and, eq, inArray }) =>
              and(eq(fields.shoppingListId, listId), inArray(fields.id, usedSectionIds)),
            orderBy: (fields, { asc }) => [asc(fields.position), asc(fields.id)],
          });

          for (const [index, source] of sources.entries()) {
            const [copy] = await tx
              .insert(schema.shoppingListSection)
              .values({
                shoppingListId: nextListId,
                storeId: source.storeId,
                name: source.name,
                position: index,
              })
              .returning({ id: schema.shoppingListSection.id });

            if (copy) {
              sectionIdMap.set(source.id, copy.id);
            }
          }
        }

        for (const [index, item] of pending.entries()) {
          await tx
            .update(schema.shoppingListItem)
            .set({
              shoppingListId: nextListId,
              sectionId: item.sectionId === null ? null : (sectionIdMap.get(item.sectionId) ?? null),
              position: index,
            })
            .where(eq(schema.shoppingListItem.id, item.id));
        }

        // Carrying everything out of a section leaves an empty heading behind on the finished list.
        for (const sourceSectionId of usedSectionIds) {
          await ShoppingListsService.pruneSectionIfEmpty(tx, sourceSectionId);
        }
      }

      await tx.update(schema.shoppingList).set({ completedAt: new Date() }).where(eq(schema.shoppingList.id, listId));

      return nextListId;
    });

    return { carriedListId, list: await ShoppingListsService.read(householdId, listId) };
  }

  /** Undoes `complete`, for the mis-tap that would otherwise strand a list among the done ones. */
  public static async reopen(householdId: number, listId: number) {
    await ShoppingListsService.readListRow(householdId, listId);

    await db
      .update(schema.shoppingList)
      .set({ completedAt: null })
      .where(and(eq(schema.shoppingList.householdId, householdId), eq(schema.shoppingList.id, listId)));

    return ShoppingListsService.read(householdId, listId);
  }

  public static async createSection(householdId: number, listId: number, data: CreateSection) {
    await ShoppingListsService.readListRow(householdId, listId);

    const [nextPosition] = await db
      .select({ value: count() })
      .from(schema.shoppingListSection)
      .where(eq(schema.shoppingListSection.shoppingListId, listId));

    await db
      .insert(schema.shoppingListSection)
      .values({ shoppingListId: listId, name: data.name, position: nextPosition?.value ?? 0 })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new HTTPException(409, { message: `"${data.name}" is already a section of this list` });
        }
        throw error;
      });

    return ShoppingListsService.read(householdId, listId);
  }

  public static async patchSection(householdId: number, listId: number, sectionId: number, data: PatchSection) {
    await ShoppingListsService.readListRow(householdId, listId);
    await ShoppingListsService.assertSectionInList(db, listId, sectionId);

    if (data.name !== undefined) {
      // Renaming a shop-backed section detaches it: the heading is now the user's words, not the
      // shop's, and leaving the link would let a later shop rename overwrite what they just typed.
      await db
        .update(schema.shoppingListSection)
        .set({ name: data.name, storeId: null })
        .where(eq(schema.shoppingListSection.id, sectionId))
        .catch((error: unknown) => {
          if (isUniqueViolation(error)) {
            throw new HTTPException(409, { message: `"${data.name}" is already a section of this list` });
          }
          throw error;
        });
    }

    return ShoppingListsService.read(householdId, listId);
  }

  /** Removing a heading leaves its items on the list, ungrouped — never deletes them with it. */
  public static async deleteSection(householdId: number, listId: number, sectionId: number) {
    await ShoppingListsService.readListRow(householdId, listId);
    await ShoppingListsService.assertSectionInList(db, listId, sectionId);

    await db.transaction(async (tx) => {
      await tx.delete(schema.shoppingListSection).where(eq(schema.shoppingListSection.id, sectionId));
      // The FK nulls their `sectionId`, which drops them among the ungrouped items at whatever
      // positions they held in the section — renumber so the two sets don't interleave.
      await ShoppingListsService.resequence(tx, listId, null);
    });

    return ShoppingListsService.read(householdId, listId);
  }

  public static async createItem(householdId: number, listId: number, data: CreateItem, userId: string) {
    await ShoppingListsService.readListRow(householdId, listId);

    await db.transaction(async (tx) => {
      if (data.ingredientId !== undefined) {
        const [ingredient] = await tx
          .select({ id: schema.ingredient.id, name: schema.ingredient.name })
          .from(schema.ingredient)
          .where(and(eq(schema.ingredient.householdId, householdId), eq(schema.ingredient.id, data.ingredientId)))
          .limit(1);

        if (!ingredient) {
          throw new HTTPException(404, { message: 'Ingredient not found' });
        }

        // The unique index is the real guarantee; this exists so the answer names the thing that's
        // already there rather than surfacing a constraint error.
        const [duplicate] = await tx
          .select({ id: schema.shoppingListItem.id })
          .from(schema.shoppingListItem)
          .where(
            and(
              eq(schema.shoppingListItem.shoppingListId, listId),
              eq(schema.shoppingListItem.ingredientId, data.ingredientId)
            )
          )
          .limit(1);

        if (duplicate) {
          throw new HTTPException(409, { message: `"${ingredient.name}" is already on this list` });
        }
      }

      // An explicit section wins; otherwise the ingredient's shop decides, and a free-text one-off
      // has nothing to go on and stays ungrouped.
      let sectionId = await ShoppingListsService.assertSectionInList(tx, listId, data.sectionId);
      if (sectionId === undefined) {
        sectionId =
          data.ingredientId === undefined
            ? null
            : await ShoppingListsService.resolveSection(tx, listId, data.ingredientId);
      }

      const [created] = await tx
        .insert(schema.shoppingListItem)
        .values({
          shoppingListId: listId,
          sectionId,
          ingredientId: data.ingredientId ?? null,
          // A named ingredient carries its own label off the join; storing the name too would go
          // stale the moment the ingredient is renamed.
          title: data.ingredientId === undefined ? (data.title ?? null) : null,
          quantity: data.quantity ?? null,
          unit: data.unit ?? null,
          note: emptyToNull(data.note),
          // A placeholder: `resequence` below assigns the real one. `APPEND` is a splice index, not
          // a column value — writing it here overflows the `integer` position.
          position: 0,
          createdBy: userId,
        })
        .returning({ id: schema.shoppingListItem.id })
        .catch((error: unknown) => {
          // The check above is a TOCTOU window: two members adding the same ingredient at once both
          // pass it, and the loser hits the unique index. Same 409 rather than a 500.
          if (isUniqueViolation(error)) {
            throw new HTTPException(409, { message: 'That ingredient is already on this list' });
          }
          throw error;
        });

      if (!created) {
        throw new HTTPException(400, { message: 'Something went wrong.' });
      }

      await ShoppingListsService.resequence(tx, listId, sectionId ?? null, { index: APPEND, itemId: created.id });
    });

    return ShoppingListsService.read(householdId, listId);
  }

  public static async patchItem(householdId: number, listId: number, itemId: number, data: PatchItem, userId: string) {
    await ShoppingListsService.readListRow(householdId, listId);

    await db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(schema.shoppingListItem)
        .where(and(eq(schema.shoppingListItem.id, itemId), eq(schema.shoppingListItem.shoppingListId, listId)))
        .limit(1);

      if (!item) {
        throw itemNotFound();
      }

      const movingSection = data.sectionId !== undefined;
      if (movingSection) {
        await ShoppingListsService.assertSectionInList(tx, listId, data.sectionId);
      }

      const set = {
        // Only a free-text line has a title to rename; an ingredient's label lives on the join.
        title: item.ingredientId === null ? data.title : undefined,
        quantity: data.quantity,
        unit: data.unit,
        note: emptyToNull(data.note),
        sectionId: data.sectionId,
        // The boolean is the API; the timestamp and who did it are the storage.
        checkedAt: data.checked === undefined ? undefined : data.checked ? new Date() : null,
        checkedBy: data.checked === undefined ? undefined : data.checked ? userId : null,
      };

      // Every field is optional, so `PATCH {}` reaches here with nothing to write — and drizzle throws
      // "No values to set" rather than no-opping, which would surface as a 500.
      if (Object.values(set).some((value) => value !== undefined)) {
        await tx.update(schema.shoppingListItem).set(set).where(eq(schema.shoppingListItem.id, itemId));
      }

      if (movingSection) {
        await ShoppingListsService.resequence(tx, listId, data.sectionId ?? null, { index: APPEND, itemId });
        // The section it left closes the gap — or goes entirely, if that item was the last thing
        // in it.
        await ShoppingListsService.resequence(tx, listId, item.sectionId);
        await ShoppingListsService.pruneSectionIfEmpty(tx, item.sectionId);
      }
    });

    return ShoppingListsService.read(householdId, listId);
  }

  public static async deleteItem(householdId: number, listId: number, itemId: number) {
    await ShoppingListsService.readListRow(householdId, listId);

    await db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(schema.shoppingListItem)
        .where(and(eq(schema.shoppingListItem.id, itemId), eq(schema.shoppingListItem.shoppingListId, listId)))
        .returning({ sectionId: schema.shoppingListItem.sectionId });

      if (!deleted) {
        throw itemNotFound();
      }

      await ShoppingListsService.resequence(tx, listId, deleted.sectionId);
      await ShoppingListsService.pruneSectionIfEmpty(tx, deleted.sectionId);
    });

    return ShoppingListsService.read(householdId, listId);
  }

  /** The window an import reads, clamped the way `MealPlanService.listRange` clamps its own. */
  private static importRange({ from, to }: MealPlanPreviewQueryParams) {
    const start = from ?? todayISO();
    const requested = to ?? addDays(start, IMPORT_DEFAULT_DAYS - 1);
    const maxTo = addDays(start, MAX_RANGE_DAYS - 1);

    let end = requested;
    if (end < start) {
      end = start;
    }
    if (end > maxTo) {
      end = maxTo;
    }

    return { from: start, to: end };
  }

  /**
   * What a stretch of the meal plan says you need to buy: every ingredient of every recipe planned
   * in the range, one row per ingredient, amounts added up across the recipes that call for it.
   *
   * Planned meals with no recipe attached are simply skipped — "At work" names no ingredients, and
   * that's not an error, just nothing to contribute.
   *
   * A flat array, and the range it actually read: an over-long request is clamped rather than
   * refused, and without the effective range on the response a client asking for 90 days would
   * quietly show a week's worth under a three-month heading.
   */
  public static async previewFromMealPlan(householdId: number, params: MealPlanPreviewQueryParams) {
    const { from, to } = ShoppingListsService.importRange(params);

    const lines = await db
      .select({
        ingredientId: schema.ingredient.id,
        name: schema.ingredient.name,
        storeId: schema.store.id,
        storeName: schema.store.name,
        quantity: schema.recipeIngredient.quantity,
        unit: schema.recipeIngredient.unit,
        recipeId: schema.recipe.id,
        recipeTitle: schema.recipe.title,
      })
      .from(schema.plannedMeal)
      .innerJoin(schema.recipe, eq(schema.recipe.id, schema.plannedMeal.recipeId))
      .innerJoin(schema.recipeIngredient, eq(schema.recipeIngredient.recipeId, schema.recipe.id))
      .innerJoin(schema.ingredient, eq(schema.ingredient.id, schema.recipeIngredient.ingredientId))
      .leftJoin(schema.store, eq(schema.store.id, schema.ingredient.storeId))
      .where(
        and(
          eq(schema.plannedMeal.householdId, householdId),
          isNotNull(schema.plannedMeal.recipeId),
          gte(schema.plannedMeal.day, from),
          lte(schema.plannedMeal.day, to)
        )
      )
      .orderBy(asc(schema.ingredient.name), asc(schema.recipeIngredient.position));

    // Gathered in encounter order, so the preview reads alphabetically by ingredient rather than in
    // whatever order the planner happened to add meals.
    const byIngredient = new Map<
      number,
      {
        amounts: Amount[];
        ingredientId: number;
        name: string;
        recipeTitles: string[];
        store: { id: number; name: string } | null;
      }
    >();

    for (const line of lines) {
      const entry = byIngredient.get(line.ingredientId) ?? {
        amounts: [],
        ingredientId: line.ingredientId,
        name: line.name,
        recipeTitles: [],
        store: line.storeId !== null && line.storeName !== null ? { id: line.storeId, name: line.storeName } : null,
      };

      entry.amounts.push({ quantity: line.quantity, unit: line.unit });
      // The same recipe planned on two days is still one recipe asking for this.
      if (!entry.recipeTitles.includes(line.recipeTitle)) {
        entry.recipeTitles.push(line.recipeTitle);
      }
      byIngredient.set(line.ingredientId, entry);
    }

    // Counted separately, because the join above only sees meals that carry a recipe. Without it an
    // empty preview can't tell "nothing is planned here" from "what's planned names no ingredients",
    // and those two want opposite advice.
    const [planned] = await db
      .select({ count: count() })
      .from(schema.plannedMeal)
      .where(
        and(
          eq(schema.plannedMeal.householdId, householdId),
          gte(schema.plannedMeal.day, from),
          lte(schema.plannedMeal.day, to)
        )
      );

    return {
      from,
      to,
      plannedMeals: planned?.count ?? 0,
      lines: [...byIngredient.values()].map((entry) => ({
        ...entry,
        amounts: sumAmounts(entry.amounts),
      })),
    };
  }

  /**
   * Puts the ticked preview lines on a list, minting one if `listId` is absent.
   *
   * An ingredient already on the list is skipped rather than refused: an import is a bulk action,
   * and failing all of it because one thing is already there would be the wrong call.
   *
   * One item per ingredient, since that's the rule a list holds to. An ingredient whose recipes
   * called for units that don't add up — 200 g of flour here, a cup of it there — carries the first
   * amount in its own fields and the rest in its note, so nothing is dropped and you can still see
   * you need both.
   */
  public static async importFromMealPlan(householdId: number, data: ImportFromMealPlan, userId: string) {
    const listId = await db.transaction(async (tx) => {
      const ingredientIds = data.lines.map((line) => line.ingredientId);

      // Before anything is written, and before a list is minted: an id from another household is a
      // malformed request, not a line to skip quietly, and answering 201 with an empty list would
      // hide that.
      const owned = await tx
        .select({ id: schema.ingredient.id })
        .from(schema.ingredient)
        .where(and(eq(schema.ingredient.householdId, householdId), inArray(schema.ingredient.id, ingredientIds)));
      const ownedIds = new Set(owned.map((row) => row.id));

      if (ownedIds.size !== new Set(ingredientIds).size) {
        throw new HTTPException(404, { message: 'Ingredient not found' });
      }

      let targetId = data.listId;

      if (targetId === undefined) {
        const [created] = await tx
          .insert(schema.shoppingList)
          .values({ householdId, name: data.name ?? null, createdBy: userId })
          .returning({ id: schema.shoppingList.id });

        if (!created) {
          throw new HTTPException(400, { message: 'Something went wrong.' });
        }
        targetId = created.id;
      } else {
        await ShoppingListsService.readListRow(householdId, targetId, tx);
      }

      const present = await tx
        .select({ ingredientId: schema.shoppingListItem.ingredientId })
        .from(schema.shoppingListItem)
        .where(
          and(
            eq(schema.shoppingListItem.shoppingListId, targetId),
            inArray(schema.shoppingListItem.ingredientId, ingredientIds)
          )
        );
      const alreadyOn = new Set(present.map((row) => row.ingredientId));

      for (const line of data.lines) {
        if (alreadyOn.has(line.ingredientId)) {
          continue;
        }
        // Claimed up front: two amounts of one ingredient would otherwise collide with each other on
        // the second pass through the unique index.
        alreadyOn.add(line.ingredientId);

        const sectionId = await ShoppingListsService.resolveSection(tx, targetId, line.ingredientId);
        const [first, ...rest] = line.amounts;

        const [created] = await tx
          .insert(schema.shoppingListItem)
          .values({
            shoppingListId: targetId,
            sectionId,
            ingredientId: line.ingredientId,
            quantity: first?.quantity ?? null,
            unit: first?.unit ?? null,
            note: rest.length > 0 ? `plus ${rest.map(formatAmount).join(', ')}` : null,
            position: 0,
            createdBy: userId,
          })
          .returning({ id: schema.shoppingListItem.id })
          .catch((error: unknown) => {
            // A concurrent import got there first. Skipping is the same answer the pre-check gives.
            if (isUniqueViolation(error)) {
              return [undefined];
            }
            throw error;
          });

        if (created) {
          await ShoppingListsService.resequence(tx, targetId, sectionId, { index: APPEND, itemId: created.id });
        }
      }

      return targetId;
    });

    return ShoppingListsService.read(householdId, listId);
  }
}
