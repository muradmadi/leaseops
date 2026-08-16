# packages/db — Data Layer

Drizzle ORM over embedded SQLite (`bun:sqlite`). **The single source of truth for
every type in this repo.** Root `../../CLAUDE.md` applies.

## Layout

```
src/client.ts       Singleton Database + drizzle instance, pragmas, auto-migrate
src/schema/         Table definitions — apartments, profiles, messages, auth
src/repository/     Query functions. All DB access goes through these.
src/validators/     Zod schemas derived from the tables (drizzle-zod)
src/migrate.ts      Standalone migration runner
drizzle/            Generated SQL migrations + meta journal (8 migrations)
```

`src/index.ts` re-exports schema, repositories, validators, and inferred types.
Consumers import from `@leaseops/db` only — never deep-import a file path.

## Type contract

Every table exports its inferred types:

```typescript
export type Apartment = typeof apartments.$inferSelect;
export type NewApartment = typeof apartments.$inferInsert;
```

Both apps import these. **Never hand-write an interface mirroring a table** — if
a shape is needed elsewhere, export it from here.

## Repository pattern

Route handlers must not build queries. They call repository functions, which own
all Drizzle query construction. When adding a query:

1. Add the function to the right `src/repository/*.ts`
2. Export it via `src/repository/index.ts`
3. Accept and return inferred types

This is what keeps `apps/api` free of SQL and makes the data layer testable.

## Schema conventions

- **IDs**: `text` primary keys holding `crypto.randomUUID()`.
- **Timestamps**: `integer` with `{ mode: 'timestamp_ms' }` — `createdAt` and
  `updatedAt` on every table, both `notNull`.
- **Flexible data**: `text` with `{ mode: 'json' }` for `featureWeights`,
  `featureScores`, `roomScores`, `extractedData`, `metadata`. These hold evolving
  shapes that should not force a migration.
- **Enums**: `text` with an `enum` constraint, e.g. apartment `status` is
  `UNPROCESSED | QUALIFIED | DISQUALIFIED | ARCHIVED | ERROR`.
- **Index anything you filter or sort on.** Existing indexes cover status, score,
  createdAt, and a composite status+createdAt.
- `messages.apartmentId` cascades on delete. Deleting an apartment removes its
  conversation; there is no orphan cleanup elsewhere.

## Migrations

```bash
bun run db:generate   # after editing a schema file — writes drizzle/*.sql
bun run db:migrate    # apply
bun run db:studio     # inspect
```

Generated SQL is committed. Never hand-edit a migration that has been applied;
generate a new one.

`client.ts` **auto-runs migrations on first connection** whenever `NODE_ENV` is
not `production`. So in dev and test the schema self-heals and `db:migrate` is
usually unnecessary — but production deployments must run it explicitly.

## `repository/import.ts` — adopting another instance's database

Backs the login screen's migrate panel and `docker/import-db.sh`. It is the only
code here that deletes every row, so it has rules of its own:

- **`validateImportCandidate` and `importDatabaseFile` take the target
  `Database` as a parameter, defaulting to the singleton. Keep that seam.** Tests
  run against the developer's real database; a version that hardcoded `sqlite`
  would erase the pipeline of whoever ran `bun test`. The happy path is tested
  only against temporary databases built in `import.test.ts`.
- **Validation compares a full schema fingerprint**, not a table list. The
  uploaded file is untrusted input, and a SQLite file can carry triggers and
  views that run SQL when touched — an extra trigger means it is not our schema.
- **A `.db` supplied without its `-wal` is stale and passes every check.** That
  is the WAL gotcha below, weaponised: the file is a valid, consistent snapshot
  of an earlier moment. `foldWalIntoDatabase` exists so a caller can supply the
  log too, and `validateImportCandidate` returns household and account *names*
  precisely because a machine cannot tell — only the person looking at them can.
- **It copies via `ATTACH` inside one transaction, never by replacing the file.**
  Overwriting would strand the open connection on a deleted inode and force a
  restart; this way the running process sees the new rows at once and any failure
  rolls back whole.
- `user_sessions` and `__drizzle_migrations` are deliberately not copied — stale
  tokens for another origin, and a migration history that must keep describing
  the schema this database actually has.

## Gotchas

- **`DATABASE_URL` is resolved relative to the process CWD.** Unset, it defaults
  to `packages/db/local_leaseops.db` resolved from the package directory. Running
  a script from a different directory with a relative `DATABASE_URL` will create
  a *second, empty* database rather than failing loudly. If data seems to vanish,
  check which file you actually opened.
- **Tests write to the development database.** There is no test database.
  Anything a test creates must be cleaned up in `afterAll`.
- **WAL mode is on**, so `.db-wal` and `.db-shm` sit beside the `.db`. All three
  are gitignored; copying only the `.db` file loses recent writes.
- The client is a singleton behind a `globalThis` guard so Bun's `--watch` does
  not open a new handle on every reload. Preserve that guard.
