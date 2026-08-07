# LeaseOps

**Self-hosted apartment hunting, run like a sales pipeline.**

Apartment hunting is a spreadsheet problem pretending to be an emotional one. You open forty tabs, forget which flat had the good kitchen, and end up choosing on vibes at 1am. LeaseOps treats every listing as an inbound lead: it scrapes the listing, scores it against criteria *you* weighted, routes it into qualified or not, and drafts the outreach message in the landlord's language.

Paste a URL. Get a number, a blunt summary of what you're giving up, and a message you can send.

![License](https://img.shields.io/badge/license-AGPL--3.0-blue)
![Runtime](https://img.shields.io/badge/runtime-Bun-black)
![Tests](https://img.shields.io/badge/tests-47%20passing-brightgreen)

---

## How it works

```
Listing URL
    │
    ├─▶ Scrapfly ──────────▶ raw HTML (bypasses portal anti-bot / WAF)
    │
    ├─▶ LLM extraction ────▶ structured JSON (price, m², rooms, amenities, photos)
    │
    ├─▶ MCDA scoring ──────▶ weighted score vs. your criteria + budget ceiling
    │
    ├─▶ Pipeline routing
    │      │
    │      ├─ 🟢 QUALIFIED ──▶ AI review + outreach message auto-drafted
    │      └─ ⚪ DISQUALIFIED ▶ compromise summary; no LLM spend on outreach
    │
    └─▶ Micro-CRM ─────────▶ per-listing chat log with AI reply suggestions
```

### Mathematical scoring, not vibes

During onboarding you weight ~32 apartment features from 1 to 5. Anything you weight 4 or 5 gets scored; weight 5 is a non-negotiable. Each listing is then scored:

```
score = Σ(rating × weight) / Σ(5 × weight) × 100
```

A listing qualifies when it clears your threshold (default 70%) **and** sits within your budget ceiling. Price is checked against the extracted price, so an over-budget flat can't sneak through on a typo.

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

Edit `.env` and set at minimum `AUTH_USERNAME` and `AUTH_PASSWORD`. Then:

```bash
bun run db:migrate
bun run dev
```

Open http://localhost:5173 and complete onboarding to set your criteria.

### API keys are optional

| Key | Without it |
|---|---|
| `SCRAPFLY_API_KEY` | Listings can't be fetched — required to add real listings |
| `DEEPSEEK_API_KEY` *(or `OPENAI_API_KEY`)* | Everything still works; LLM output falls back to a deterministic generator that derives text from the scraped data |

Only Scrapfly is genuinely required, because portals like Idealista sit behind DataDome and won't serve a plain fetch.

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

## Known limitations

Honest list, so nothing surprises you:

- **Single user.** Auth is one username/password from the environment, with server-side sessions. Fine self-hosted behind your own network; not multi-tenant.
- **No production container.** `docker-compose.yml` runs the dev server with source mounted. A real image is still to do.
- **Portal coverage is Spain-leaning.** Extraction is LLM-based so it generalizes reasonably, but Scrapfly's country routing is tuned for Idealista.
- **Outreach drafts end with a name placeholder.** The tenant persona has no name field yet, so you fill that in before sending.
- **Soft dealbreakers don't force disqualification.** Scoring a 0–1 on a weight-5 feature is reported in the compromise summary, but a listing strong enough elsewhere can still qualify. Deliberate, and covered by tests — change `calculateMcdaScore` if you disagree.
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
