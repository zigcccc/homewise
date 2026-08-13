import { DetailedError } from '@/api/client';

/**
 * The server's own message for a failed request, falling back when there isn't one.
 *
 * A plain `error.message` surfaces the status line ("409 Conflict") — the message our handlers throw
 * (`HTTPException(409, { message })`) arrives on `DetailedError.detail.data`. Reach for this whenever
 * the server's reason is more useful than "Something went wrong": a duplicate name, an ingredient
 * still in use, a validation failure.
 */
export function serverMessage(error: unknown, fallback: string) {
  const data = error instanceof DetailedError ? error.detail?.data : undefined;

  return typeof data === 'string' && data.length > 0 ? data : fallback;
}

/**
 * Whether a failed request came back with a given status.
 *
 * Reach for this when one status has a home in the UI that the others don't: a 409 duplicate name is
 * a problem with what was typed and belongs on that field, while a 500 or a dropped connection says
 * nothing about the value and would misattribute the failure if it landed there.
 */
export function isServerStatus(error: unknown, status: number) {
  return error instanceof DetailedError && error.statusCode === status;
}

/**
 * Whether a failure is one the server produced on purpose — a 404 for an id that isn't there, a 409
 * duplicate name, a 401 from an expired session, a 400 that failed validation.
 *
 * These are the API working as designed and the UI already handles them, so reporting them would
 * bury the failures that *are* bugs. Anything else — a 5xx, a dropped connection, a thrown
 * `TypeError` — isn't a `DetailedError` with a 4xx and is worth knowing about.
 */
export function isExpectedRequestFailure(error: unknown) {
  return error instanceof DetailedError && error.statusCode >= 400 && error.statusCode < 500;
}

/**
 * The `default` of a switch that is meant to be exhaustive: unreachable, so passing anything is a
 * compile error naming the case that was left out.
 *
 * It still runs, because the unions it guards come off the wire — a server that ships a new enum
 * value before this build does reaches here at runtime, where returning `null` renders nothing rather
 * than crashing the route. `console.error` because that is how we reach Sentry.
 */
export function assertNever(value: never) {
  console.error('Unhandled value:', value);

  return null;
}
