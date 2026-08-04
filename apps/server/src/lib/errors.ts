import { HTTPException } from 'hono/http-exception';

/**
 * The exceptions whose *message* repeats across modules — not merely their status code.
 *
 * A wrapper per status would be the wrong trade: it hides one number and tells the reader nothing,
 * so a one-off message still throws `new HTTPException(...)` directly and reads fine. These exist
 * because the same sentence was being written in dozens of places, which is how "Something went
 * wrong" came to exist both with and without its full stop, and how two modules each grew their own
 * `duplicateNameError`.
 */

/** "Recipe not found" — what a household-scoped read throws for an id it can't see. */
export const notFound = (entity: string) => new HTTPException(404, { message: `${entity} not found` });

/** A write that came back with nothing, where there is nothing more useful to tell the user. */
export const somethingWentWrong = () => new HTTPException(400, { message: 'Something went wrong.' });

/** `alreadyExists('Spar', 'a shop')` → `"Spar" is already a shop`. */
export const alreadyExists = (name: string, what: string) =>
  new HTTPException(409, { message: `"${name}" is already ${what}` });

/**
 * A row that was just written or resolved and then could not be read back. Never the caller's fault
 * and never actionable, so it is a 500 rather than a 4xx.
 */
export const couldNotResolve = (what: string) => new HTTPException(500, { message: `Could not resolve ${what}` });
