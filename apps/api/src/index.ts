import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import healthRouter from './routes/health';
import apartmentsRouter from './routes/apartments';
import authRouter from './routes/auth';
import profilesRouter from './routes/profiles';
import householdsRouter from './routes/households';
import { requireAuth } from './services/auth';
import { rateLimit } from './services/rate-limit';
import { mountWebApp } from './services/static';

const isProduction = Bun.env.NODE_ENV === 'production';

const app = new Hono();

// Global Middlewares
app.use('*', logger());

app.use(
  '*',
  secureHeaders({
    // The listing description is attacker-controlled text rendered into this
    // page. It is escaped as text (see the no-fabrication and no-HTML rules in
    // CLAUDE.md), and this is the second line of that defence: even a successful
    // injection has nowhere to send data and no script origin to load from.
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      // Vite emits real files for both the app and the PWA registration, so no
      // inline script is needed and none is allowed.
      scriptSrc: ["'self'"],
      // 'unsafe-inline' covers React's inline `style` attributes, which is a
      // far smaller exposure than inline script. No external stylesheet host is
      // listed because there is none — Inter is self-hosted and bundled.
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      // The API and its SSE stream are same-origin. Anthropic is called from
      // the server, never the browser, so no external endpoint belongs here.
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
    },
    // Cloudflare terminates TLS in front of this; the header still reaches the
    // browser and pins the hostname to HTTPS.
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    referrerPolicy: 'strict-origin-when-cross-origin',
    xFrameOptions: 'DENY',
  })
);

/**
 * Cross-origin access is opt-in.
 *
 * In production the PWA is served by this same process on this same origin, so
 * no browser ever makes a cross-origin call and an unset variable must mean
 * "none" rather than "localhost". In development the Vite proxy covers :5173,
 * and the defaults keep a bare `bun run dev` working.
 */
const corsOrigins =
  Bun.env.CORS_ALLOWED_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean) ?? (isProduction ? [] : ['http://localhost:5173', 'http://localhost:3000']);

if (corsOrigins.length > 0) {
  app.use('*', cors({ origin: corsOrigins, credentials: true }));
}

// Throttle the two endpoints reachable without a session. Everything else is
// behind `requireAuth`, where an attacker already needs a valid token.
app.use('/api/auth/login', rateLimit({ name: 'login', limit: 10, windowMs: 15 * 60_000 }));
app.use('/api/auth/signup', rateLimit({ name: 'signup', limit: 5, windowMs: 60 * 60_000 }));
// Tighter still: each attempt writes a file and opens it with SQLite, and a
// legitimate migration happens once in an instance's life.
app.use('/api/auth/import', rateLimit({ name: 'import', limit: 3, windowMs: 60 * 60_000 }));
// Inspecting changes nothing, so it gets room to retry with a different file.
app.use('/api/auth/import/inspect', rateLimit({ name: 'import-inspect', limit: 20, windowMs: 60 * 60_000 }));

// Protect sensitive pipeline endpoints
app.use('/api/apartments/*', requireAuth);
app.use('/api/apartments', requireAuth);
app.use('/api/profiles/*', requireAuth);
app.use('/api/profiles', requireAuth);
app.use('/api/households/*', requireAuth);
app.use('/api/households', requireAuth);

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

// The built PWA, if there is one. Registered last so every API route above wins,
// and it answers `/` itself — hence no placeholder root handler when it mounts.
const webAppMounted = mountWebApp(app);
if (!webAppMounted) {
  app.get('/', (c) => c.text('LeaseOps API Server Running'));
}

// Global Error & Not Found Handlers
app.notFound((c) => {
  return c.json({ message: 'Endpoint not found', statusCode: 404 }, 404);
});

app.onError((err, c) => {
  console.error('[API Error]', err);
  return c.json(
    {
      // The message can carry a SQL fragment, a file path, or an upstream API's
      // reply. That is useful in a terminal and nobody's business over the
      // internet, so the internet gets the log line's existence, not its text.
      message: isProduction ? 'Internal Server Error' : err.message || 'Internal Server Error',
      error: isProduction ? 'Error' : err.name || 'Error',
      statusCode: 500,
    },
    500
  );
});

export type AppType = typeof routes;

const port = Number(Bun.env.PORT) || 3000;
console.log(`🚀 LeaseOps API running on http://localhost:${port}`);

// The Anthropic key is per household now, so this variable is no longer read at
// request time. Said out loud because the alternative is an instance that looks
// configured, produces offline output everywhere, and gives no reason why.
if (Bun.env.ANTHROPIC_API_KEY?.trim()) {
  console.log(
    'ℹ️  ANTHROPIC_API_KEY is set but no longer used at runtime — each household stores its own key. Settings → AI has a one-click import for this one.'
  );
}

if (isProduction && Bun.env.ALLOW_SIGNUP !== 'true') {
  console.log('🔒 Sign-up is closed (ALLOW_SIGNUP is not "true"). Existing accounts can still log in.');
}

export default {
  port,
  // Bun's 10s default closes the long-lived /api/apartments/sse stream, which
  // silently stops live pipeline updates in the dashboard.
  idleTimeout: 60,
  fetch: app.fetch,
};
