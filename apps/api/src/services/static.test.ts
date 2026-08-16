import { describe, it, expect } from 'bun:test';
import { join } from 'path';
import app from '../index';
import { webDistPath } from './static';

/**
 * The PWA is only mounted when a build exists, which it does not on a fresh
 * clone before `bun run build`. Skipping beats failing for a missing artefact
 * the suite does not produce.
 */
const built = Boolean(Bun.file(join(webDistPath, 'index.html')).size);
const ifBuilt = built ? it : it.skip;

describe('static PWA serving', () => {
  ifBuilt('serves the app shell at the root', async () => {
    const res = await app.fetch(new Request('http://localhost/'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toContain('<div id="root">');
  });

  ifBuilt('falls back to the shell for client-side routes', async () => {
    const res = await app.fetch(new Request('http://localhost/settings'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('never lets the fallback answer for /api, which would turn a 404 into a 200 of HTML', async () => {
    const res = await app.fetch(new Request('http://localhost/api/definitely-not-a-route'));

    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.json()).toMatchObject({ statusCode: 404 });
  });

  ifBuilt('does not serve files from outside the build directory', async () => {
    // Percent-encoded so it survives URL normalisation and actually reaches the
    // handler's own containment check.
    const res = await app.fetch(
      new Request('http://localhost/assets/%2e%2e%2f%2e%2e%2f%2e%2e%2fpackage.json')
    );

    const body = await res.text();
    expect(body).not.toContain('"@leaseops/root"');
    expect(body).toContain('<div id="root">');
  });

  ifBuilt('marks fingerprinted assets immutable and everything else no-cache', async () => {
    const shell = await app.fetch(new Request('http://localhost/'));
    expect(shell.headers.get('Cache-Control')).toBe('no-cache');

    const assetPath = (await shell.text()).match(/\/assets\/[^"]+\.js/)?.[0];
    expect(assetPath).toBeTruthy();

    const asset = await app.fetch(new Request(`http://localhost${assetPath}`));
    expect(asset.status).toBe(200);
    expect(asset.headers.get('Cache-Control')).toContain('immutable');
  });

  ifBuilt('keeps the service worker uncacheable, or an installed PWA never updates', async () => {
    const res = await app.fetch(new Request('http://localhost/sw.js'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });
});

describe('security headers', () => {
  it('sends a CSP that allows no inline script and no framing', async () => {
    const res = await app.fetch(new Request('http://localhost/api/health'));
    const csp = res.headers.get('Content-Security-Policy') ?? '';

    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // Anthropic is called from the server; the browser must reach nothing else.
    expect(csp).toContain("connect-src 'self'");
  });

  it('names no external host at all, now that Inter is self-hosted', async () => {
    const res = await app.fetch(new Request('http://localhost/api/health'));
    const csp = res.headers.get('Content-Security-Policy') ?? '';

    expect(csp).toContain("font-src 'self'");
    expect(csp).not.toContain('googleapis');
    expect(csp).not.toContain('gstatic');
    expect(csp).not.toContain('http');
  });

  it('sends the standard hardening headers', async () => {
    const res = await app.fetch(new Request('http://localhost/api/health'));

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
