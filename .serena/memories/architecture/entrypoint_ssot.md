---
title: "Application Entrypoint"
domain: agent-forge
subcategory: architecture
version: 1.0.0
created: 2026-03-06
updated: 2026-03-06
tracks:
  - "src/index.ts"
  - "package.json"
---

<!-- INDEX -->
## Sections
- [Overview](#overview)
- [Startup Flow](#startup-flow)
- [Scripts](#scripts)
- [Environment Variables](#environment-variables)
<!-- /INDEX -->

## Overview

`src/index.ts` is the main entrypoint. It wires together the database, API server, GitHub auto-discovery, and poller into a single process.

## Startup Flow

1. `createDatabase(DB_PATH)` — opens/creates SQLite database
2. `startServer(db, { port })` — starts Hono on configured port
3. `getGithubToken()` — resolves auth (gh CLI or env var)
4. If `github_repos` table is empty → runs auto-discovery via `gh repo list`
5. Filters to tracked repos → runs `poller.backfill(repo)` for each
6. `poller.start(repos)` — begins polling loop
7. SIGINT handler: stops poller, closes database

If GitHub token is unavailable, poller is disabled gracefully (server still runs).

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `bun run src/index.ts` | API server + poller (port 3000) |
| `dev:dashboard` | `vite --config vite.config.ts` | Vite HMR (port 5173, proxies to 3000) |
| `build:dashboard` | `vite build --config vite.config.ts` | Production build to dist/dashboard/ |
| `test` | `vitest run` | Run all tests |
| `test:watch` | `vitest` | Watch mode |
| `lint` / `typecheck` | `tsc --noEmit` | Type checking |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_FORGE_DB` | `~/.agent-forge/state.db` | SQLite database path |
| `PORT` | `3000` | API server port |
| `GITHUB_TOKEN` | (from `gh auth token`) | GitHub API authentication |
