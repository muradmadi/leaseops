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

# Clean build artifacts, dist folders, and cache
clean:
    rm -rf node_modules dist .bun **/*/node_modules **/*/dist **/*/.turbo
    @echo "Cleaned all workspaces."
