# apps/web — Frontend PWA

React 19 + Vite + TanStack Query + Tailwind v4. Mobile-first, installable PWA.
Root `../../CLAUDE.md` and `../CLAUDE.md` apply.

## Layout

```
src/App.tsx              Auth gate + wouter routes
src/views/               One file per screen: Dashboard, ApartmentDetail, Chat,
                         Onboarding, AboutYou, Settings, Login
src/components/          AddListingModal — the multi-step evaluation wizard
                         WorkProfileFields / HouseholdPersonaFields — the two
                         halves of the tenant story, shared by onboarding and
                         the AboutYou gate so the questions cannot drift
                         AnnotationHint — teaches the [[ ]] convention, shown
                         wherever those two halves are typed
src/lib/
  api.ts                 apiFetch wrapper; throws on non-2xx
  useApartments.ts       Listing queries/mutations + the SSE subscription
  useAuth.ts             Session state
  useProfile.ts          Onboarding profile
  persona.ts             The household persona JSON shape, parsed tolerantly
  preferenceMatrixData.ts  The 32 features shown during onboarding
```

Routing is **wouter**, not React Router. State is TanStack Query — there is no
Redux/Zustand/Context store, and none should be added for server state.

## Design system — Obsidian Dark

**Intent:** the precision of an enterprise CRM (Linear, Salesforce) crossed with
the tactile ergonomics of a native iOS app. Clinical, not playful — this screen
is where someone decides where they will live. Dense information, calm surfaces,
colour reserved for meaning rather than decoration.

Dark mode only. Use Tailwind tokens, never hardcoded hex or inline `style`:

| Token | Meaning |
| :--- | :--- |
| `zinc-950` | Page background |
| `zinc-900` | Cards and raised surfaces |
| `zinc-800` / `zinc-700` | Borders |
| `emerald-500` | Qualified leads, AI-ready actions |
| `amber-500` | Fell short of criteria, needs attention |
| `red-500` | Errors, destructive actions |
| `blue-500` | Primary CTAs |

**Every interactive element needs a ≥44×44px tap target** (`min-h-[44px]`).
This is a phone-first app used while standing outside a building.

Inputs must use `text-[16px]` at mobile breakpoints — anything smaller makes iOS
Safari zoom on focus.

### Mobile checklist

Verify before considering a view done:

- [ ] No horizontal overflow at a **360px** viewport. Horizontal carousels use
      `overflow-x-auto snap-x snap-mandatory` with the scrollbar hidden.
- [ ] Icon buttons, toggles, and slider thumbs measure ≥44×44px as rendered —
      check the bounding rect, not just the icon size.
- [ ] Critical navigation stays reachable during long scrolls (sticky header).
- [ ] Every clickable surface has hover **and** active feedback:
      `hover:border-zinc-700 active:scale-[0.98] transition-all duration-150`.

## Data fetching

- `useApartments()` subscribes to `/api/apartments/sse` and invalidates the query
  on `update` events. It has **no polling fallback**, so if live updates break,
  check the SSE stream before anything else.
- `useApartment(id)` polls every 3s and `useMessages(id)` every 5s, because both
  views are often open while background enrichment or an LLM draft finishes.
- Mutations that move a listing through the pipeline should update optimistically.

## The no-fabrication rule applies hardest here

The UI is where invented data becomes indistinguishable from real analysis.

- **Never** fall back to stock photos. If `extractedData.media.images` is empty,
  show the "no photos" state. Images that fail to load are hidden, not replaced.
- **Never** render placeholder pros/cons or a default recommendation. If there is
  no `aiReview`, show the "not analysed yet" state with the generate button.
- Compromise text comes from `featureScores.compromise`, which the API derives
  from scoring. Do not synthesise it from the AI review's prose.

All three of these were real bugs that presented fabricated content as genuine
analysis of a real apartment. Do not reintroduce them.

## Rendering scraped content

Listing descriptions arrive with portal markup baked into the text. Strip tags
and convert `<br>` to newlines, then render as text in a `whitespace-pre-line`
container. **Never** `dangerouslySetInnerHTML` — this is untrusted content.

## Gotchas

- **`AboutYouView` serves three routes and one gate.** `/profile` passes
  `section="work"`, `/household` passes `section="household"`, and `/about-you`
  plus the gate show both. Splitting it is safe precisely because the two saves
  were already separate (see below); `handleDone` must keep saving only the half
  on screen, and the `employmentStatus` gate must not block a household-only
  edit. Settings links to the two halves separately, in the order onboarding
  asks for them.
- **`AboutYouView` is a gate, not a page.** `App.tsx` renders it in place of
  everything else when the signed-in member's `workProfile` is null — the
  criteria belong to the household and were filled in once, so a partner who
  joined an established household otherwise reached the dashboard without ever
  being asked anything about themselves, and their outreach was written from the
  other member's job. Answering is what closes it, and `employmentStatus` is the
  answer that counts because every applicant has one, "not working" included.
  Never preselect it — same reasoning as the gender control in `Segmented`.
- **Tenant notes in `[[double brackets]]` are instructions, not facts.** Any
  persona or work answer may carry one — "don't volunteer this", "only if they
  ask". The API strips them before a message is written; **the web strips them
  only where a field is quoted back** (the Settings summary, the onboarding
  review), never in an editor, where the raw text is what the user is editing.
  `stripAnnotations` in `lib/persona.ts` is a deliberate copy of the API's — this
  package cannot import runtime code from `apps/api`, and `@leaseops/db` is
  types-only. Both are tested on their own side.
- **Onboarding is eight screens, and 5–7 are one unit**: what the outreach pages
  are for, then your own work, then the household's shared facts. Work and the
  household shared one screen divided by a rule, which is how answers ended up in
  the wrong box — a guarantor typed into the box about your job cannot be held
  back later, because it is no longer the answer to the question it is filed
  under. Keep them as separate screens.
- **`OutreachAuthorControl` must resolve in the same order the API does** —
  `outreachAuthorId`, then `createdBy`, then the first (oldest) member. It shows
  who the next draft speaks as, so a control that resolved differently from
  `resolveApartmentAuthorId` would state one name while the message used another.
  It hides itself in a one-member household, where there is no choice to make.
- **The work screen has two saves and they must stay separate.** The work block
  writes your own user row (`PATCH /households/me/work`); the shared block writes
  the household's single profile row (`PATCH /profiles/me/persona`). Only the
  second can collide, which is why the shared half is prefilled for review rather
  than required, and why an incoming change raises a banner instead of replacing
  what is under the cursor. **Do not save the persona through `useUpdateProfile`**
  — that sends the whole profile and every field of its payload has a default, so
  a partial write there resets the location, the budget and all 32 weights.
- **`messages.sender` has three values and `ChatView` must branch on all three.**
  It was `if (landlord) … else …`, so a message you typed fell into the AI branch
  and rendered as "AI Suggested Reply" with a bot avatar. That is not cosmetic:
  the thread is the record of what you actually sent, and the reply prompt is
  built from it.
- **Chat message labels**: both auto-outreach and reply suggestions set
  `metadata.generated = true`, so it cannot distinguish them. Use `metadata.kind`
  (`'outreach'` / `'reply'`), keeping the `personaTuned` fallback for older rows.
- **Sent vs draft is stated by hand, per message, and copying changes nothing.**
  Only sent messages count as the tenant's own words when the next reply is
  drafted — see the API's chat reply notes. Every AI suggestion carries `Copy`,
  `Mark sent`/`Not sent` and `Reject`; **Reject deletes the row outright**, which
  is what lets the API stop inferring anything. Your own messages carry the same
  Sent/Draft toggle and can be saved either way from the composer. Landlord
  messages have no such state — they were sent, by them, or they would not exist.
- **A message's timestamp is `sentAt`, and it is typed in.** `createdAt` is when
  the row was written, not when anything was said — you send from your own mail
  client and press *Mark sent* a day later. Rendering it as the message time
  shipped once and was removed: a thread spanning a week showed five bare clock
  times and no dates, all wrong. `sentAt` replaced it, nullable and set by hand,
  separate from `createdAt` for the same reason `isActive` is separate from
  `status`. **Do not re-add `createdAt` to a bubble**, and do not default
  `sentAt` from it — an undated message renders *add time*, and every readout
  says "undated" rather than falling back. The composer prefills the current time
  because you can see and change it before saving, which is you stating it; the
  app never writes that field behind you.
- **A textarea holding an existing message uses `AutoTextarea`.** Editing used to
  drop a long message into a 60px box — a worse view of it than the bubble it
  replaced.
- **`ThreadDigest` is a readout, not a control.** It restates what the messages
  prove — who spoke last, when, whether you owe a reply — beside the
  `StageControl` showing the stage you declared, so a stale stage is visible
  instead of silently wrong. It must never set `pipelineStage`. Its `thread`
  comes from the API (`GET /apartments` and `GET /apartments/:id` both attach
  it): `summariseThread` lives in `@leaseops/db` and **must not** be imported
  here, since that is runtime code and this package takes types only.
- **There is no translation in this app.** The landlord bubble used to be badged
  `(Auto-detected → English)` from metadata hardcoded at save time, with no
  detection and no translation anywhere in the repo — and pointed at English
  while the household wrote Spanish. Do not reintroduce a label for a feature
  that does not exist.
- **PWA manifest lives in `vite.config.ts`**, generated by `vite-plugin-pwa`.
  Do not add a `<link rel="manifest">` to `index.html` — two manifests means the
  browser silently uses one and ignores the other.
- **Inter is self-hosted**, imported as `@fontsource-variable/inter/wght.css`
  from `main.tsx`; the CSS family name is `'Inter Variable'`. Do not link
  fonts.googleapis.com from `index.html` — it puts a third-party request on every
  load of a self-hosted app and forces `style-src`/`font-src` in the API's CSP
  back open. The `wght` entry point is deliberate: the package root also pulls
  the italic and optical-size axes, which this design never uses.
- **Workbox precaches only the latin font subsets** (`globPatterns` in
  `vite.config.ts`). Inter ships seven `unicode-range` subsets and the Cyrillic,
  Greek and Vietnamese ones can never render German, Spanish or English — leaving
  them out keeps ~200 kB off a phone. Do not add `svg`/`webmanifest` to those
  globs: `includeAssets` already contributes them, and listing them twice puts
  duplicate entries in the precache manifest.
- The service worker only appears in production builds. Verify PWA changes with
  `bun run build`, not the dev server.
- `@leaseops/db` is imported for **types only**. Never import a value from it.
