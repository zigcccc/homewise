import dotenv from 'dotenv';
import z from 'zod';

dotenv.config();

const nodeEnv = z.enum(['development', 'production', 'test']);

const envModel = z.object({
  HOMEWISE_RESEND_API_KEY: z.string(),
  BETTER_AUTH_SECRET: z.string(),
  DATABASE_URL: z.string(),
  NODE_ENV: nodeEnv.default('development'),
});
export type EnvType = z.infer<typeof envModel>;

const parsedEnv = envModel.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(parsedEnv.error.message);
  process.exit(1);
}

export const env = parsedEnv.data;
