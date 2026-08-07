# apps/api — Backend API

Hono + Bun REST API. Handles HTTP routing, the scraping/enrichment pipeline,
MCDA scoring, and all LLM work. Root `../../CLAUDE.md` and `../CLAUDE.md` apply.

## Layout

```
src/index.ts          App assembly, middleware, auth mounting, Bun.serve config
src/routes/           One router per domain: apartments, auth, profiles, health
src/services/
  scraper.ts          Ingestion pipeline orchestrator
  scrapfly.ts         Anti-bot bypass — URL in, raw HTML out
  extractor.ts        LLM: raw HTML → normalized ApartmentListing JSON
  mcda.ts             Pure scoring engine (no I/O — keep it that way)
  features.ts         Canonical feature catalogue + evaluation builder
  llm.ts              All LLM calls: review, outreach, chat reply, compromise
  qualification.ts    Post-qualification chain + persona resolution
  auth.ts             Credential check + requireAuth middleware
  events.ts           In-process EventEmitter backing the SSE stream
```

Tests live beside their subject as `*.test.ts`.

## The ingestion pipeline

`POST /api/apartments` returns **202 immediately** and runs the work in the
background. Never make it await the pipeline — scraping plus extraction takes
10–30s.

```
processListingAsync()
  1. scrapeListingWithScrapfly()   → raw HTML
  2. extractListingFromHtml()      → structured JSON
  3. buildFeatureEvaluations()     → ratings per weighted feature
  4. calculateMcdaScore()          → score + QUALIFIED/DISQUALIFIED
  5. QUALIFIED   → AI review, then enrichQualifiedLead()
     DISQUALIFIED→ compromise summary, no outreach spend
  6. persist everything in ONE updateApartmentEnrichment call
  7. globalEvents.emit('apartmentUpdated') so the UI refreshes over SSE
```

**Persist the score, not just the status.** `mcdaScore` and `featureScores`
(evaluations + result + compromise) must be written alongside `status`. A past
bug computed the score and saved only the status, so the UI showed 0%.

**Declare pipeline state at function scope.** The original bug here was
`evaluations` declared inside an inner `try` and read after it — a `ReferenceError`
that made *every* listing land on `ERROR`. `scraper.test.ts` guards this; do not
weaken those assertions.

## Scoring rules

Score = `Σ(rating × weight) / Σ(5 × weight) × 100`. Qualifies at **≥70** *and*
within `maxRent`. Only features weighted ≥4 are scored, plus any the user rated
explicitly.

Rating precedence in `buildFeatureEvaluations`:

1. Explicit user rating (onboarding modal or post-viewing)
2. Evidence derived from extracted listing data — **only unambiguous booleans**
   (elevator, dishwasher, balcony, A/C, furnished). Do not add size or room-count
   heuristics: whether 45 m² is "good" is a judgement the user's own rating expresses.
3. `neutralRating` (default 4, "assume it passes until we learn otherwise")

Budget checks must never run against a price of 0 — pass the user-entered price
as `fallbackPrice` so a listing whose price failed to extract cannot qualify by
accident.

## LLM conventions

Every LLM function follows the same shape, and new ones must too:

1. Build the prompt with `buildSecureSystemPrompt(instruction, untrustedText)`.
2. Check `NODE_ENV === 'test' || !apiKey` → return a **deterministic offline
   result derived from real data**, never invented filler.
3. Call DeepSeek with `response_format: { type: 'json_object' }`.
4. Parse and validate against a Zod schema.
5. `catch` → fall back to the offline result rather than throwing to the user.

`generateCompromiseSummary` is stricter: it derives sacrifices arithmetically
from the MCDA result and the LLM may only rewrite them as prose. The returned
`sacrifices` array is always the measured one, never the model's.

**Personas may be plain text.** Onboarding writes JSON, but stored values can be
prose. Always use `resolvePersona()` from `qualification.ts` — a bare
`JSON.parse` in a try/catch silently yields an empty persona, which made every
outreach draft generic for months.

## Gotchas

- **Tests share the development database.** There is no separate test DB. Tests
  create real rows in `packages/db/local_leaseops.db` — always clean up in
  `afterAll`, and expect leftovers if a run is interrupted.
- **Test doubles are triggered by data, not mocks.** `NODE_ENV=test`, a URL
  containing `example-`, or HTML containing `Mock Listing Title` makes Scrapfly
  and the extractor return fixtures. That is why tests need no network.
- **SSE needs a heartbeat.** `Bun.serve` has `idleTimeout: 60` set in
  `index.ts`, and `/sse` writes a ping every 15s. A silent sleep loop is not
  enough — the socket must receive bytes or the stream dies and the dashboard
  stops updating live.
- **Route order matters in Hono.** `/sse` and `/proxy-image` are registered
  before `/:id`, otherwise they are captured as an id.
- Background work fired from a handler must have its own `.catch` — an unhandled
  rejection there is invisible.
