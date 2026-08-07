/**
 * Bun-native database migration runner using drizzle-orm/bun-sqlite/migrator.
 * Executes migrations directly via Bun's native SQLite driver without requiring external Node SQLite bindings.
 */
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { db, sqlite } from './client';
import { resolve } from 'path';

const migrationsFolder = resolve(import.meta.dir, '../drizzle');

console.log(`⏳ Running database migrations from ${migrationsFolder}...`);
try {
  migrate(db, { migrationsFolder });
  console.log('✅ Database migrations completed successfully.');
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
} finally {
  sqlite.close();
}
