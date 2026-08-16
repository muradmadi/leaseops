# apps/api — Backend API

Hono + Bun REST API. Handles HTTP routing, the scraping/enrichment pipeline,
MCDA scoring, and all LLM work. Root `../../CLAUDE.md` and `../CLAUDE.md` apply.

## Layout

```
src/index.ts          App assembly, middleware, auth mounting, Bun.serve config
src/routes/           One router per domain: apartments, auth, profiles, health
src/services/
  scraper.ts          Enrichment pipeline: score, route, enrich
  mcda.ts             Pure scoring engine (no I/O — keep it that way)
  features.ts         Canonical feature catalogue + evaluation builder
  llm.ts              LLM calls: analysis, outreach, chat reply (compromise is free)
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
  1. buildListingFromInput()       → ApartmentListing from the form
  2. buildFeatureEvaluations()     → ratings per weighted feature
  3. calculateMcdaScore()          → score + QUALIFIED/DISQUALIFIED
  4. persist score + status + evaluations, then emit  ← before any LLM work
  5. QUALIFIED   → AI review, then enrichQualifiedLead()
     DISQUALIFIED→ compromise summary (free), no outreach spend
  6. persist the review in a second write, emit again
```

**There is no scraping and no HTML.** Listings are typed in and the description is
pasted. That description is still landlord-authored and therefore untrusted: it
reaches the LLM only inside `<UNTRUSTED_LISTING_CONTENT>` and is rendered as text.

**Blank means "not stated", never a default.** `buildListingFromInput` keeps
unfilled fields `null` so nothing the user did not supply enters scoring.

**Persist the score, not just the status.** `mcdaScore` and `featureScores` must
be written alongside `status`. A past bug computed the score and saved only the
status, so the UI showed 0%.

**Write the score before the LLM, not with it.** The two writes are deliberate.
Scoring is arithmetic and finishes in microseconds, but it used to share one
write with the AI review at the end of the chain — so a qualifying listing sat
unscored for as long as that call took, and the *calculation* looked slow when
what you were waiting for was a model. The first write carries score and status
together (never one without the other); the second carries only what the model
produced, and deliberately omits `status` and `mcdaScore` so a failed review
cannot blank a good score. `scored` guards the error path for the same reason.

**Declare pipeline state at function scope.** The original bug here was
`evaluations` declared inside an inner `try` and read after it — a `ReferenceError`
that made *every* listing land on `ERROR`. `scraper.test.ts` guards this; do not
weaken those assertions.

## The feature catalogue

`FEATURE_NAMES` in `services/features.ts` mirrors
`apps/web/src/lib/preferenceMatrixData.ts` by hand. `features.test.ts` reads the
web file and fails on any drift in ids or labels — keep both in step.

Two rules govern what belongs in the matrix:

1. **Only ordinal preferences.** A 1-5 weight means "more is always better". Floor
   area, bedroom and bathroom counts are not that — 120 m² can be worse than 70 —
   so they are collected as figures in `spaceRequirements`, not weighted.
2. **Only what the tenant cannot change.** Plumbed, built-in or expensive things
   belong (fridge, dishwasher, hot water, extraction). A microwave does not.

## Scoring rules

The score is computed in two stages, because it answers two different questions:

```
base    = Σ(rating × weight) / Σ(5 × weight) × 100        compensatory
penalty = Π (1 - 0.45 × severity_i)  over weight-5 features rated < 3
total   = base × penalty                                  non-compensatory
severity = (3 - rating) / 3
```

Rent joins the weighted mean as a criterion at `VALUE_WEIGHT`: 5/5 at or below
`idealRent`, tapering to 0 at `maxRent`. It is **exempt from the critical
penalty** — the budget ceiling is already price's hard gate, and penalising a flat
for sitting just under it would punish the same fact twice. With no `idealRent`
set, value scoring is skipped rather than measured against an invented target.

Qualifies at **total ≥ the household's `qualifyingThreshold`** *and* within
`maxRent`. `DEFAULT_QUALIFYING_THRESHOLD` in `mcda.ts` is only the fallback for a
profile that has none; it must not be copied into a route — it was literal `70` in
two places and they could drift.

## The four axes

A listing carries four independent facts, and collapsing any two of them loses
information:

| field | question it answers | who sets it |
| :--- | :--- | :--- |
| `status` | how well does it match? | the score |
| `isActive` | are we chasing it? | qualifying, or Activate |
| `pipelineStage` | how far did the conversation get? | **you, by hand** |
| `setAsideReason` | why did you overrule the score? | **you, by hand** |
| `archivedAt` | is it still on the board? | delete / restore |

`setAsideReason` moves a qualifying listing into the yellow zone and **must not**
touch `status` or `mcdaScore` — the same rule as Activate, in reverse. A score
answers "does it match your stated criteria"; it cannot answer "the stairwell
smelled of damp". Both facts have to survive, so the card shows the real
percentage next to your reason. The reason *is* the flag (non-null means set
aside), so there is no boolean to drift out of step, and it is required: a
demotion you cannot explain is one you will not understand next week.

`pipelineStage` runs `NOT_CONTACTED → OUTREACH_SENT → IN_CONVERSATION →
VIEWING_BOOKED → WON | LOST`. **Nothing advances it automatically.** Auto-advancing
on "draft copied" was considered and rejected: a board that moves itself stops
being a record of what you did, and it is wrong the moment you send from your own
mail client. `WON`/`LOST` are stored separately rather than as a flag on a single
`DECIDED` stage so the outcome cannot go missing.

## Status vs. pursuit

`apartments.status` is the **measurement** and `apartments.isActive` is the
**decision**. They are separate on purpose:

- Qualifying sets `isActive` automatically, because the pipeline already spends
  LLM budget on a review and an outreach draft there.
- `PATCH /:id/active` on a listing that fell short releases that withheld spend
  via `enrichQualifiedLead(..., { requireQualified: false })`.
- Activating **never** rewrites `status`. Choosing to chase a flat does not make it
  qualify, so it stays in the bucket its score put it in, flagged as active. Do not
  "fix" this by promoting activated listings to QUALIFIED — the score would stop
  meaning anything.

Only features weighted ≥4 are scored, plus any the user rated explicitly. An
unrated feature counts **3/5 — unknown, not passing**. It was 4, which made an
unassessed listing score 80% and qualify.

### Derived criteria

The figures collected as numbers become ordinary evaluations so the engine needs
no special cases (`buildSpaceEvaluations`, `buildRoomQualityEvaluation`):

| id | weight | behaviour |
| :--- | :--- | :--- |
| `__floorArea` | 5 | 3 at the minimum, 5 at the maximum, tapers back to 3 above it, **squared** decay below the minimum |
| `__bedrooms` / `__bathrooms` | 5 | 3 at the minimum, 5 at the ideal, no taper above |
| `__roomQuality` | 4 | mean of the per-room impressions |

**3 is the hinge, and it is exactly `CRITICAL_FLOOR`.** Meeting a stated minimum
passes with no penalty; falling under it slides into the existing non-negotiable
penalty with no extra machinery. Keep that alignment — if `CRITICAL_FLOOR` moves,
these curves must move with it.

Decay below a minimum is **squared, not linear**. Linear made a flat 15 m² under a
40 m² minimum rate 1.9 and still qualify.

`__roomQuality` is weight 4 deliberately: a subjective impression from photos must
drag the mean without being able to trigger the non-negotiable penalty. It is
averaged rather than scored room by room because the user never weighted the rooms
against each other, so five criteria would let decor outvote their real priorities.

**Do not collapse this back into one weighted mean.** That is what it used to be,
and it had the property that declaring *more* non-negotiables made each one matter
*less* — a feature rated 0/5 scored 66.7% against three criticals and 95% against
twenty. The penalty is multiplicative so it costs the same fraction at any list
length, compounds across violations, and cannot push the score negative.

`McdaScoreResult` carries `baseScore`, `penaltyFactor`, `pointsLostToCriticals`
and `criticalShortfalls` so the compromise summary can attribute every lost point
to a named feature. Keep it that way — an unexplainable score is a fabricated one.

Rating precedence in `buildFeatureEvaluations`:

1. Explicit user rating (add-listing modal or post-viewing)
2. `neutralRating` (default 4, "assume it passes until we learn otherwise")

That is the whole list. A middle step once derived ratings from amenities on the
listing form; it was removed because it could never apply — the modal rates every
feature weighted 4 or 5 and an explicit rating outranks evidence. Do not add size
or room-count heuristics either: whether 45 m² is "good" is a judgement the user's
own figures already express.

The price the user entered is the only price, so the budget check uses it
directly. It must never run against 0.

## LLM conventions

One provider — Anthropic — reached only through `services/anthropic.ts`. No LLM
function may build its own HTTP call.

**Every call is billed to a household.** The credential comes from the
`households` row, not the environment, so each LLM function takes an
`LlmCredentials` (`LlmConfig | null`) as its **first** parameter. Resolve it with
`await resolveLlmConfig(householdId)` and pass it down — required rather than
optional precisely so the compiler catches a new call site that forgot. `null`
is the offline case: the test suite, or a household with no key.

Take the `householdId` from the session (`c.get('householdId')`) in a route, or
from the record you already hold in background work — `ensureAiReview` and
`maybeAutoDraftOutreach` read `apartment.householdId`, so fire-and-forget
enrichment cannot bill the wrong household.

**The model comes with the config.** `LlmConfig.model` is whatever the household
picked, validated against Anthropic's live catalogue (`listAvailableModels`) when
it was set. Never hardcode a model id in a call — and if you add a request
parameter that only some models support, add it to the capability filter in
`listAvailableModels` too, or the picker will offer a model that breaks on use.

Every LLM function follows the same shape, and new ones must too:

1. Put the **stable** instructions in a module-scope `const` and pass them as
   `system`. That block is sent with `cache_control: { type: 'ephemeral' }`, so
   it must be byte-identical between calls or the cache misses. Interpolating a
   listing, a persona or a language into it silently costs full input price on
   every request.
2. Put everything **volatile** in the `user` turn: the listing text, the persona
   facts, the language, the requirements. Untrusted text goes through
   `untrustedBlock()`, which is also why it belongs here rather than in `system` —
   landlord-authored prose must never sit in the same block as our instructions.
3. Check `if (!credentials)` → return a **deterministic offline result derived
   from real data**, never invented filler.
4. Call `completeJson({ config: credentials, system, user, schema, effort,
   maxTokens })`. `config` carries the household's key and chosen model. The
   schema is a JSON Schema with `additionalProperties: false`, enforced by the
   API rather than hoped for; `completeJson` returns `null` on a refusal or a
   malformed body.
5. Validate the parsed object against a Zod schema anyway — the API guarantees the
   shape, not that the contents are usable.
6. `catch` → fall back to the offline result rather than throwing to the user.

`effort` is `'low'` for drafting work. Thinking is on by default, and `maxTokens`
caps thinking **plus** response together, so leave real headroom — a tight
`maxTokens` truncates the answer rather than the reasoning.

## Outreach

`draftOutreachMessage` writes as **the tenant**, not as a copywriter. Two grounded
inputs and nothing else: the requirements this listing states (taken from the
analysis `flags`) and the facts the tenant actually supplied.

- **Responding to a stated requirement is the point.** "You ask for a bank
  guarantee — I can provide one" cannot be copy-pasted to another listing, which
  is why it reads as real. Generic praise can, which is why it does not.
- **Never default a persona field.** An earlier version filled blanks with
  "No pets, non-smoker" and "Stable professional", sending invented claims about a
  real person to a real landlord. Blank means blank.
- **Never claim an unmet requirement is met.** Where the owner would find out
  anyway (pets, self-employment, household), the draft states the true position
  and leads with a compensating fact instead.
- Employment details stay first-person singular — the model otherwise gave the
  partner the same job and salary.
- **A condition travels with its fact.** Income that depends on a pending visa or
  probation must carry that condition in the same breath; a future salary quoted
  bare reads as invention, and the condition usually explains the number.
- **Never resolve the tenant's ambiguity into a legal term.** "Permanent contract,
  for 1 year" must not become "contrato indefinido" — an owner checks that against
  the document, and a wrong guess surfaces exactly when trust matters.
- **Grammatical gender is asked, never inferred.** Spanish, German and French
  cannot write "I live alone" without it. Each member answers at signup (male /
  female / other, with a follow-up asking how to word it when they pick other),
  and `resolveWritingForm` in `signoff.ts` turns that into `masculine`,
  `feminine` or `neutral`. Unanswered stays unanswered: the draft rephrases
  around the question rather than defaulting to the masculine.
  - Never derive it from the display name. "Alexis" is unresolvable, and being
    wrong misgenders the sender in their own letter.
  - The **profession is the strongest wrong signal** — the model wrote
    "enfermera" and "vivo sola" for a member listed as masculine, and applied
    the masculine instruction to the dog instead. `HOW TO WRITE ABOUT EACH
    PERSON` therefore sits **last** in the user turn, after the facts that
    invite the assumption; moving it back above them reintroduces the bug.
  - `gender` and `grammaticalForm` are two columns but cannot disagree: the
    second is stored only for `other` and derived otherwise, enforced in the
    route and asserted in `signoff.test.ts`.
- Visa and right-to-work status is material and is never dropped for brevity.
- `language` is filled from our own variable before validation. It used to have to
  be echoed back by the model, so one missing field threw and destroyed the draft.
- **The first message asks no questions.** Its only job is to get you seen in
  person, and every question is a reason to reply later instead of booking now.
  Anything about cupboards, appliances or fittings is answered by standing in the
  flat. `analyseListing` still returns `unknowns` — they are a viewing checklist
  shown in the app, not something to put in front of a landlord screening forty
  applicants.
- No compliments about the property, no filler closings, no self-describing
  adjectives, under 110 words.
- The sign-off is appended in code if the model drops it, using the real household
  name only.

## Where credits go

**One analysis per listing you pursue, and nothing else.**

| Event | LLM calls |
| :--- | :--- |
| Listing falls short | **0** — the compromise summary is pure arithmetic |
| Listing qualifies | 2 — `analyseListing` + `draftOutreachMessage` |
| You press Activate | 2 — the same pair, released on demand |
| You ask for a chat reply | 1 |
| You edit a listing | **0** — re-scoring is arithmetic; the review is carried over |

`generateCompromiseSummary` **must not call a model**. It used to, on every
rejected listing, to reword a sentence already assembled in code — the majority of
listings, paying for prose nobody asked for.

`analyseListing` is the only review function, and it does **one** job: read the
listing description. It returns `{ flags, unknowns, analysed }` and nothing else.

- **Never ask it for a verdict, strengths, concerns or a summary.** Those are pure
  restatement of the score, so `deriveHighlights` in `mcda.ts` computes them for
  free and stores them at `featureScores.highlights`. A model asked to reword
  arithmetic costs a call, can only embellish, and made the prompt do five jobs
  badly instead of one well.
- `flags` are conditions stated in the text that a feature matrix cannot represent
  — minimum stay, aval, agency fees, no empadronamiento. This is the whole reason
  the call exists.
- **Every flag must quote the listing verbatim**, and a quote not actually present
  in the description is dropped in code before it reaches the user.
- `unknowns` are drawn only from features weighted ≥4 that the user has **not**
  rated, and anything outside that list is discarded. Asking about a feature they
  already assessed is noise.
- No quotas. Empty arrays are correct. The version before this demanded exactly
  three cons, invented trade-offs for flats that had none, and asserted things
  about neighbourhoods and "comparable listings" from data this app never held.

**Personas may be plain text.** Onboarding writes JSON, but stored values can be
prose. Always use `resolvePersona()` from `qualification.ts` — a bare
`JSON.parse` in a try/catch silently yields an empty persona, which made every
outreach draft generic for months.

## Gotchas

- **Tests share the development database.** There is no separate test DB. Tests
  create real rows in `packages/db/local_leaseops.db` — always clean up in
  `afterAll`, and expect leftovers if a run is interrupted.
- **Tests must own a throwaway household.** Use `createTestAccount()` from
  `src/test-support.ts`, and call its `cleanup()` in `afterAll` — deleting the
  household cascades to its users, sessions, apartments and messages. Never write
  under an account a real person might be using. Two bugs came from ignoring this:
  `profiles.test.ts` deleted the live `admin` profile on every run, and
  `scraper.test.ts` inherited the real user's `maxRent`, so the suite failed
  whenever that sat below the mock listing's price of 1350.
- **LLM calls short-circuit in tests.** `resolveLlmConfig` returns `null` outright
  when `NODE_ENV=test`, and a household with no key resolves to `null` too, so
  every LLM function returns its deterministic offline result and tests need no
  network. Test call sites pass `null` explicitly.
- **SSE needs a heartbeat.** `Bun.serve` has `idleTimeout: 60` set in
  `index.ts`, and `/sse` writes a ping every 15s. A silent sleep loop is not
  enough — the socket must receive bytes or the stream dies and the dashboard
  stops updating live.
- **Route order matters in Hono.** `/sse` and `/proxy-image` are registered
  before `/:id`, otherwise they are captured as an id.
- Background work fired from a handler must have its own `.catch` — an unhandled
  rejection there is invisible.
