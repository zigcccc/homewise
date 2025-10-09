import { Resend } from 'resend';

export const resend = new Resend(import.meta.env.HOMEWISE_RESEND_API_KEY);
