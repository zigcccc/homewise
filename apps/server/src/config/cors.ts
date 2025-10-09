import { cors } from 'hono/cors';

export const allowedOrigins = ['http://localhost:3000', 'https://www.home-wise.app', 'https://home-wise.app'];

export const corsConfig = cors({
  origin: allowedOrigins,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'Access-Control-Allow-Credentials'],
  maxAge: 600,
  credentials: true,
});
