import { type CreateEmailOptions, Resend } from 'resend';

import { env } from '@/config/env';

const client = new Resend(env.HOMEWISE_RESEND_API_KEY);

/**
 * Sends one transactional email.
 *
 * Two things this adds over calling `resend.emails.send` directly:
 *
 * - It honours `HOMEWISE_DISABLE_EMAILS`, so the E2E suite makes no outbound calls at all. Real
 *   sends made the invite specs flaky (Resend rate-limits, the suite runs three workers) and spent
 *   quota on throwaway addresses.
 * - It **raises** provider failures. The SDK reports them on the returned `error` field rather than
 *   throwing, so an unchecked `await resend.emails.send(...)` swallows them silently. Callers that
 *   would rather carry on can catch — but they have to say so.
 */
export async function sendEmail(payload: CreateEmailOptions) {
  if (env.HOMEWISE_DISABLE_EMAILS) {
    console.log(`✉︎ email suppressed (HOMEWISE_DISABLE_EMAILS): "${payload.subject}" → ${String(payload.to)}`);
    return;
  }

  const { error } = await client.emails.send(payload);

  if (error) {
    throw new Error(`Failed to send email "${payload.subject}": ${error.message}`);
  }
}
