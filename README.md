# LeaseOps

**Self-hosted apartment hunting, run like a sales pipeline.**

Apartment hunting is a spreadsheet problem pretending to be an emotional one. You open forty tabs, forget which flat had the good kitchen, and end up choosing on vibes at 1am. LeaseOps treats every listing as an inbound lead: you paste it in, it scores the listing against criteria *you* weighted, routes it into qualified or not, and drafts the outreach message in the landlord's language.

Paste the listing text. Get a number, a blunt summary of what you're giving up, and a message you can send.

![License](https://img.shields.io/badge/license-AGPL--3.0-blue)
![Runtime](https://img.shields.io/badge/runtime-Bun-black)
![Tests](https://img.shields.io/badge/tests-47%20passing-brightgreen)

---

## How it works

```
Paste the listing
    │
    ├─▶ Manual entry ──────▶ description, rent, size, rooms, stated amenities
    │
    ├─▶ MCDA scoring ──────▶ weighted score vs. your criteria + budget ceiling
    │
    ├─▶ Pipeline routing
    │      │
    │      ├─ 🟢 QUALIFIED ──▶ AI review + outreach message auto-drafted
    │      └─ 🟡 FELL SHORT ─▶ compromise summary; no LLM spend on outreach
    │             └─ "Activate" ▶ pursue it anyway; releases the withheld AI work
    │
    └─▶ Micro-CRM ─────────▶ per-listing chat log with AI reply suggestions
```

### Mathematical scoring, not vibes

During onboarding you weight ~48 apartment features from 1 to 5. Anything you weight 4 or 5 gets scored; weight 5 is a non-negotiable. Each listing is then scored in two stages:

```
base    = Σ(rating × weight) / Σ(5 × weight) × 100     how well it fits overall
penalty = ×0.55 … ×1.0  per non-negotiable rated below 3/5
score   = base × penalty
```

The second stage exists because a plain weighted average forgives too much: with twenty non-negotiables, a flat that scored **0/5** on one of them still came out at 95%. The more things you called non-negotiable, the less any single failure mattered. The penalty is multiplicative, so it costs the same whether you weighted five features or fifty, and compounds when a listing fails several.

Rent is scored too, not just gated: full marks at or below your ideal, tapering to zero at your ceiling, so a bargain outranks an identical flat scraping your limit. A listing qualifies at a threshold **you set** during onboarding (default 70%) **and** within your budget ceiling.

Anything you have not rated counts as 3/5 — unknown, not fine. A listing nobody has assessed lands around 60% and stays out of the qualified bucket rather than looking like a good lead.

The figures you gave as numbers are scored too. Floor area rates 3/5 at your minimum, 5/5 at your maximum, and drifts back down above it — because that's what a maximum means. Below your minimum it decays sharply and takes the same penalty as a failed non-negotiable, so an undersized flat can't be rescued by a good kitchen. Room impressions from the walkthrough are averaged into one criterion that moves the score without being able to sink it on its own.

### It tells you what you're giving up

Every disqualified listing gets a compromise summary derived from the scoring data — never invented:

> Costs 3300 over your 1600 ceiling (listed at 4900). Soundproofing scores 2/5 despite being weighted 4/5 in your profile.

When an LLM is configured it rewrites those measured facts into prose, but the facts themselves always come from the arithmetic. **If there is nothing measurable to report, LeaseOps says so rather than manufacturing a trade-off.** The same rule applies throughout: no placeholder photos, no sample pros and cons, no invented verdicts. An empty state is always preferred to a plausible-looking fabrication.

### Outreach that sounds like you

Qualified leads get an outreach draft written from your tenant persona, in the language you set — positioned around what landlords actually care about (income stability, tenure, low hassle) rather than pleading. The chat hub keeps the thread and suggests contextual replies as negotiations move.

---

## Quick start

**Requirements:** [Bun](https://bun.sh) 1.0+. That's it — the database is embedded SQLite.

```bash
git clone https://github.com/muradmadi/leaseops.git
cd leaseops
bun install
cp .env.example .env
```

No credentials to configure — you create an account in the app. Then:

```bash
bun run db:migrate
bun run dev
```

Open http://localhost:5173, sign up to create your household, and complete onboarding to set your criteria.

Hunting with a partner? They sign up too, choosing **Join**, and enter the household code from your Settings screen. You then share one pipeline, one set of criteria and one set of outreach threads, from any device.

### API keys are optional

| Key | Without it |
|---|---|
| `ANTHROPIC_API_KEY` | Everything still works; LLM output falls back to a deterministic generator derived from what you entered |

No key is required to add and score listings — you enter them by hand.

### Docker

```bash
docker compose up
```

Mounts a named volume at `/app/data` so your pipeline survives restarts. Note this currently runs the **development** server; there is no production image yet (see [Known limitations](#known-limitations)).

---

## Commands

This repo uses [`just`](https://github.com/casey/just); every recipe maps to a `bun run` script if you'd rather not install it.

| Command | Does |
|---|---|
| `just dev` | Run API (:3000) and web (:5173) in watch mode |
| `just build` | Production build of all workspaces |
| `just test` | Run the test suite |
| `just typecheck` | Typecheck every workspace |
| `just db-migrate` | Apply Drizzle migrations |
| `just db-studio` | Open Drizzle Studio to inspect the database |

---

## Architecture

```
packages/db/     Drizzle schema, migrations, repositories, Zod validators.
                 Single source of truth for all types.
apps/api/        Hono REST API. Scraping, LLM workers, MCDA engine.
apps/web/        React 19 + Vite PWA. TanStack Query, Tailwind v4.
```

**Stack:** Bun · Hono · Drizzle ORM · SQLite · React 19 · Vite · TanStack Query · Tailwind CSS v4 · Zod

Two rules hold the monorepo together:

1. **Types flow one way.** Both apps import inferred Drizzle types (`$inferSelect`) from `@leaseops/db`. Database shapes are never redefined by hand.
2. **The frontend never touches the database.** It talks to the API over HTTP, and every endpoint that accepts input validates it with Zod.

### Prompt injection defense

Scraped listing text is attacker-controlled — a landlord can write anything in a description. All external content is wrapped in `<UNTRUSTED_LISTING_CONTENT>` boundaries with explicit instructions to treat it as passive data. Scraped descriptions are also rendered as text, never as HTML.

---

### Digging through what didn't qualify

When too little is getting through, the flats that fell short are still there with a reason attached. **Activate** on any of them marks it as pursued and generates the AI review and outreach draft the pipeline withheld. It does not move the listing into Meeting Criteria — the score is a measurement, and deciding to chase a flat doesn't change what it measured.

---

## Known limitations

Honest list, so nothing surprises you:

- **No password reset.** There is no email in the system by design. If you lose a password, create a new account and rejoin with the household code.
- **Anyone with the household code gets full access.** It is rotatable from Settings, but there are no per-member permissions — a household is assumed to be people who trust each other.
- **No production container.** `docker-compose.yml` runs the dev server with source mounted. A real image is still to do.
- **Listings are entered by hand.** You paste the description and type the figures. Nothing is scraped, so nothing breaks when a portal changes its markup — but adding a flat takes a minute.
- **No photos.** LeaseOps stores no images; keep the listing tab open if you want to look at it.
- **Drafts sign with your household's names.** Whoever is in the household is joined in your target language — "Murad und Paulie" in German. Set no names anywhere and drafts end without a signature rather than inventing one.
- **Non-negotiables are penalised, not vetoed.** A weight-5 feature rated below 3/5 takes a large multiplicative cut rather than removing the listing outright. At the default threshold a 0/5 or 1/5 won't survive it, but the flat is still scored and still shown with the reason attached, rather than silently disappearing.
- **Manual ratings override listing evidence silently.** If you rate a feature the listing contradicts, the score trusts you while the AI review trusts the listing, which can read as inconsistent.

---

## Contributing

Issues and pull requests welcome. Before opening a PR:

```bash
bun run typecheck && bun test && bun run build
```

All three must pass. Add a test with behavioral changes — the scoring pipeline in particular is covered by regression tests that exist because those exact bugs shipped once already.

---

## License

Copyright (C) 2026 Murad Madi.

Licensed under the **GNU Affero General Public License v3.0**. You may use, study, modify, and share this software freely. If you run a modified version as a network service, the AGPL requires you to offer your users its source code. See [LICENSE](LICENSE) for the full terms.

Commercial licensing is available separately: if you want to use LeaseOps in a way the AGPL doesn't permit, contact the copyright holder to arrange terms.

---

## A note on scraping

LeaseOps fetches listings on your behalf, for your own apartment search. Portal terms of service vary and some prohibit automated access. You are responsible for how you use it — keep request volumes sane, and don't point it at anything you haven't the right to read.
