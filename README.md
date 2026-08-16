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

### The API key lives in the app, not in `.env`

Add your Anthropic key under **Settings → AI & billing**. It belongs to the
household, so whoever adds it is paying for everyone in it, and the panel says
whose key is being billed. The model is chosen right beside it, from the list
Anthropic actually offers your key.

Without a key everything still works: analysis and outreach fall back to a
deterministic generator built from what you entered, and nothing is invented in
either mode. No key is required to add and score listings — you enter those by
hand.

`ANTHROPIC_API_KEY` in `.env` is not read when the app runs. If it is set,
Settings offers to import it into your household in one click; once you have a
key stored you can delete the variable.

### Docker (development)

```bash
docker compose up
```

Mounts a named volume at `/app/data` so your pipeline survives restarts. This runs the **development** server with your source bind-mounted. For a real deployment see below — it is a different file.

---

## Deploying it

Production is one container on one origin: the API process serves both `/api` and the built PWA. That is deliberate — same-origin keeps the session cookie first-party, removes CORS from the picture, and means there is no reverse proxy to configure or API base URL to bake into the frontend.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The container listens on 3000 internally and is published to **`127.0.0.1:8767`** by default. Point a Cloudflare tunnel (or any reverse proxy on the host) at that.

| Variable | Default | What it does |
|---|---|---|
| `LEASEOPS_PORT` | `8767` | Host port to publish |
| `LEASEOPS_BIND` | `127.0.0.1` | Host interface. See the warning below before changing it |
| `ALLOW_SIGNUP` | unset | Who may create a new household — see [Locking the front door](#locking-the-front-door) |
| `ANTHROPIC_API_KEY` | empty | Optional, only to offer the one-click import. The real key lives in the app |

> [!WARNING]
> Leave `LEASEOPS_BIND` on `127.0.0.1` unless you know you need otherwise. Docker writes its own iptables rules **ahead of UFW**, so binding `0.0.0.0` publishes the app on every interface of the VM regardless of your firewall — letting anyone who can reach the box skip the tunnel entirely. If your tunnel daemon runs as a container rather than on the host, put it on this compose network and point it at `http://leaseops:3000` instead of widening the bind address.

### With Dokploy

Create a **Docker Compose** application pointed at this repo, set the compose path to `docker-compose.prod.yml`, and add any variables from the table above in the environment editor. Dokploy builds the image on the VM; no registry is involved.

Then map the published port to your hostname in Cloudflare. Two things worth doing there:

- **Put Cloudflare Access in front of the hostname.** It stops unauthenticated traffic before it reaches Bun at all, which is the single biggest win for a personal instance. Set the Access session duration generously (a month) — when an Access session expires mid-use, in-flight API calls get redirected to the login page and the app surfaces it as an odd error until you reload.
- **Leave the tunnel's origin as plain HTTP to `127.0.0.1:8767`.** TLS terminates at Cloudflare; the app still sends HSTS, and the session cookie is still `Secure` because the browser only ever sees HTTPS.

### Locking the front door

`/api/auth/signup` is reachable by anyone who finds your hostname, so creating a **new household** is gated by `ALLOW_SIGNUP`:

- **unset** — allowed only while the database has zero users. A fresh deployment creates its first account and then closes itself. This is the default and usually the right one.
- **`true`** — anyone can. Set this temporarily to onboard someone new.
- **`false`** — nobody can, ever.

Joining an *existing* household is never gated: it already requires that household's join code, and both endpoints are rate limited (5 sign-ups/hour, 10 logins/15 min, per IP).

For the limiter to see real addresses behind a tunnel, `TRUSTED_CLIENT_IP_HEADER` is set to `cf-connecting-ip` in the compose file. Do not set it without a proxy that overwrites that header — a client could otherwise forge it and rotate past the limit.

### What else the production image does

- Runs as a **non-root** user (uid 1000) with a **read-only root filesystem**, all capabilities dropped and `no-new-privileges`. The only writable path is the data volume.
- Ships without Vite, TypeScript, ESLint, drizzle-kit or the test suite.
- **Applies migrations on boot.** Outside development the schema never migrates as a side effect of a request, so the entrypoint does it explicitly and refuses to start if the data directory isn't writable.
- Sends a strict **Content-Security-Policy** (`script-src 'self'`, `frame-ancestors 'none'`), HSTS, and generic error messages — the real error goes to the log, not to the client.
- Has a **healthcheck** on `/api/health`, memory/CPU limits, and log rotation.

### Bringing your existing data across

If you have been using LeaseOps locally, you do not start from zero and you do not need an export format. The laptop and the server run the same SQLite engine, the same Drizzle schema and the same migrations — **the database file already is the export**, a complete and typed one.

Deploy the stack first, then pick a route. **Sign-up on the new instance can wait** — importing first is what you want, and it closes sign-up on its own afterwards.

#### Route 0 — upload it from the login screen (no server access needed)

On an instance with no accounts yet, the login page shows **"Migrate an existing database"** below the form. You pick your file, the server reads it and shows you **which households and accounts are in it**, and only then do you confirm. Households, listings, scores, criteria, outreach threads, the join code and your stored API key all come across; then you sign in with the username and password you already had.

> [!IMPORTANT]
> **Do not just grab `local_leaseops.db` while the app is running.** SQLite is in WAL mode, so recent writes live in the `local_leaseops.db-wal` beside it. The `.db` on its own is a *structurally perfect but stale* snapshot — it passes every integrity and schema check while containing rows you deleted long ago.
>
> Either run `just prepare-db` on the source machine and upload the `leaseops-transfer.db` it writes, or select **both** `local_leaseops.db` and `local_leaseops.db-wal` in the file picker: the panel takes the pair and replays the log before reading anything.
>
> That is what the review step is for. No validation can detect a stale snapshot, because nothing is wrong with it — only you can, by recognising the household names on screen.

The link only exists while the database has zero accounts. Once any account exists — including the one that arrived in the import — the endpoint is a permanent 409 and the link is gone. That is the whole security model for it: the window it lives in is the same window where anyone could just sign up and take the instance anyway. It is rate limited, capped at 64 MB, and the uploaded file is validated (SQLite header, integrity check, and an exact schema-fingerprint match that rejects a database carrying injected triggers) before a single row is touched. The copy runs in one transaction: if anything fails, nothing changed.

**If you imported the wrong file**, the gate has closed and there is no undo in the UI — wipe the instance and start over, which is safe because nothing else is on it yet:

```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d --build
```

> [!NOTE]
> There is an import and deliberately **no export endpoint**. A route that serialises the database is a route that serves every household's plaintext Anthropic key — and getting data *out* is a file you already have.

#### Or from a shell

`docker/import-db.sh` splits into two halves so it can cross a machine boundary:

| Half | Needs | Doesn't need |
|---|---|---|
| `--prepare` | `bun`, the source database | Docker, the server |
| `--install` | `docker` | `bun`, the repo, the source database |

##### Route A — you can SSH to the VM (one command, no file copying)

Point your laptop's Docker CLI at the VM's daemon and run the whole thing locally:

```bash
docker context create prox --docker host=ssh://you@your-vm
docker context use prox
./docker/import-db.sh                     # prepare + install, straight across
docker context use default                # switch back afterwards
```

This works because every Docker operation in the script is either a named-volume command or `docker cp`, both of which the *daemon* executes on its own host. There is deliberately no bind mount of a local path anywhere in the script — with a remote daemon, `-v /local/path:/x` silently resolves on the **server**, mounting the wrong directory instead of failing.

##### Route B — copy the file over

```bash
# on your laptop
./docker/import-db.sh --prepare           # → leaseops-transfer.db
scp leaseops-transfer.db you@your-vm:~/

# on the VM
./import-db.sh --install ~/leaseops-transfer.db
rm ~/leaseops-transfer.db
```

`--install` needs nothing but Docker — no Bun, no repo — so copy the single script across if the VM has no checkout. Delete the transfer file afterwards: it holds your API key in plaintext, which is also why this goes over `scp` and not anything that leaves a copy behind.

##### Either way

The script validates before touching anything (integrity check, LeaseOps tables present, migration state not *ahead* of the deployed code), refuses to overwrite an instance that already has data unless you pass `FORCE=1`, stops the container before swapping the file — replacing it under a live SQLite connection corrupts it — clears the stale WAL so SQLite cannot replay it over the new database, fixes ownership to the container's uid, and restarts even if a step fails. Households, listings, scores, criteria, outreach threads, the join code and the stored Anthropic key all come across.

Old sessions are cleared, so everyone signs in again. They were issued to a browser talking to `localhost`.

> [!TIP]
> Dokploy names containers after its own compose project. If yours isn't called `leaseops`, find it with `docker ps` and pass `LEASEOPS_CONTAINER=<name>`. The script uses `docker stop`, not `docker compose stop`, precisely so it doesn't care which project created the stack.

> [!NOTE]
> **There is deliberately no JSON export/import feature**, and adding one would be a downgrade. A round-trip through JSON has to re-implement what SQLite already does perfectly, and gets to be wrong about timestamps (stored as integers), the JSON-encoded columns, foreign-key ordering and id collisions. Worse, an export endpoint is a route that serves every household's plaintext Anthropic key, and an import endpoint is an authenticated mass-write path — permanent attack surface bought for a one-time move. Copying the file has none of those properties.

### Backups

```bash
./docker/backup.sh              # → ./backups/leaseops-<timestamp>.db
```

Copying `local_leaseops.db` off the volume is **not** a backup — the database runs in WAL mode, so recent writes live in a sibling file and a lone `.db` can be stale or torn. The script asks SQLite for a consistent copy (`VACUUM INTO`) while the app keeps serving.

> [!IMPORTANT]
> The backup contains every household's Anthropic API key in plaintext, exactly as the live database does. Treat it like a `.env`: encrypt it before it leaves the machine. `backups/` is gitignored.

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
- **No per-user rate limit, only per-IP.** The login limiter buckets on the caller's address, so it slows a script down but does not lock a single targeted account. Cloudflare Access in front is the real answer.
- **No admin UI.** If someone does create a household on your instance, removing it means opening the database yourself. Hence the closed-by-default sign-up.
- **The API key is in the SQLite file in plaintext.** Encrypting it would need a decryption key that background work can reach — which means `.env`, exactly what moving the key into the database removed. The trade-off is deliberate, but it makes your backups and the data volume as sensitive as a `.env` file.
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
