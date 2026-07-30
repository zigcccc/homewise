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
