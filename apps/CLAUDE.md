# apps/ — Application Layer

Two deployable applications. Rules here apply to both; see `api/CLAUDE.md` and
`web/CLAUDE.md` for specifics. Root `../CLAUDE.md` still applies.

## The boundary

```
apps/web  ──HTTP/JSON──▶  apps/api  ──Drizzle──▶  packages/db  ──▶  SQLite
```

Traffic flows one way through that chain. Specifically:

- **`apps/web` never touches the database.** No `bun:sqlite`, no Drizzle queries,
  no SQL. It imports `@leaseops/db` for *types only* — that import must never
  pull runtime database code into the client bundle.
- **`apps/api` never renders UI.** No JSX, no HTML templates, no client state.
- Neither app redefines a database model. Types come from `@leaseops/db`.

## Shared contract

The API shape is the contract between the two apps. When you change a route's
request or response:

1. Update the Zod validator in `packages/db/src/validators/` if the payload is
   database-shaped, or inline in the route if it is request-specific.
2. Update the calling hook in `apps/web/src/lib/`.
3. Run `bun run typecheck` from the root — it checks all three workspaces
   together and is how a mismatch surfaces.

Route handlers return `c.json(data, status)`. The web client's `apiFetch` throws
on non-2xx, so error paths are exceptions in the UI, not sentinel values.

## Ports and env

| App | Dev port | Notes |
| :--- | :--- | :--- |
| `api` | 3000 | `PORT` env var |
| `web` | 5173 | Vite proxies `/api` → `:3000` |

The web client calls relative `/api/...` paths only. There is no configurable API
base URL, and there should not be: in production `apps/api` serves the built
`apps/web/dist` itself (`api/src/services/static.ts`), so the two are one origin
and one container. That is what keeps the session cookie first-party and makes
CORS irrelevant in production — do not introduce a build-time API base URL to
split them back apart.

Both apps' `dev` and `start` scripts pass `--env-file=../../.env`. Preserve that
flag if you edit the scripts — see the root `CLAUDE.md` for why.

## Adding a feature that spans both

Work in this order; it fails fast at the cheapest point:

1. `packages/db` — schema change + migration + validator, if data shape changes
2. `apps/api` — route + service, with a test
3. `apps/web` — hook + view

Do not shortcut step 1 by defining the type in the app that needs it first.
