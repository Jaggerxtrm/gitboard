# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Agent Forge (display name: **OmniForge**) is a CLI/TUI orchestrator for AI agents managing Mercury stack services. The current implementation covers the **GitHub Activity Dashboard** (v0.7.2) — a web dashboard showing GitHub events, commits, and contribution data pulled via the GitHub API.

**Runtime: Bun/TypeScript only.** Never use Node APIs. Use `bun:sqlite`, `bun install`, and Bun's native `Bun.serve`.

## Commands

```bash
# Development — run both concurrently
bun run dev              # API server + poller on :3000
bun run dev:dashboard    # Vite HMR on :5173 (proxies /api and /ws to :3000)

# Type checking (no emit)
bun run lint             # or: bun run typecheck

# Tests
bun run test             # vitest run (all tests, one-shot)
bun run test:watch       # vitest watch mode

# Run a single test file
bunx vitest run tests/core/github-store.test.ts

# Production dashboard build
bun run build:dashboard  # outputs to dist/dashboard/
```

## Issue Tracking

This project uses **beads (`bd`)** for ALL task tracking. Never use TodoWrite, markdown TODOs, or other tracking tools.

```bash
bd ready                                    # Show unblocked work
bd show <id>                                # Issue detail
bd create --title="..." --description="..." --type=task --priority=2
bd update <id> --status=in_progress         # Claim work
bd close <id>                               # Complete work
bd dolt pull                                # Sync from remote
```

**Priority scale:** 0=critical, 1=high, 2=medium (default), 3=low, 4=backlog. Use numbers, not words.

## Codebase Navigation

Use **Serena LSP tools** for all code reading and editing — never read full files over ~300 lines.

```
get_symbols_overview    # map a file before reading
find_symbol             # read specific function/class body
search_for_pattern      # grep-style search across files
replace_symbol_body     # surgical symbol-level edit
insert_after_symbol     # add code after a symbol
```

For large JSX components, `replace_symbol_body` may produce partial replacements — use bash heredoc (`cat > file.tsx << 'EOF'`) for full rewrites.

## Architecture

The application runs as a **single Bun process** combining API server, GitHub poller, and static file serving. In development, Vite runs separately and proxies API calls.

### Layer structure

```
src/
  index.ts            <- entrypoint: wires DB + server + poller
  core/               <- data layer (bun:sqlite, no HTTP)
  api/                <- Hono HTTP + WebSocket server
  dashboard/          <- React SPA (Vite root)
  types/github.ts     <- shared TypeScript types
```

### Data layer (`src/core/`)

- **`store.ts`** — `createDatabase(path)` opens/creates `state.db` with WAL mode and all 6 tables.
- **`github-store.ts`** — typed CRUD functions over the 3 GitHub tables.
- **`github-poller.ts`** — `GithubPoller` class with `start(repos)`, `stop()`, `backfill(repo)`. Auth via `gh auth token` first, then `GITHUB_TOKEN` env var.
- **`github-discover.ts`** — auto-discovers repos on first run via `gh repo list`, falls back to REST API.

Database path: `~/.agent-forge/state.db` (override with `AGENT_FORGE_DB` env var).

### API bridge (`src/api/`)

- **`server.ts`** — `createApp(db)` returns `{ app, registry, wsHandler }`; `startServer(db, options)` calls `Bun.serve`.
- **`routes/github.ts`** — 9 REST endpoints under `/api/github/`.
- **`ws/channels.ts`** — `ChannelRegistry` pub/sub. Channel `github:activity` pushes `new_event`/`new_commits`.
- **`ws/handler.ts`** — `WsHandler` connection lifecycle.

### Dashboard UI (`src/dashboard/`)

React 19 SPA, Vite 7 build, Tailwind CSS v4 (`@tailwindcss/vite` plugin required).

Key conventions:
- **`lib/`** not `api/` — renamed to avoid Vite proxy collision.
- Icons: `@primer/octicons-react` only — no emoji, no custom SVGs.
- Lists: `@tanstack/react-virtual` for virtualised event lists — use `measureElement` for dynamic row heights (e.g. accordion rows).
- State: Zustand (`stores/github.ts`) — no Redux, no Context API.
- CSS: CSS custom properties (`var(--*)`) only — no hardcoded hex values.
- `lib/client.ts` — `ApiClient` class, singleton `apiClient` exported.
- `lib/ws.ts` — `WsClient` with exponential-backoff auto-reconnect.

`vite.config.ts` root is `src/dashboard/`. `server.fs.allow: ['.']` is required so Vite can serve `src/types/` (outside the dashboard root).

### Testing

- Backend tests (`tests/core/`, `tests/api/`): `environment: "node"`.
- Dashboard tests (`tests/dashboard/`): `environment: "happy-dom"`.
- SSR tests use `renderToStaticMarkup` — Zustand store state set in `beforeEach` is NOT visible in SSR renders (use pure logic unit tests for store-dependent behaviour instead).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_FORGE_DB` | `~/.agent-forge/state.db` | SQLite database path |
| `PORT` | `3000` | API server port |
| `GITHUB_TOKEN` | (from `gh auth token`) | GitHub API auth fallback |

## Key Design Constraints

- Use `bun:sqlite` — not `better-sqlite3` or any other SQLite binding.
- Use Hono — not Express, Fastify, or any other HTTP framework.
- Tailwind v4 — the `@tailwindcss/vite` plugin is required; `tailwind.config.js` is not used.
- The `src/dashboard/lib/` directory must stay named `lib/` (not `api/`).
- No Telegram replacement — Mercury alerting pipeline is preserved as-is.

## Reference Docs

Full specs live in `docs/`. Read order for implementers: `PRD.md` → `github-dashboard.md` → `dashboard-design.md` → `pi-engine.md` → `omni-specialist.md`. The `HANDOFF.md` at the repo root has the complete implementation order and validation checklist.

Multi-repo architecture (future): `docs/omniforge-architecture.md`.
