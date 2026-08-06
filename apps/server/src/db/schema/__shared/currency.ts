import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * The currencies a household can keep its books in. A curated list rather than every ISO-4217 code:
 * one nobody uses has no symbol worth rendering. Adding one later is `ALTER TYPE … ADD VALUE`.
 *
 * **Its own dependency-free file, and it has to stay one.** `household` and `expense` import each
 * other — the FK one way, the `many()` back — which is fine for tables, because `references(() => …)`
 * and the `relations()` config are both callbacks that run long after the modules have loaded. A
 * `pgEnum` is not: `currencyEnum()` is called while the table is being constructed, so putting it in
 * either of those two files makes whichever one loads second read it before it exists ("Cannot access
 * 'currencyEnum' before initialization"). Sitting outside the cycle is what keeps that impossible.
 */
export const currencyEnum = pgEnum('currency', ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF']);
