import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { resolve } from 'path';
import * as schema from './schema';

const defaultDbPath = resolve(import.meta.dir, '../local_leaseops.db');
const dbPath = Bun.env.DATABASE_URL || defaultDbPath;

// Singleton instantiation with global HMR guard
const globalForDb = globalThis as unknown as { _leaseopsDbInstance?: Database; migrated?: boolean };

export const sqlite = globalForDb._leaseopsDbInstance ?? new Database(dbPath);
if (Bun.env.NODE_ENV !== 'production') globalForDb._leaseopsDbInstance = sqlite;

// Enforce mandatory SQLite runtime pragmas
sqlite.run('PRAGMA journal_mode = WAL;');
sqlite.run('PRAGMA foreign_keys = ON;');
sqlite.run('PRAGMA busy_timeout = 5000;');

export const db = drizzle(sqlite, { schema });

// Auto-run migrations in development or test mode on first connection
if (!globalForDb.migrated && Bun.env.NODE_ENV !== 'production') {
  try {
    const migrationsFolder = resolve(import.meta.dir, '../drizzle');
    migrate(db, { migrationsFolder });
    globalForDb.migrated = true;
  } catch (_e) {
    // Suppress if migrations folder doesn't exist yet during early setup
  }
}
