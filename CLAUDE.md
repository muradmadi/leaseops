# LeaseOps — Project Instructions

Self-hosted PWA that treats apartment listings as inbound sales leads: scrape a
listing URL → extract structured data via LLM → score it against user-weighted
criteria (MCDA) → route to qualified/disqualified → auto-draft landlord outreach.

Version 1.0.0 · AGPL-3.0 · single-user, self-hosted.

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
Without `SCRAPFLY_API_KEY`, adding a listing fails and is saved as `ERROR`.

## Known gaps (do not "discover" these as bugs)

- **Single-user auth.** One username/password from env, server-side sessions.
- **No production Docker image.** `docker-compose.yml` runs the dev server with
  source bind-mounted.
- **Outreach drafts end with a name placeholder.** `TenantPersona` has no name field.
- **Soft dealbreakers do not force disqualification.** A 0–1 rating on a weight-5
  feature is reported but does not by itself disqualify. This is deliberate and
  asserted in `apps/api/src/services/mcda.test.ts`. Do not "fix" it to match a
  stricter reading of the product description — change the test first if the
  product decision genuinely changes.
- **Manual ratings silently override listing evidence.** A user rating beats
  extracted data in scoring, while the AI review still reads the listing, so the
  two can disagree. Open design question, not a defect.

## When docs and code disagree

These `CLAUDE.md` files and the test suite are authoritative. If a comment,
README line, or product description contradicts a passing test, assume the test
is right and the prose has drifted — then fix the prose.
