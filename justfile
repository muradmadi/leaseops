set shell := ["bash", "-c"]

# Default recipe: list all available commands
default:
    @just --list --unsorted

# Install all workspace dependencies using Bun
setup:
    bun install

# Run all applications in development watch mode
dev:
    bun run --filter '!@leaseops/root' dev

# Run Backend API in development watch mode
dev-api:
    bun run --filter @leaseops/api dev

# Run Web Client in development watch mode
dev-web:
    bun run --filter @leaseops/web dev

# Build all workspaces for production
build:
    bun run --filter '!@leaseops/root' build

# Run unit tests across all workspaces
test:
    bun test

# Run typechecking across all workspaces
typecheck:
    bun run --filter '!@leaseops/root' typecheck

# Generate Drizzle database migrations
db-generate:
    bun run --filter @leaseops/db generate

# Run Drizzle database migrations
db-migrate:
    bun run --filter @leaseops/db migrate

# Open Drizzle Studio to inspect SQLite database
db-studio:
    bun run --filter @leaseops/db studio

# Build the hardened production image
docker-build:
    docker build -t leaseops:latest .

# Bring up the production stack (NOT docker-compose.yml, which is the dev server)
deploy:
    docker compose -f docker-compose.prod.yml up -d --build

# Follow the production container's logs
deploy-logs:
    docker compose -f docker-compose.prod.yml logs -f

# Stop the production stack, leaving the data volume intact
deploy-down:
    docker compose -f docker-compose.prod.yml down

# Consistent, WAL-safe backup of the running instance's database
backup dest="./backups":
    ./docker/backup.sh {{dest}}

# Move an existing database (e.g. your laptop's) into the production volume
import-db src="packages/db/local_leaseops.db":
    ./docker/import-db.sh {{src}}

# Write a transfer-ready copy to scp to the server (no Docker needed)
prepare-db src="packages/db/local_leaseops.db":
    ./docker/import-db.sh --prepare {{src}}

# Clean build artifacts, dist folders, and cache
clean:
    rm -rf node_modules dist .bun **/*/node_modules **/*/dist **/*/.turbo
    @echo "Cleaned all workspaces."
