# Agent Forge

CLI/TUI orchestrator for AI agents managing Mercury stack services (52 containers, 5 stacks).

**Status:** v0.7.0 — GitHub Activity Dashboard (first omni-dashboard panel implemented)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun (not Node) |
| Language | TypeScript (strict) |
| Backend | Hono (HTTP + WebSocket), bun:sqlite |
| Frontend | React 19, Vite 7, Tailwind CSS v4 |
| State | Zustand v5 |
| Testing | Vitest |

## Prerequisites

- Bun v1.2+
- GitHub CLI (`gh`) authenticated, or `GITHUB_TOKEN` env var set

## Quick Start

```bash
bun install
bun run dev           # backend (API + GitHub poller)
bun run dev:dashboard # dashboard (separate terminal)
```

Dashboard at http://localhost:5173, API at http://localhost:3000.

## Project Structure

```
src/
├── core/                  # Data layer
│   ├── store.ts           # SQLite database init (state.db)
│   ├── github-store.ts    # GitHub data access (events, commits, repos)
│   ├── github-poller.ts   # GitHub API ingestion loop (5-min interval)
│   └── github-discover.ts # Repository discovery and filtering
├── api/                   # HTTP + WebSocket server
│   ├── server.ts          # Hono server setup
│   ├── routes/github.ts   # REST endpoints for GitHub data
│   └── ws/                # WebSocket channels and handler
├── dashboard/             # React frontend
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/github/ # GitHub Activity panel components
│   │   ├── GithubPanel.tsx
│   │   ├── ActivityTimeline.tsx
│   │   ├── CommitList.tsx
│   │   ├── ContributionHeatmap.tsx
│   │   ├── RepoFilter.tsx
│   │   └── StatsHeader.tsx
│   ├── hooks/             # useGithubActivity, useWebSocket
│   ├── lib/               # API client, WebSocket client
│   └── stores/            # Zustand stores
├── types/github.ts        # Shared TypeScript types
└── index.ts               # Entry point
tests/                     # Mirrors src/ structure
docs/                      # Design specifications
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start backend server |
| `bun run dev:dashboard` | Start Vite dev server for dashboard |
| `bun run build:dashboard` | Production build of dashboard |
| `bun test` | Run all tests (143 tests, 16 files) |
| `bun run typecheck` | TypeScript type checking |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub API token (alternative to `gh auth`) | — |

## Tests

```bash
bun test           # run all 143 tests
bun run test:watch # watch mode
```

Tests cover the full stack: SQLite store, GitHub poller, API routes, WebSocket channels, Zustand stores, and React components (via react-dom/server SSR rendering).

## Next Phases

| Phase | Version | What |
|-------|---------|------|
| Service Health Prep | v0.8.0 | Prometheus proxy, service health table, correlation engine |
| Production Release | v1.0.0 | CI/CD, npm publish, migration guide |
| Hooks & Security Guards | v1.3.0 | PreToolUse guards (path boundary, danger, capability, AskUserQuestion blocking) |
| Proactive Specialists | v1.4.0 | Heartbeat system, specialist knowledge persistence (mulch pattern) |
| Autonomous Operations | v1.5.0 | Git worktrees, 4-tier merge resolution, event-driven triggers, Mercury alert integration |

See `docs/PRD.md` roadmap for full details.

## Agent Execution (v0.3.0+)

When implementing the specialist/agent execution layer, use the `AgentSession` interface defined in `docs/omni-specialist.md` §4.4. Do not couple the specialist loader directly to `@mariozechner/pi`.

- **Recommended implementation**: `PiAgentSession` — thin wrapper over `@mariozechner/pi` RpcClient
- **Qwen backend**: use `provider: 'openai'` with `baseURL: https://dashscope.aliyuncs.com/compatible-mode/v1`, read OAuth token from `~/.qwen/oauth_creds.json`. See `docs/pi-engine.md` §7.1.

## Documentation

- [docs/PRD.md](docs/PRD.md) — Full product requirements (authority)
- [docs/github-dashboard.md](docs/github-dashboard.md) — GitHub Activity Dashboard spec
- [docs/dashboard-design.md](docs/dashboard-design.md) — Omni-Dashboard shell
- [docs/pi-engine.md](docs/pi-engine.md) — Pi RPC execution layer
- [docs/omni-specialist.md](docs/omni-specialist.md) — Specialist YAML schema (§4.4: AgentSession)
- [docs/ecosystem-alignment-delta.md](docs/ecosystem-alignment-delta.md) — Cross-system alignment decisions

## License

Private — not yet published.
