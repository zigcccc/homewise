import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => {
  return c.json({ ping: 'pong' });
});

export default app;
