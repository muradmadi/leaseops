#!/bin/sh
# Consistent backup of the running instance's database.
#
# Copying `local_leaseops.db` off the volume is NOT a backup: the database runs
# in WAL mode, so recent writes live in the sibling `-wal` file and a lone `.db`
# can be hours stale or torn. `VACUUM INTO` asks SQLite itself for a complete,
# checkpointed copy while the app keeps serving.
#
# The result contains every household's Anthropic API key in plaintext, exactly
# as the live database does. Treat the file like a `.env`: encrypt it at rest and
# do not put it anywhere the source repo goes.
#
#   ./docker/backup.sh                  → ./backups/leaseops-<timestamp>.db
#   ./docker/backup.sh /mnt/nas/lease   → that directory instead
set -eu

CONTAINER="${LEASEOPS_CONTAINER:-leaseops}"
DEST_DIR="${1:-./backups}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST="$DEST_DIR/leaseops-$STAMP.db"

mkdir -p "$DEST_DIR"

# Staged inside the data volume rather than /tmp: /tmp is a tmpfs mount in the
# production compose file, and `docker cp` cannot read across one.
STAGE=/app/data/.backup-$STAMP.db

docker exec "$CONTAINER" bun -e '
  const { Database } = require("bun:sqlite");
  const db = new Database(Bun.env.DATABASE_URL, { readonly: true });
  db.run("VACUUM INTO ?", [process.argv[1]]);
  db.close();
' "$STAGE"

docker cp "$CONTAINER:$STAGE" "$DEST"
docker exec "$CONTAINER" rm -f "$STAGE"

chmod 600 "$DEST"
echo "✅ $DEST ($(du -h "$DEST" | cut -f1))"
echo "   Contains plaintext API keys — encrypt before it leaves this machine."
