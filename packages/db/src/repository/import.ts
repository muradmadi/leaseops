import { Database } from 'bun:sqlite';
import { sqlite } from '../client';

/**
 * Adopting a whole database file from an existing instance.
 *
 * This is how a laptop's pipeline moves to a server without retyping it. It is
 * NOT a general-purpose restore: it may only ever run while the target has no
 * accounts, because it replaces everything.
 *
 * The file arrives from a browser upload, so it is untrusted input that SQLite
 * is about to parse — a file format with a long history of malicious-input bugs.
 * `validateImportCandidate` is therefore strict to the point of rudeness: it
 * checks the header, the integrity, and that the schema is *exactly* the one
 * these migrations produce. That last check is the important one, because a
 * SQLite file can carry triggers and views that execute SQL when touched, and a
 * database with an extra trigger is not our schema.
 */

/**
 * Tables copied, in foreign-key dependency order. Parents first on insert; the
 * reverse is used to clear the target.
 *
 * `user_sessions` is deliberately absent. Sessions were issued to a browser
 * talking to some other origin, and carrying live tokens onto a new host is
 * both pointless and a small gift to anyone holding an old one.
 *
 * `__drizzle_migrations` is absent for a different reason: the target's own
 * migration history is correct for the schema it actually has, and overwriting
 * it with the source's would desynchronise the two.
 */
const COPIED_TABLES = [
  'households',
  'users',
  'user_profiles',
  'apartments',
  'messages',
] as const;

const SQLITE_MAGIC = 'SQLite format 3\0';

export interface ImportValidation {
  ok: boolean;
  /** Safe to show a user: says what is wrong without echoing file contents. */
  message?: string;
  counts?: Record<string, number>;
  /**
   * Household and account names, so a person can confirm this is the database
   * they meant before it replaces anything.
   *
   * This exists because no amount of validation can catch the mistake that
   * actually happens: a `.db` copied without its `-wal` is a perfectly valid,
   * perfectly consistent, *stale* snapshot. It passes every structural check
   * there is. Only a human reading "Test household scraper" can tell.
   */
  households?: string[];
  accounts?: string[];
}

/**
 * Folds a write-ahead log into its database file, leaving one self-contained file.
 *
 * SQLite in WAL mode keeps recent writes in a sibling `-wal`, so the `.db` alone
 * can be an old snapshot — the single most likely way an import goes wrong, and
 * one that is undetectable from the `.db` by itself. When the caller supplies
 * the `-wal` too, this replays it so validation and copying see current data.
 *
 * Note this opens an untrusted file read-write, which is strictly more exposure
 * than the read-only validation path. It runs only when a `-wal` was actually
 * uploaded, and the schema fingerprint check still follows it.
 */
export function foldWalIntoDatabase(path: string): void {
  const db = new Database(path);
  try {
    db.run('PRAGMA journal_mode = WAL;');
    db.run('PRAGMA wal_checkpoint(TRUNCATE);');
  } finally {
    db.close();
  }
}

/** The schema fingerprint of a database: every object, normalised. */
function schemaFingerprint(db: Database): string {
  return db
    .query<{ type: string; name: string; sql: string | null }, []>(
      `select type, name, sql from sqlite_master
       where name not like 'sqlite_%' and name != '__drizzle_migrations'
       order by type, name`
    )
    .all()
    .map((r) => `${r.type} ${r.name} ${(r.sql ?? '').replace(/\s+/g, ' ').trim()}`)
    .join('\n');
}

function migrationCount(db: Database): number {
  const row = db.query<{ c: number }, []>('select count(*) c from __drizzle_migrations').get();
  return Number(row?.c ?? 0);
}

/**
 * Decides whether a candidate file may be imported, without modifying anything.
 *
 * Every rejection here is a rejection of attacker-controlled input, so the
 * messages describe the problem rather than quoting the file.
 */
export function validateImportCandidate(path: string, target: Database = sqlite): ImportValidation {
  let source: Database | undefined;
  try {
    source = new Database(path, { readonly: true, strict: false });

    // Stops SQLite from running functions named in the schema of an untrusted
    // file. Harmless if the build predates the pragma.
    try {
      source.run('PRAGMA trusted_schema = OFF;');
    } catch {
      /* older SQLite: the schema checks below are the real defence */
    }

    const integrity = source.query<Record<string, string>, []>('PRAGMA integrity_check').get();
    const verdict = integrity ? Object.values(integrity)[0] : undefined;
    if (verdict !== 'ok') {
      return { ok: false, message: 'That file is a corrupt SQLite database.' };
    }

    // Cheap identification first, so someone who picks the wrong file gets told
    // that, rather than the migration-mismatch message meant for a real one.
    const tables = new Set(
      source
        .query<{ name: string }, []>("select name from sqlite_master where type = 'table'")
        .all()
        .map((r) => r.name)
    );
    for (const required of [...COPIED_TABLES, 'user_sessions', '__drizzle_migrations']) {
      if (!tables.has(required)) {
        return { ok: false, message: 'That file is not a LeaseOps database.' };
      }
    }

    // The decisive check. Identical migrations produce an identical schema, so
    // any difference means the file is either from another application, from a
    // different version, or carrying objects nobody put there on purpose.
    if (schemaFingerprint(source) !== schemaFingerprint(target)) {
      const sourceMigrations = migrationCount(source);
      const targetMigrations = migrationCount(target);
      if (sourceMigrations < targetMigrations) {
        return {
          ok: false,
          message:
            `That database is ${targetMigrations - sourceMigrations} migration(s) behind this version. ` +
            'Run `bun run db:migrate` against it first, then upload it again.',
        };
      }
      if (sourceMigrations > targetMigrations) {
        return {
          ok: false,
          message:
            'That database is newer than this deployment. Update the server to the matching version first.',
        };
      }
      return { ok: false, message: 'That file is not a LeaseOps database.' };
    }

    const counts: Record<string, number> = {};
    for (const table of COPIED_TABLES) {
      const row = source.query<{ c: number }, []>(`select count(*) c from "${table}"`).get();
      counts[table] = Number(row?.c ?? 0);
    }

    if (counts.households === 0) {
      return { ok: false, message: 'That database has no households in it — there is nothing to import.' };
    }

    const households = source
      .query<{ name: string }, []>('select name from households order by created_at')
      .all()
      .map((r) => r.name);
    const accounts = source
      .query<{ username: string }, []>('select username from users order by created_at')
      .all()
      .map((r) => r.username);

    return { ok: true, counts, households, accounts };
  } catch {
    // Never surface the SQLite error: it can echo fragments of the uploaded file.
    return { ok: false, message: 'That file could not be read as a SQLite database.' };
  } finally {
    source?.close();
  }
}

/** Cheap pre-check so an obviously wrong upload never reaches SQLite at all. */
export function looksLikeSqlite(header: Uint8Array): boolean {
  const magic = new TextDecoder('latin1').decode(header.slice(0, 16));
  return magic === SQLITE_MAGIC;
}

/**
 * Replaces this instance's data with the contents of `path`.
 *
 * Done by ATTACHing the source and copying table by table inside a single
 * transaction, rather than by overwriting the database file. Swapping the file
 * would strand the open connection on a deleted inode and require a restart;
 * this way the running process sees the new rows immediately, and a failure
 * anywhere rolls the whole thing back to the empty state it started from.
 */
export function importDatabaseFile(path: string, target: Database = sqlite): Record<string, number> {
  const escaped = path.replace(/'/g, "''");
  const imported: Record<string, number> = {};

  target.run(`ATTACH DATABASE '${escaped}' AS source;`);
  try {
    // Foreign keys are enforced per-connection, and re-enabled in `finally`.
    // Ordered inserts satisfy them anyway; this guards against a source whose
    // rows were written in an order SQLite would reject mid-transaction.
    target.run('PRAGMA foreign_keys = OFF;');
    target.run('BEGIN IMMEDIATE;');

    for (const table of [...COPIED_TABLES].reverse()) {
      target.run(`DELETE FROM main."${table}";`);
    }
    target.run('DELETE FROM main."user_sessions";');

    for (const table of COPIED_TABLES) {
      target.run(`INSERT INTO main."${table}" SELECT * FROM source."${table}";`);
      const row = target
        .query<{ c: number }, []>(`select count(*) c from main."${table}"`)
        .get();
      imported[table] = Number(row?.c ?? 0);
    }

    // Catches anything the ordered copy still left dangling before it is durable.
    const violations = target.query<Record<string, unknown>, []>('PRAGMA foreign_key_check').all();
    if (violations.length > 0) {
      throw new Error('Imported data failed a foreign key check');
    }

    target.run('COMMIT;');
  } catch (error) {
    try {
      target.run('ROLLBACK;');
    } catch {
      /* no transaction open */
    }
    throw error;
  } finally {
    target.run('PRAGMA foreign_keys = ON;');
    target.run('DETACH DATABASE source;');
  }

  return imported;
}
