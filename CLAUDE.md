# LeaseOps — Project Instructions

Self-hosted PWA that treats apartment listings as inbound sales leads: enter a
listing by hand → score it against user-weighted criteria (MCDA) → route to
qualified/disqualified → auto-draft landlord outreach.

Version 1.0.0 · AGPL-3.0 · self-hosted, household-scoped.

## Households own everything

A **household** is the unit of ownership: the criteria, the pipeline, the outreach
threads. `users` are only credentials pointing at one, so two partners sharing a
household see an identical dashboard from any device.

- Every query that reads or writes user data scopes to `householdId`, and that id
  comes from the session (`c.get('householdId')`) — **never** from a request body
  or query parameter.
- Route handlers use `findApartmentForHousehold`. `findApartmentByIdUnscoped`
  exists only for background work that already holds a trusted id.
- **Only the user's own ratings drive scoring.** There is no evidence-derivation
  step: the add-listing modal asks for a rating on every feature weighted 4 or 5,
  and anything unrated falls back to a neutral 4. Do not reintroduce a path that
  infers ratings from the listing text — an explicit rating always won anyway, so
  it only ever produced inconsistency.
- Passwords are hashed with `Bun.password` (argon2id). Never return a `User` row
  straight from a route — use `toPublicUser`.
- The household join code is a secret granting full access. It is rotatable and
  must never be logged.
- **The Anthropic API key is per household**, stored on the `households` row and
  set in Settings. The member who adds it pays for everyone. Never return a
  `Household` row straight from a route — use `toPublicHousehold`, which strips
  the key and leaves only metadata (last four characters, who set it, when).
  Never log it. Resolve it with `resolveLlmConfig(householdId)`; a `null` result
  means offline, which is a normal state, not an error.

## Monorepo layout

```
packages/db/   Drizzle schema, migrations, repositories, Zod validators.
               Source of truth for ALL types.
apps/api/      Hono REST API: scraping, LLM workers, MCDA engine.
apps/web/      React 19 + Vite PWA.
```

Each directory has its own `CLAUDE.md` with local rules. Read the one for the
area you are working in.

## Commands

Run from the repo root. `just <recipe>` and `bun run <script>` are equivalent.

| Command | Purpose |
| :--- | :--- |
| `bun install` | Install all workspace dependencies |
| `bun run dev` | API on :3000, web on :5173, both watching |
| `bun test` | Full suite (201 tests) |
| `bun run typecheck` | Typecheck all three workspaces |
| `bun run build` | Production build |
| `bun run db:migrate` | Apply Drizzle migrations |

**Verification gate.** Before claiming any change is done, all three must pass:

```bash
bun run typecheck && bun test && bun run build
```

Typecheck alone is not sufficient — Bun transpiles TS without checking types, so
a type error is a *runtime* error here, not just a lint warning.

## Deployment

Production is **one container on one origin**: the API process serves `/api` and
the built PWA together (`apps/api/src/services/static.ts`). Keep it that way —
splitting them puts the session cookie cross-site and drags CORS back in.

```bash
docker compose -f docker-compose.prod.yml up -d --build   # not docker-compose.yml
./docker/backup.sh                                        # VACUUM INTO, WAL-safe
```

Things that are easy to break:

- **`NODE_ENV=production` turns off the auto-migrate** in `packages/db/src/client.ts`,
  so `docker/entrypoint.sh` runs migrations before exec'ing the server. It calls
  `bun run packages/db/src/migrate.ts` by path, *not* the workspace script — that
  script passes `--env-file=../../.env`, a file the image deliberately lacks.
- **The published port defaults to `127.0.0.1`.** Docker's iptables rules are
  written ahead of UFW, so binding `0.0.0.0` exposes the app on every interface
  and lets anyone who can reach the VM bypass the tunnel and Cloudflare Access.
- **`ALLOW_SIGNUP` unset means "open until the first account exists".** A fresh
  deployment can create exactly one household and then closes itself. Joining an
  existing household is never gated — it already requires the join code.
- **The volume is as sensitive as `.env`** (plaintext Anthropic keys). Copying
  the `.db` alone is not a backup: WAL mode keeps recent writes in a sibling
  file. Use `docker/backup.sh`, and `backups/` is gitignored.

**`docker/import-db.sh` must stay remote-daemon-safe.** It splits into
`--prepare` (needs bun and the source database) and `--install` (needs only
docker), so it can cross a machine boundary, and every Docker operation is a
named-volume command or `docker cp` — both executed by the daemon on its own
host. **Never add a bind mount of a local path to it:** with `DOCKER_HOST` set to
a remote machine, `-v /local/path:/x` silently resolves on the *server* and
mounts the wrong directory instead of failing. It also uses `docker stop`, not
`docker compose stop`, because Dokploy names the compose project itself.

**Moving data between instances moves the database file**, never a serialisation
format. Same engine, same schema, same migrations, so the file *is* the export.
Two supported routes, and they share all their validation logic:

- `docker/import-db.sh` — from a shell, for someone with Docker access.
- `POST /api/auth/import` — upload the `.db` from the login screen, so a
  migration needs no server access at all.

**Do not add a JSON export/import format.** It would re-implement what SQLite
does correctly and get to be wrong about integer timestamps, the JSON-encoded
columns, FK ordering and id collisions. Note the asymmetry: **there is an import
and deliberately no export endpoint**, because a route that serialises the
database is a route that serves every household's plaintext Anthropic key.
Getting data *out* is a file you already have.

### The import endpoint is the most dangerous route in the app

It is unauthenticated and it deletes every row. What makes that acceptable is
one gate: it works **only while `countUsers() === 0`** — the same window in which
a stranger could simply sign up and own the instance anyway. Rules for touching
it:

- The zero-users check runs **twice**, once before reading the upload and once
  after, because a large upload takes time and an account may appear during it.
- There is **no flag to reopen it**. Once any account exists — including one
  created by the import itself — it is a permanent 409. Do not add an override;
  a populated instance restores from `docker/backup.sh` on the server.
- The uploaded file is untrusted input handed to SQLite. `validateImportCandidate`
  compares the candidate's **full schema fingerprint** against the live one, which
  is what rejects a file carrying injected triggers or views. Weakening that check
  to "has the right tables" reopens that hole.
- **A `.db` without its `-wal` is stale, and nothing can detect that.** WAL mode
  keeps recent writes in the sibling file, so the database alone is a valid,
  consistent snapshot of an earlier moment — it passes the integrity check and
  the fingerprint identically. This shipped once and imported deleted test
  fixtures onto a real server. Two things guard it now, and both must stay: the
  endpoint accepts an optional `wal` upload (`foldWalIntoDatabase` replays it),
  and **the inspect step reports household and account names** so a person can
  recognise data that is not theirs. Do not collapse inspect-then-confirm into a
  single call; the human read is the only real check.
- `importDatabaseFile` and `validateImportCandidate` take the target `Database`
  as an argument. **Keep it that way.** Tests run against the developer's real
  database, and a version that hardcoded the singleton would erase the pipeline
  of whoever ran `bun test`. The happy path is only ever tested against temporary
  databases in `packages/db/src/repository/import.test.ts`.

## Absolute constraints

1. **Bun only.** Never use Node, npm, pnpm, yarn, npx, or Python. Use `bun run`,
   `bun install`, `bunx`, and native Bun APIs.
2. **Never redefine database types.** Import inferred Drizzle types
   (`$inferSelect` / `$inferInsert`) from `@leaseops/db`. No hand-written
   interfaces mirroring table shapes.
3. **Never bypass Zod validation** on any route accepting input.
4. **Never trust scraped listing text.** It is attacker-controlled. Wrap it in
   `<UNTRUSTED_LISTING_CONTENT>` for LLM prompts; render it as text, never as
   HTML (no `dangerouslySetInnerHTML`).
5. **Never hardcode secrets.** Read from `Bun.env`; never expose to the client bundle.
6. **Ask before deleting files or dropping tables.**

## The no-fabrication rule

This is a decision-support tool. A plausible-looking invention is worse than a
blank space, because the user cannot tell the difference.

- No placeholder photos, sample pros/cons, or filler recommendations. If data is
  missing, render an explicit empty state.
- Compromise summaries must restate *measured* shortfalls from the MCDA result.
  An LLM may rewrite those facts as prose but must never introduce a new one.
- If nothing measurable is wrong with a listing, say so — do not manufacture a
  trade-off to fill the section.

This rule has been violated before and was expensive to find. Preserve it.

## Environment

Copy `.env.example` → `.env`. It documents exactly the variables the code reads;
keep it in sync when you add or remove one.

Both API scripts pass `--env-file=../../.env` explicitly. If you launch the API
some other way (e.g. `bun run src/index.ts` from `apps/api`), **the root `.env`
will not load** — which now only affects `DATABASE_URL`, `PORT` and CORS.

**The Anthropic key is not an environment variable.** It is stored per household
and set in Settings → AI & billing. `ANTHROPIC_API_KEY` in `.env` is read only to
offer a one-click import into a household; nothing reads it at request time, and
the API logs a line at startup saying so if it is still set. `ANTHROPIC_MODEL` is
gone entirely — the model is a household setting beside the key.

**The model list is not hardcoded.** It comes from Anthropic's Models API using
the household's own key, filtered to models supporting `structured_outputs` and
`effort` — both of which `completeJson` sends on every call, so anything else
would fail on first use. A new model therefore appears in Settings with no code
change. Pricing is the exception: the Models API does not return it, so
`KNOWN_RATES` in `services/anthropic.ts` holds published rates and a model absent
from it shows **no** rate rather than a guessed one. Adding a row is optional.

Without a household key the app is fully functional with deterministic offline
output. Listings are entered by hand — there is no scraping and no API key needed
to add one.

## Known gaps (do not "discover" these as bugs)

- **No password reset.** No email exists in the system; recovery is "make a new
  account, rejoin with the household code".
- **No per-member permissions.** Anyone holding a household's code has full
  access — including replacing or removing the household's Anthropic key.
- **The household's API key is stored in plaintext** in the SQLite file.
  Encrypting it needs a decryption key that background enrichment can reach,
  which means `.env` — exactly what moving the key into the database removes. The
  threat model matches `.env`'s, but it makes `.db` backups as sensitive as
  `.env`. Both are gitignored. Deliberate, not an oversight.
- **Leaving a household clears its key if you were the one paying.** Any other
  member leaving does not. The household drops to offline output rather than
  quietly spending a credential its owner no longer controls.
- **`docker-compose.yml` is the development stack** and runs the dev server with
  source bind-mounted. Production is `Dockerfile` + `docker-compose.prod.yml`;
  the two are unrelated and only the latter is hardened.
- **The outreach sign-off is derived, never typed.** It is rebuilt on every draft
  from the household members' display names, joined by a conjunction in the target
  language (`apps/api/src/services/signoff.ts`) — "Murad und Paulie" in German,
  "Murad y Paulie" in Spanish. There is no `signOffName` field; do not reintroduce
  one. With no usable names the draft ends after the valediction — it must never
  invent a name or emit a `[Your Name]` placeholder.
- **Soft dealbreakers penalise heavily but are not a hard veto.** A weight-5
  feature rated below 3 multiplies the score by up to 0.55 (see
  `MAX_PENALTY_PER_CRITICAL`). At the default 70% threshold a 0/5 cannot survive
  and a 1/5 will not either, but the listing is still scored and still shown with
  its reason rather than hidden. Deliberate, and asserted in
  `apps/api/src/services/mcda.test.ts`.
- **Manual ratings silently override listing evidence.** A user rating beats
  extracted data in scoring, while the AI review still reads the listing, so the
  two can disagree. Open design question, not a defect.

## When docs and code disagree

These `CLAUDE.md` files and the test suite are authoritative. If a comment,
README line, or product description contradicts a passing test, assume the test
is right and the prose has drifted — then fix the prose.
