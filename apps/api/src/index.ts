import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import healthRouter from './routes/health';
import apartmentsRouter from './routes/apartments';
import authRouter from './routes/auth';
import profilesRouter from './routes/profiles';
import householdsRouter from './routes/households';
import { requireAuth } from './services/auth';

const app = new Hono();

// Global Middlewares
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: Bun.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  })
);

// Protect sensitive pipeline endpoints
app.use('/api/apartments/*', requireAuth);
app.use('/api/apartments', requireAuth);
app.use('/api/profiles/*', requireAuth);
app.use('/api/profiles', requireAuth);
app.use('/api/households/*', requireAuth);
app.use('/api/households', requireAuth);

// Root endpoint
app.get('/', (c) => c.text('LeaseOps API Server Running'));

// Mount modular route handlers with chaining for Hono RPC type inference.
// `routes` is consumed only by `typeof routes` below — that is the whole point
// of the chained form, so the unused-value warning is expected here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const routes = app
  .route('/api/health', healthRouter)
  .route('/api/auth', authRouter)
  .route('/api/apartments', apartmentsRouter)
  .route('/api/profiles', profilesRouter)
  .route('/api/households', householdsRouter);


// Global Error & Not Found Handlers
app.notFound((c) => {
  return c.json({ message: 'Endpoint not found', statusCode: 404 }, 404);
});

app.onError((err, c) => {
  console.error('[API Error]', err);
  return c.json(
    {
      message: err.message || 'Internal Server Error',
      error: err.name || 'Error',
      statusCode: 500,
    },
    500
  );
});

export type AppType = typeof routes;

const port = Number(Bun.env.PORT) || 3000;
console.log(`🚀 LeaseOps API running on http://localhost:${port}`);

export default {
  port,
  // Bun's 10s default closes the long-lived /api/apartments/sse stream, which
  // silently stops live pipeline updates in the dashboard.
  idleTimeout: 60,
  fetch: app.fetch,
};
