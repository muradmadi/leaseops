# LeaseOps Roadmap

**Nothing on this page is built.** It is a record of intent, not a description of
the system. For how LeaseOps actually behaves today, read the `CLAUDE.md` files
and the test suite — those are authoritative.

Items are grouped by theme, not priority. Where partial scaffolding already
exists in the codebase it is called out, because that is usually the cheapest
place to start.

---

## Pipeline: negotiation as a first-class stage

Today the dashboard has two buckets — *Meeting Criteria* and *Not Perfectly
Meeting Criteria* — and a listing's life ends at qualification. In practice the
interesting work starts after that: you message a landlord, they reply, you
negotiate, you view the flat.

The intended shape is three operational tiers:

```
🟢 Qualified leads      — scored, outreach drafted, not yet contacted
🟡 Active negotiations  — landlord contacted or replied; awaiting your move
⚪ Disqualified         — below threshold or over budget, muted but not hidden
```

**Work involved**

- Add `NEGOTIATING` to the apartment status enum
  (`packages/db/src/schema/apartments.ts`) plus a migration. Current values:
  `UNPROCESSED | QUALIFIED | DISQUALIFIED | ARCHIVED | ERROR`.
- Transition a listing on "Mark Reached Out" rather than leaving it `QUALIFIED`.
- Split `DashboardView` into three sections; disqualified renders muted
  (`opacity-70`, grayscale thumbnails) rather than being filtered away.

**Open question:** what moves a listing *out* of negotiating — an explicit user
action, or inferring it from the message log? Explicit is simpler and probably
correct for a single-user tool.

## Negotiation sentiment tracking

Show, on a negotiating lead, whether the landlord reads as eager, guarded, or
already backing out, so a stalled thread is visible without rereading it.

**Scaffolding already present:** `SentimentAnalysisSchema` is defined at
`apps/api/src/services/llm.ts:30` — sentiment enum, confidence, up to three
suggested replies — and is currently imported by nothing. The shape is decided;
only the analysis function, a persistence field, and the UI surface are missing.

**Caution:** sentiment is an inference, not a measurement. It must be presented
as a hint and never as a fact, and it must not feed the MCDA score. See the
no-fabrication rule in the root `CLAUDE.md`.

## Auto-translate landlord replies

`autoTranslateListings` is collected during onboarding, stored, and returned by
the profile API — but read by no business logic
(`apps/api/src/routes/profiles.ts` only passes it through). It is a toggle that
does nothing, which is worse than no toggle.

Either wire it — translate inbound landlord messages into the user's language
while keeping the original for sending — or remove it from onboarding. The
`messages.metadata` JSON column already anticipates this with `translated` and
`originalLanguage` keys.

*(`autoDraftMessages` had the same problem and is now wired via
`apps/api/src/services/qualification.ts`; use that as the pattern.)*

## Shared UI primitives

There is no `src/components/ui/`. Styling is applied inline per component, so the
Obsidian tokens are enforced by discipline rather than by code, and long class
strings are duplicated across views.

**Scaffolding already present:** `class-variance-authority` is a dependency of
`apps/web` but imported in **zero** files, and `cn()` already exists in
`apps/web/src/lib/utils.ts`.

Start with `Button`, since it is the most duplicated: variants for
default/emerald/amber/outline/ghost/destructive, sizes including a 44px icon
variant, with the tap-target minimum baked into the base class so it cannot be
forgotten.

## Query key factory

Query keys are inline string arrays (`['apartments']`, `['apartments', id]`).
That works, but invalidation is easy to get subtly wrong as the surface grows. A
small `apartmentKeys` factory — `all`, `lists()`, `detail(id)`, `messages(id)` —
would make invalidation scopes explicit.

Low priority; do it when a cache bug actually bites, not before.

## Dashboard search and filtering

With a handful of listings the two lists are fine. Past roughly twenty, finding a
specific flat means scrolling. Wanted: text search over title and neighbourhood,
plus filters for price range and score.

## Photo gallery: touch gestures

The gallery uses prev/next buttons and a thumbnail strip. On a phone the natural
gesture is a swipe. `overflow-x-auto snap-x snap-mandatory` gets most of the way
there with no new dependency.

---

## Known gaps carried from v1.0.0

Documented in the root `CLAUDE.md` as current limitations; repeated here as work
someone may want to pick up.

- **Production Docker image.** `docker-compose.yml` runs the dev server with
  source bind-mounted. There is no `Dockerfile` and no production serve path for
  the built PWA. This is the highest-value item on this page for anyone wanting
  to actually deploy LeaseOps.
- **Redrafting after the voice changes.** Setting a listing's "written as" to the
  other member applies from the next draft on; messages already in the thread are
  left as they were written, because they may already have been sent. Redoing one
  means rejecting the draft and drafting again. A "rewrite this draft as X" button
  would save the two steps, at the price of an LLM call and a destructive edit —
  which is why it is not there yet.
- **Manual ratings silently override listing evidence.** If a user rates a
  feature the listing contradicts, scoring trusts the user while the AI review
  trusts the listing, and the two can visibly disagree. A "you rated this
  differently from the listing" hint would resolve it without changing
  precedence.
- **Portal coverage beyond Idealista.** Extraction is LLM-based and generalises
  reasonably, but Scrapfly's country routing is tuned for Spain. Verify against
  a German or French portal before claiming broader support.

## Explicitly out of scope

- **Multi-tenancy.** LeaseOps is single-user by design. Auth is one credential
  pair from the environment. Adding accounts would reshape the data model for a
  use case the project does not target.
- **Hosted SaaS.** The project is built to be self-hosted; that assumption runs
  through the auth model, the embedded database, and the deployment story.
