#!/bin/sh
# Container entrypoint: migrate, then hand the PID to the server.
#
# `packages/db/src/client.ts` auto-migrates only outside production, precisely so
# that a deployment cannot alter its schema as a side effect of a request. That
# makes migrating here mandatory, not optional.
set -eu

DB_PATH="${DATABASE_URL:-/app/data/local_leaseops.db}"
DB_DIR=$(dirname "$DB_PATH")

if [ ! -d "$DB_DIR" ]; then
  echo "❌ Database directory $DB_DIR does not exist. Mount a volume there." >&2
  exit 1
fi

if [ ! -w "$DB_DIR" ]; then
  echo "❌ Database directory $DB_DIR is not writable by uid $(id -u)." >&2
  echo "   The image runs as the non-root 'bun' user (uid 1000); chown the volume to match." >&2
  exit 1
fi

# Invoked by path rather than through the workspace script, which passes
# `--env-file=../../.env` — a file that deliberately does not exist in this
# image. Configuration comes from the container environment.
echo "⏳ Applying database migrations to $DB_PATH"
bun run packages/db/src/migrate.ts

# `exec` so the server becomes PID 1's child and receives SIGTERM directly;
# without it, `docker stop` would kill the shell and leave the socket open until
# the timeout expires.
exec "$@"
