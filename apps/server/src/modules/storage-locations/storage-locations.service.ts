import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '#db/core';
import { changedColumns, emptyToNull, type Filters, isUniqueViolation, writesAnything } from '#db/utils';
import { blobPrefix } from '#lib/blobs';
import { alreadyExists, notFound, somethingWentWrong } from '#lib/errors';
import { ImagesService } from '#modules/images/images.service';

import {
  type CreateStorageLocation,
  type ListStorageLocationsQueryParams,
  type PatchStorageLocation,
} from './storage-locations.model';

/** The pin as the row stores it — two columns that are only ever both set or both null. */
type Pin = { latitude: number | null; longitude: number | null };

/**
 * The places a household keeps things. A location is the answer to "where is it"; what sits inside
 * one is the storage-items module's business, and it has its own list endpoint because the useful
 * question ("where is the tent") is asked across every location at once.
 */
export class StorageLocationsService {
  /** Resolves a location, scoped to its household so ids from elsewhere 404. */
  private static async readLocationRow(householdId: number, locationId: number) {
    const [location] = await db
      .select()
      .from(schema.storageLocation)
      .where(and(eq(schema.storageLocation.householdId, householdId), eq(schema.storageLocation.id, locationId)))
      .limit(1);

    if (!location) {
      throw notFound('Storage location');
    }

    return location;
  }

  /**
   * How much each of the given locations holds, and how much of that is out on loan. Constrained to
   * the ids just read rather than grouping the whole table.
   */
  private static async countItems(householdId: number, locationIds: number[]) {
    if (locationIds.length === 0) {
      return new Map<number, { itemCount: number; onLoanCount: number }>();
    }

    const rows = await db
      .select({
        locationId: schema.storageItem.locationId,
        itemCount: count(),
        // `count(column)` skips NULLs, and a NULL `borrowedOn` is precisely "not on loan".
        onLoanCount: count(schema.storageItem.borrowedOn),
      })
      .from(schema.storageItem)
      .where(and(eq(schema.storageItem.householdId, householdId), inArray(schema.storageItem.locationId, locationIds)))
      .groupBy(schema.storageItem.locationId);

    return new Map(rows.map(({ locationId, ...counts }) => [locationId, counts]));
  }

  /**
   * Rejects a name that already exists in the household, case-insensitively. The unique index is the
   * real guarantee — this exists so the user gets a 409 with a message instead of a constraint error.
   */
  private static async assertNameAvailable(householdId: number, name: string, excludeId?: number) {
    const filters: Filters = [
      eq(schema.storageLocation.householdId, householdId),
      sql`lower(${schema.storageLocation.name}) = lower(${name})`,
    ];

    if (excludeId !== undefined) {
      filters.push(ne(schema.storageLocation.id, excludeId));
    }

    const [existing] = await db
      .select({ id: schema.storageLocation.id })
      .from(schema.storageLocation)
      .where(and(...filters))
      .limit(1);

    if (existing) {
      throw alreadyExists(name, 'a storage location');
    }
  }

  /**
   * The pin is one value spread over two columns, so it can only be validated against the merged
   * row: a PATCH carrying just a latitude is fine when the stored longitude stays, and wrong when
   * the same request clears it. Half a pair can't be drawn on a map, and the DB check would answer
   * that as a 500 rather than a message.
   */
  private static resolvePin(current: Pin, data: Partial<Pin>): Pin {
    const latitude = data.latitude === undefined ? current.latitude : data.latitude;
    const longitude = data.longitude === undefined ? current.longitude : data.longitude;

    if ((latitude === null) !== (longitude === null)) {
      throw new HTTPException(400, { message: 'A map pin needs both a latitude and a longitude.' });
    }

    return { latitude, longitude };
  }

  /**
   * Confirms a location id belongs to this household, for the endpoints that accept one as a foreign
   * key. Returns the id so a caller can write it straight through.
   */
  public static async assertInHousehold(householdId: number, locationId: number) {
    await StorageLocationsService.readLocationRow(householdId, locationId);

    return locationId;
  }

  /** The household's locations, each with what it holds and how much of that is lent out. */
  public static async list(householdId: number, { search, sortKey, sortDirection }: ListStorageLocationsQueryParams) {
    const { address, householdId: householdIdColumn, name } = schema.storageLocation;
    const sortColumn = schema.storageLocation[sortKey];

    const filters: Filters = [eq(householdIdColumn, householdId)];

    if (search) {
      const term = `%${search}%`;
      filters.push(or(ilike(name, term), ilike(address, term)));
    }

    const locations = await db
      .select()
      .from(schema.storageLocation)
      .where(and(...filters))
      // The id breaks ties, so two identical requests can't shuffle rows that share a `createdAt`.
      .orderBy(sortDirection === 'desc' ? desc(sortColumn) : asc(sortColumn), asc(schema.storageLocation.id));

    const counts = await StorageLocationsService.countItems(
      householdId,
      locations.map((row) => row.id)
    );

    return locations.map((row) => ({
      ...row,
      itemCount: counts.get(row.id)?.itemCount ?? 0,
      onLoanCount: counts.get(row.id)?.onLoanCount ?? 0,
    }));
  }

  /** Metadata plus counts. The items themselves come from `GET /storage-items?locationId=`. */
  public static async read(householdId: number, locationId: number) {
    const location = await StorageLocationsService.readLocationRow(householdId, locationId);
    const counts = await StorageLocationsService.countItems(householdId, [locationId]);

    return {
      ...location,
      itemCount: counts.get(locationId)?.itemCount ?? 0,
      onLoanCount: counts.get(locationId)?.onLoanCount ?? 0,
    };
  }

  public static async create(householdId: number, data: CreateStorageLocation) {
    await StorageLocationsService.assertNameAvailable(householdId, data.name);

    const pin = StorageLocationsService.resolvePin({ latitude: null, longitude: null }, data);

    // The check above is a TOCTOU window: two concurrent creates of the same name both pass it, and
    // the loser hits the unique index. Translate that into the same 409 rather than a 500.
    const [created] = await db
      .insert(schema.storageLocation)
      .values({ householdId, name: data.name, address: emptyToNull(data.address), ...pin })
      .returning()
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw alreadyExists(data.name, 'a storage location');
        }
        throw error;
      });

    if (!created) {
      throw somethingWentWrong();
    }

    return { ...created, itemCount: 0, onLoanCount: 0 };
  }

  public static async patch(householdId: number, locationId: number, data: PatchStorageLocation) {
    const existing = await StorageLocationsService.readLocationRow(householdId, locationId);

    if (data.name !== undefined) {
      await StorageLocationsService.assertNameAvailable(householdId, data.name, locationId);
    }

    const movesPin = data.latitude !== undefined || data.longitude !== undefined;
    const set = {
      name: data.name,
      address: emptyToNull(data.address),
      ...(movesPin ? StorageLocationsService.resolvePin(existing, data) : {}),
    };

    const changeset = changedColumns(existing, set);

    if (!writesAnything(set)) {
      return { data: await StorageLocationsService.read(householdId, locationId), changeset };
    }

    const [updated] = await db
      .update(schema.storageLocation)
      .set(set)
      .where(and(eq(schema.storageLocation.householdId, householdId), eq(schema.storageLocation.id, locationId)))
      .returning({ id: schema.storageLocation.id })
      .catch((error: unknown) => {
        if (data.name !== undefined && isUniqueViolation(error)) {
          throw alreadyExists(data.name, 'a storage location');
        }
        throw error;
      });

    if (!updated) {
      throw notFound('Storage location');
    }

    return { data: await StorageLocationsService.read(householdId, locationId), changeset };
  }

  /**
   * Hard delete, taking the location's items with it — an item's whole identity is where it is, so
   * there is nothing sensible to reassign it to. The web confirms with the count first.
   *
   * The photos have to be collected *before* the cascade, because afterwards there is no row left to
   * read a blob URL off, and nothing else would ever notice the orphans.
   */
  public static async delete(householdId: number, locationId: number) {
    await StorageLocationsService.readLocationRow(householdId, locationId);

    const photos = await db
      .select({ photoUrl: schema.storageItem.photoUrl })
      .from(schema.storageItem)
      .where(and(eq(schema.storageItem.householdId, householdId), eq(schema.storageItem.locationId, locationId)));

    const [deleted] = await db
      .delete(schema.storageLocation)
      .where(and(eq(schema.storageLocation.householdId, householdId), eq(schema.storageLocation.id, locationId)))
      .returning();

    if (!deleted) {
      throw notFound('Storage location');
    }

    // The rows are already gone — cleanup is best-effort and guarded to our own uploads.
    await Promise.all(
      photos.map(({ photoUrl }) => ImagesService.cleanupOwnedImage(photoUrl, blobPrefix.storageItemPhoto(householdId)))
    );

    return deleted;
  }
}
