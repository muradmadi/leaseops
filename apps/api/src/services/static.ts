/**
 * Serves the built PWA from the API process, so a deployment is one container
 * on one origin.
 *
 * Same-origin is the point, not a shortcut: the session cookie stays first-party
 * (no `SameSite=None`), CORS stops mattering, and `apps/web/src/lib/api.ts` keeps
 * calling `/api/...` relatively with no build-time base URL to configure.
 *
 * Written against `Bun.file` rather than `hono/bun`'s `serveStatic` because that
 * helper resolves its root against the process working directory — which would
 * make the app silently serve nothing when started from the wrong folder, the
 * same trap `DATABASE_URL` already documents.
 */
import { resolve, join, normalize } from 'path';
import type { Hono } from 'hono';

/** apps/api/src/services → apps/web/dist */
const DEFAULT_DIST = resolve(import.meta.dir, '../../../web/dist');

export const webDistPath = Bun.env.WEB_DIST_PATH?.trim() || DEFAULT_DIST;

/**
 * Extensions Bun does not map to a useful type on its own.
 */
const MIME_OVERRIDES: Record<string, string> = {
  '.webmanifest': 'application/manifest+json',
};

/**
 * Vite fingerprints everything under `/assets`, so those may be cached forever.
 *
 * Everything else must not be: `index.html` and `sw.js` are how a new version
 * reaches an installed PWA, and a cached service worker pins users to an old
 * build with no way to recover but clearing site data.
 */
function cacheControl(pathname: string): string {
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  return 'no-cache';
}

function contentType(filePath: string, fallback: string): string {
  const dot = filePath.lastIndexOf('.');
  const ext = dot === -1 ? '' : filePath.slice(dot).toLowerCase();
  return MIME_OVERRIDES[ext] ?? fallback;
}

/**
 * Resolves a URL path to a file inside the dist directory, or null if it escapes.
 *
 * `normalize` collapses `..` before the prefix check, so `/assets/../../.env`
 * cannot walk out of the build output.
 */
function resolveWithin(root: string, pathname: string): string | null {
  const candidate = normalize(join(root, decodeURIComponent(pathname)));
  if (candidate !== root && !candidate.startsWith(root + '/')) return null;
  return candidate;
}

/**
 * Mounts the SPA as a fallback for any GET the API did not already answer.
 *
 * Call this **after** every `/api` route is registered: Hono composes handlers
 * in registration order, so an earlier API handler still wins.
 */
export function mountWebApp(app: Hono<any>): boolean {
  const indexPath = join(webDistPath, 'index.html');
  if (!Bun.file(indexPath).size) {
    console.warn(
      `⚠️  No web build at ${webDistPath} — serving the API only. Run \`bun run build\` to produce it.`
    );
    return false;
  }

  app.get('*', async (c) => {
    const pathname = new URL(c.req.url).pathname;

    // The API owns this namespace outright. Falling through to index.html here
    // would answer a mistyped endpoint with 200 and an HTML body, which reads
    // as a working call to a fetch client.
    if (pathname === '/api' || pathname.startsWith('/api/')) return c.notFound();

    const filePath = resolveWithin(webDistPath, pathname);
    if (filePath) {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, {
          headers: {
            'Content-Type': contentType(filePath, file.type),
            'Cache-Control': cacheControl(pathname),
          },
        });
      }
    }

    // Client-side routing: unknown paths are wouter's problem, not a 404.
    return new Response(Bun.file(indexPath), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  });

  return true;
}
