import { Resend } from 'resend';

import { env } from '@/config/env';

export const resend = new Resend(env.HOMEWISE_RESEND_API_KEY);
