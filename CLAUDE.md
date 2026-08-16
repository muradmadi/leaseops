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
| `bun test` | Full suite (47 tests) |
| `bun run typecheck` | Typecheck all three workspaces |
| `bun run build` | Production build |
| `bun run db:migrate` | Apply Drizzle migrations |

**Verification gate.** Before claiming any change is done, all three must pass:

```bash
bun run typecheck && bun test && bun run build
```

Typecheck alone is not sufficient — Bun transpiles TS without checking types, so
a type error is a *runtime* error here, not just a lint warning.

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
will not load**, API keys will appear unset, and every LLM feature silently falls
back to its offline generator. This looks like a bug and is not one.

Without an LLM key the app is fully functional with deterministic offline output.
Listings are entered by hand — there is no scraping and no API key needed to add one.

## Known gaps (do not "discover" these as bugs)

- **No password reset.** No email exists in the system; recovery is "make a new
  account, rejoin with the household code".
- **No per-member permissions.** Anyone holding a household's code has full access.
- **No production Docker image.** `docker-compose.yml` runs the dev server with
  source bind-mounted.
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
