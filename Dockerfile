# syntax=docker/dockerfile:1
#
# Production image for LeaseOps: one container, one origin.
#
# The API process serves both `/api` and the built PWA (see
# `apps/api/src/services/static.ts`), which is what lets the session cookie stay
# first-party behind a single hostname. There is no nginx and no second service.
#
# Build from the repo root:
#   docker build -t leaseops:latest .

ARG BUN_VERSION=1.3.14

# ---------------------------------------------------------------------------
# deps — full install, including devDependencies, because Vite lives there.
# Only the manifests are copied so this layer survives every source edit.
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# webbuild — produces apps/web/dist.
# ---------------------------------------------------------------------------
FROM deps AS webbuild
WORKDIR /app
COPY . .
RUN bun run --filter @leaseops/web build

# ---------------------------------------------------------------------------
# proddeps — the same install without devDependencies, so Vite, ESLint,
# TypeScript and drizzle-kit never reach the runtime image.
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS proddeps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
RUN bun install --frozen-lockfile --production

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS runtime

# Bun executes the TypeScript sources directly, so there is no compile step for
# the API — the "build artifact" is the source tree plus production node_modules.
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=/app/data/local_leaseops.db \
    WEB_DIST_PATH=/app/apps/web/dist

# The whole resolved tree — manifests and every workspace's node_modules — rather
# than named subdirectories. Bun's isolated linker puts packages under each
# workspace and symlinks them into a root `.bun` store, and that layout is an
# implementation detail that has changed before. Copying it wholesale means a
# linker change cannot silently leave a dependency behind.
COPY --from=proddeps /app /app

# Only `dist` is served; the web workspace's runtime deps (React and friends)
# are bundled into it and are dead weight here.
RUN rm -rf /app/apps/web/node_modules

COPY tsconfig.json ./
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/src ./apps/api/src
COPY packages/db/tsconfig.json ./packages/db/
COPY packages/db/src ./packages/db/src
COPY packages/db/drizzle ./packages/db/drizzle
COPY --from=webbuild /app/apps/web/dist ./apps/web/dist
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# The suite runs against the developer's database and provisions throwaway
# households to do it (see `apps/api/src/test-support.ts`). None of that belongs
# in a deployed image.
RUN find /app/apps/api/src /app/packages/db/src -name '*.test.ts' -delete \
 && rm -f /app/apps/api/src/test-support.ts

# The database is the only thing the process writes, and it lives on a volume.
# `bun` (uid 1000) ships with the base image; owning just this directory keeps
# the rest of the filesystem read-only to the app even without `read_only: true`.
RUN mkdir -p /app/data \
 && chown -R bun:bun /app/data \
 && chmod +x /usr/local/bin/entrypoint.sh

USER bun

EXPOSE 3000

# Hits the app's own health route, so a container that is running but not
# serving is reported unhealthy rather than up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bun", "run", "apps/api/src/index.ts"]
