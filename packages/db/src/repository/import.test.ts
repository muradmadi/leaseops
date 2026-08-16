import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { copyFileSync } from 'node:fs';
import {
  validateImportCandidate,
  importDatabaseFile,
  looksLikeSqlite,
  foldWalIntoDatabase,
} from './import';

/**
 * Every case here builds its own throwaway databases and passes them in
 * explicitly.
 *
 * That is not incidental: `importDatabaseFile` deletes every row in its target,
 * and the rest of this suite runs against the developer's real database. A test
 * that defaulted to the singleton would erase the pipeline of whoever ran
 * `bun test`. Injecting the target is what makes this safe to test at all.
 */

const MIGRATIONS = resolve(import.meta.dir, '../../drizzle');

let dir: string;

function makeDb(name: string): { db: Database; path: string } {
  const path = join(dir, name);
  const db = new Database(path);
  db.run('PRAGMA foreign_keys = ON;');
  migrate(drizzle(db), { migrationsFolder: MIGRATIONS });
  return { db, path };
}

/**
 * A household with a user, a profile, an apartment and a message on it.
 *
 * `join_code` and `username` are unique columns, so both are randomised — some
 * cases seed the same database twice to build up a history.
 */
function seed(db: Database, householdName: string, username = 'seeded') {
  const now = Date.now();
  const hid = crypto.randomUUID();
  const uid = crypto.randomUUID();
  const aid = crypto.randomUUID();
  const joinCode = crypto.randomUUID().slice(0, 9).toUpperCase();

  db.run(
    'insert into households (id,name,join_code,created_at,updated_at,anthropic_api_key,anthropic_model) values (?,?,?,?,?,?,?)',
    [hid, householdName, joinCode, now, now, 'sk-ant-secret-key', 'claude-sonnet-5']
  );
  db.run(
    'insert into users (id,username,password_hash,display_name,household_id,created_at,updated_at) values (?,?,?,?,?,?,?)',
    [uid, username, 'hash', 'Seeded', hid, now, now]
  );
  db.run('insert into user_sessions (id,user_id,token,expires_at,created_at) values (?,?,?,?,?)', [
    crypto.randomUUID(),
    uid,
    `stale-token-${crypto.randomUUID()}`,
    now + 100000,
    now,
  ]);
  db.run(
    'insert into apartments (id,household_id,url,title,price,status,created_at,updated_at) values (?,?,?,?,?,?,?,?)',
    [aid, hid, 'https://example.test/1', 'Calle Test', 1200, 'QUALIFIED', now, now]
  );
  db.run(
    'insert into user_profiles (id,household_id,created_at,updated_at) values (?,?,?,?)',
    [crypto.randomUUID(), hid, now, now]
  );
  db.run(
    'insert into messages (id,apartment_id,sender,text,created_at,updated_at) values (?,?,?,?,?,?)',
    [crypto.randomUUID(), aid, 'assistant', 'Hola', now, now]
  );
  return { hid, uid, aid };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'leaseops-import-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('looksLikeSqlite', () => {
  it('accepts the SQLite magic header', () => {
    expect(looksLikeSqlite(new TextEncoder().encode('SQLite format 3\0'))).toBe(true);
  });

  it('rejects anything else', () => {
    expect(looksLikeSqlite(new TextEncoder().encode('PK a zip file'))).toBe(false);
    expect(looksLikeSqlite(new TextEncoder().encode('{"json":true}'))).toBe(false);
    expect(looksLikeSqlite(new Uint8Array(4))).toBe(false);
  });
});

describe('validateImportCandidate', () => {
  it('accepts a database from an identical schema and reports its contents', () => {
    const target = makeDb('target.db');
    const source = makeDb('source.db');
    seed(source.db, 'Move to Alicante');

    const result = validateImportCandidate(source.path, target.db);

    expect(result.ok).toBe(true);
    expect(result.counts).toMatchObject({ households: 1, users: 1, apartments: 1, messages: 1 });
  });

  it('rejects a SQLite file that is not LeaseOps', () => {
    const target = makeDb('target.db');
    const strangerPath = join(dir, 'stranger.db');
    const stranger = new Database(strangerPath);
    stranger.run('create table notes (id integer primary key, body text)');
    stranger.close();

    const result = validateImportCandidate(strangerPath, target.db);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('not a LeaseOps database');
  });

  it('rejects a database carrying an injected trigger', () => {
    const target = makeDb('target.db');
    const source = makeDb('source.db');
    seed(source.db, 'Trojan');
    // A SQLite file can carry SQL that runs when the database is touched. The
    // schema fingerprint is what catches it: this is no longer our schema.
    source.db.run(
      `create trigger evil after insert on apartments begin delete from households; end`
    );

    const result = validateImportCandidate(source.path, target.db);

    expect(result.ok).toBe(false);
  });

  it('rejects an empty database rather than wiping the target with nothing', () => {
    const target = makeDb('target.db');
    const source = makeDb('source.db');

    const result = validateImportCandidate(source.path, target.db);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('no households');
  });

  it('reports a file it cannot open as unreadable, without leaking SQLite errors', () => {
    const target = makeDb('target.db');
    const junk = join(dir, 'junk.db');
    Bun.write(junk, 'not a database at all');

    const result = validateImportCandidate(junk, target.db);

    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
    expect(result.message).not.toContain('SQLITE_');
  });
});

/**
 * The bug this suite exists to prevent recurring.
 *
 * A `.db` copied on its own, while WAL mode has uncheckpointed writes, is a
 * valid and fully consistent database — of an earlier moment. It passed every
 * structural check and imported deleted test fixtures onto a real server.
 */
describe('a database copied without its write-ahead log', () => {
  /**
   * Reproduces the real sequence: a test fixture is created and lands in the
   * main file, and only its *cleanup* is still sitting in the log. The `.db`
   * alone therefore shows a household that no longer exists.
   */
  function seedWithUncheckpointedDeletes() {
    const live = makeDb('live.db');
    live.db.run('PRAGMA journal_mode = WAL;');
    seed(live.db, 'Real Household');
    const { hid } = seed(live.db, 'Leftover Test Household', 't_scraper_fixture');

    // Both households are now durable in the main database file...
    live.db.run('PRAGMA wal_checkpoint(TRUNCATE);');

    // ...and this deletion is not. It lives in the -wal until the next
    // checkpoint, which is exactly the state a running dev server leaves behind.
    live.db.run('delete from households where id = ?', [hid]);
    return live;
  }

  it('is stale: the .db alone still shows rows that were deleted', () => {
    const live = seedWithUncheckpointedDeletes();
    const target = makeDb('target.db');

    const alone = join(dir, 'alone.db');
    copyFileSync(live.path, alone);

    const result = validateImportCandidate(alone, target.db);

    // Structurally impeccable, which is exactly the problem.
    expect(result.ok).toBe(true);
    expect(result.households).toContain('Leftover Test Household');
  });

  it('is correct once the -wal is carried across and folded in', () => {
    const live = seedWithUncheckpointedDeletes();
    const target = makeDb('target.db');

    const paired = join(dir, 'paired.db');
    copyFileSync(live.path, paired);
    copyFileSync(`${live.path}-wal`, `${paired}-wal`);
    foldWalIntoDatabase(paired);

    const result = validateImportCandidate(paired, target.db);

    expect(result.ok).toBe(true);
    expect(result.households).toEqual(['Real Household']);
  });

  it('reports household and account names, which is what lets a person notice', () => {
    const target = makeDb('target.db');
    const source = makeDb('source.db');
    seed(source.db, 'Move to Alicante');

    const result = validateImportCandidate(source.path, target.db);

    expect(result.households).toEqual(['Move to Alicante']);
    expect(result.accounts).toEqual(['seeded']);
  });
});

describe('importDatabaseFile', () => {
  it('copies households, users, profiles, apartments and messages', () => {
    const target = makeDb('target.db');
    const source = makeDb('source.db');
    seed(source.db, 'Move to Alicante');

    const imported = importDatabaseFile(source.path, target.db);

    expect(imported).toMatchObject({ households: 1, users: 1, apartments: 1, messages: 1 });
    const household = target.db.query<{ name: string; anthropic_api_key: string }, []>(
      'select name, anthropic_api_key from households'
    ).get();
    expect(household?.name).toBe('Move to Alicante');
    // The stored key is the whole reason a file import beats retyping.
    expect(household?.anthropic_api_key).toBe('sk-ant-secret-key');
  });

  it('does not carry sessions across', () => {
    const target = makeDb('target.db');
    const source = makeDb('source.db');
    seed(source.db, 'Move to Alicante');

    importDatabaseFile(source.path, target.db);

    const sessions = target.db.query<{ c: number }, []>('select count(*) c from user_sessions').get();
    expect(sessions?.c).toBe(0);
  });

  it('replaces whatever the target already held', () => {
    const target = makeDb('target.db');
    seed(target.db, 'Old Household');
    const source = makeDb('source.db');
    seed(source.db, 'New Household');

    importDatabaseFile(source.path, target.db);

    const names = target.db.query<{ name: string }, []>('select name from households').all();
    expect(names).toHaveLength(1);
    expect(names[0]!.name).toBe('New Household');
  });

  it('leaves foreign keys enabled afterwards', () => {
    const target = makeDb('target.db');
    const source = makeDb('source.db');
    seed(source.db, 'Move to Alicante');

    importDatabaseFile(source.path, target.db);

    const pragma = target.db.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get();
    expect(pragma?.foreign_keys).toBe(1);
    // And the constraint is genuinely live again, not just reported on.
    expect(() =>
      target.db.run('insert into apartments (id,household_id,title,status,created_at,updated_at) values (?,?,?,?,?,?)', [
        crypto.randomUUID(),
        'no-such-household',
        'Orphan',
        'QUALIFIED',
        Date.now(),
        Date.now(),
      ])
    ).toThrow();
  });

  it('rolls back completely when the copy fails', () => {
    const target = makeDb('target.db');
    seed(target.db, 'Original');

    // Points at a path that is not a database at all, so ATTACH or the copy
    // fails partway. The target must be exactly as it was.
    const broken = join(dir, 'broken.db');
    Bun.write(broken, 'garbage');

    expect(() => importDatabaseFile(broken, target.db)).toThrow();

    const names = target.db.query<{ name: string }, []>('select name from households').all();
    expect(names).toHaveLength(1);
    expect(names[0]!.name).toBe('Original');
  });
});
