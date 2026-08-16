#!/bin/sh
# Move an existing LeaseOps database into a deployed instance's volume.
#
# There is deliberately no JSON export/import feature. The laptop and the server
# run the same SQLite engine, the same Drizzle schema and the same migrations, so
# the database file already IS the export — a complete, lossless, typed one. A
# JSON round-trip would only add ways to lose data (Drizzle stores timestamps as
# integers and several columns as encoded JSON text), and an export endpoint
# would mean a route that serves every household's plaintext Anthropic key.
#
# The work splits in two so it can cross a machine boundary:
#
#   prepare   needs `bun` and the source database. No Docker. Produces one
#             self-contained file, safe to copy anywhere.
#   install   needs `docker` pointed at the daemon running LeaseOps. No bun,
#             no repo, no source database.
#
# USAGE
#   ./docker/import-db.sh [src.db]                 prepare + install together
#   ./docker/import-db.sh --prepare [src.db] [-o out.db]    prepare only
#   ./docker/import-db.sh --install <file.db>               install only
#
# Running both together works across the network too, because every Docker
# command here is either a named-volume operation or `docker cp` — both of which
# the daemon executes on its own host. Set a remote context and the same single
# command deploys from the laptop:
#
#   docker context create prox --docker host=ssh://you@vm
#   docker context use prox && ./docker/import-db.sh
#
# There is no bind mount of a local path anywhere in this script, and there must
# not be: with a remote daemon `-v /local/path:/x` silently resolves on the
# SERVER, mounting an empty or wrong directory instead of failing.
set -eu

CONTAINER="${LEASEOPS_CONTAINER:-leaseops}"
DB_IN_CONTAINER=/app/data/local_leaseops.db
FORCE="${FORCE:-0}"

die() { echo "❌ $1" >&2; exit 1; }

# One EXIT handler for both jobs. A second `trap ... EXIT` anywhere below would
# silently replace the first, so the staging directory and the restart have to
# be cleaned up together.
STAGE=""
RESTART=0
CONTAINER_TO_RESTART=""
cleanup() {
  [ -n "$STAGE" ] && rm -rf "$STAGE"
  # Runs on failure as well as success: the app must not be left down.
  [ "$RESTART" = "1" ] && docker start "$CONTAINER_TO_RESTART" >/dev/null 2>&1
  return 0
}
trap cleanup EXIT

MODE=both
SRC=""
OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --prepare) MODE=prepare ;;
    --install) MODE=install ;;
    -o) shift; OUT="${1:-}" ;;
    -*) die "Unknown option: $1" ;;
    *) SRC="$1" ;;
  esac
  shift
done

[ -n "$SRC" ] || SRC="packages/db/local_leaseops.db"

# ---------------------------------------------------------------------------
# prepare — validate the source and write a consistent, self-contained copy.
# ---------------------------------------------------------------------------
prepare() {
  _src="$1"
  _out="$2"

  [ -f "$_src" ] || die "No database at $_src"
  command -v bun >/dev/null 2>&1 \
    || die "prepare needs 'bun' (run it on the machine holding the database, not the server)."

  # Only meaningful inside the repo; skip the check rather than fail elsewhere.
  if [ -f packages/db/drizzle/meta/_journal.json ]; then
    _entries=$(grep -c '"tag"' packages/db/drizzle/meta/_journal.json)
  else
    _entries=0
  fi

  bun -e '
const { Database } = require("bun:sqlite");
const [src, out, journalEntries] = [process.argv[1], process.argv[2], Number(process.argv[3])];

const db = new Database(src, { readonly: true });

const verdict = Object.values(db.query("PRAGMA integrity_check").get())[0];
if (verdict !== "ok") { console.error(`Integrity check failed: ${verdict}`); process.exit(1); }

const tables = db.query("select name from sqlite_master where type=\"table\"").all().map((r) => r.name);
for (const required of ["households", "users", "apartments", "__drizzle_migrations"]) {
  if (!tables.includes(required)) {
    console.error(`Not a LeaseOps database: no "${required}" table.`);
    process.exit(1);
  }
}

const applied = db.query("select count(*) c from __drizzle_migrations").get().c;
if (journalEntries > 0 && applied > journalEntries) {
  // The data knows about schema changes this checkout does not. Importing would
  // leave columns the running code cannot see, and the entrypoint would have
  // nothing to apply — so it would look fine and quietly misbehave.
  console.error(
    `Source has ${applied} migrations but this checkout only has ${journalEntries}.\n` +
    `   The database is NEWER than the code. Deploy the matching commit first.`
  );
  process.exit(1);
}
if (journalEntries > 0 && applied < journalEntries) {
  console.log(`ℹ️  Source is ${journalEntries - applied} migration(s) behind; the container applies them on start.`);
}

const counts = ["households", "users", "apartments", "messages", "user_profiles"]
  .map((t) => `${db.query(`select count(*) c from ${t}`).get().c} ${t}`)
  .join(", ");
console.log(`✅ Valid LeaseOps database: ${counts}`);

// Drizzle maps this to `anthropicApiKey` in TypeScript, but the SQL column is
// snake_case — the camelCase name here failed quietly instead of loudly.
const keyed = db.query(
  "select count(*) c from households where anthropic_api_key is not null and length(anthropic_api_key) > 0"
).get().c;
console.log(
  keyed > 0
    ? `🔑 ${keyed} household(s) carry a stored Anthropic key — it moves with the data.`
    : `ℹ️  No stored Anthropic key in this database; add one in Settings → AI after importing.`
);

// Consistent even while the source is in use: VACUUM INTO folds in the WAL,
// which a plain file copy does not — that is why this is not just `cp`.
db.run("VACUUM INTO ?", [out]);

// Sessions were issued to a browser talking to localhost. Carrying them to a
// public hostname means live tokens on a host they were never scoped to, so
// everyone signs in again — the right posture after moving data.
const copy = new Database(out);
const cleared = copy.run("DELETE FROM user_sessions").changes;
copy.close();
if (cleared) console.log(`🧹 Cleared ${cleared} old session(s); sign in again after this.`);
' "$_src" "$_out" "$_entries" || die "Source database rejected."
}

# ---------------------------------------------------------------------------
# install — put a prepared file into the running instance's volume.
# ---------------------------------------------------------------------------
install_db() {
  _file="$1"

  [ -f "$_file" ] || die "No file at $_file"
  command -v docker >/dev/null 2>&1 || die "install needs 'docker'."

  # Cheap sanity check that survives having no bun here: every SQLite file
  # starts with this string. Deep validation happened in prepare.
  case "$(head -c 15 "$_file" 2>/dev/null)" in
    "SQLite format 3") ;;
    *) die "$_file is not a SQLite database." ;;
  esac

  docker inspect "$CONTAINER" >/dev/null 2>&1 \
    || die "No container named '$CONTAINER'. Deploy first, then re-run.
   (Different name? Set LEASEOPS_CONTAINER=...)"

  VOLUME=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' "$CONTAINER")
  [ -n "$VOLUME" ] || die "Could not find the /app/data volume on $CONTAINER."

  # Read-only peek, safe against the running container. Every reason to abort
  # must be found BEFORE anything stops — an earlier version took the container
  # down and then refused, leaving the app off.
  EXISTING=$(docker run --rm -v "$VOLUME":/data alpine \
    sh -c 'if [ -f /data/local_leaseops.db ]; then wc -c < /data/local_leaseops.db; else echo 0; fi' | tr -d ' ')

  # A freshly migrated, empty database is ~20 kB; bigger means it holds rows.
  if [ "$EXISTING" -gt 20480 ] && [ "$FORCE" != "1" ]; then
    die "The target already holds a database ($EXISTING bytes) with data in it.
   This REPLACES it — there is no merge. Back it up first:
     ./docker/backup.sh
   then re-run with:  FORCE=1 $0 --install $_file"
  fi

  # `docker stop`, not `docker compose stop`: this must work regardless of which
  # project created the stack. Dokploy picks its own compose project name, and
  # the compose file may not even exist on this machine.
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" = "true" ]; then
    echo "⏸  Stopping $CONTAINER — a live SQLite connection must not have its file swapped."
    docker stop "$CONTAINER" >/dev/null
    CONTAINER_TO_RESTART="$CONTAINER"
    RESTART=1
  fi

  # The stale WAL and shared-memory files belong to the OLD database. Left in
  # place, SQLite would try to replay them over the new one.
  docker run --rm -v "$VOLUME":/data alpine \
    sh -c 'rm -f /data/local_leaseops.db /data/local_leaseops.db-wal /data/local_leaseops.db-shm'

  # Streams through the Docker API rather than a bind mount, which is what lets
  # this work against a remote daemon.
  docker cp "$_file" "$CONTAINER:$DB_IN_CONTAINER"

  # docker cp carries the source file's uid, which is whatever it happened to be
  # on the other machine. The container runs as uid 1000 and must own this.
  docker run --rm -v "$VOLUME":/data alpine \
    sh -c 'chown 1000:1000 /data/local_leaseops.db && chmod 600 /data/local_leaseops.db'

  echo "📦 Installed into volume $VOLUME"
  [ "$RESTART" = "1" ] && echo "▶️  Restarting $CONTAINER"
}

case "$MODE" in
  prepare)
    [ -n "$OUT" ] || OUT="leaseops-transfer.db"
    rm -f "$OUT"
    prepare "$SRC" "$OUT"
    echo "📄 Wrote $OUT ($(du -h "$OUT" | cut -f1))"
    echo "   Copy it to the server and run there:  ./import-db.sh --install $(basename "$OUT")"
    echo "   ⚠️  It contains plaintext API keys — use scp, and delete it afterwards."
    ;;
  install)
    install_db "$SRC"
    echo "✅ Done. Households, listings, criteria, threads and the stored API key are in place."
    ;;
  both)
    STAGE=$(mktemp -d)
    prepare "$SRC" "$STAGE/import.db"
    install_db "$STAGE/import.db"
    echo "✅ Done. Households, listings, criteria, threads and the stored API key are in place."
    ;;
esac
