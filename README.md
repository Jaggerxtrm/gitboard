# Agent Forge

CLI/TUI orchestrator for AI agents managing Mercury stack services (52 containers, 5 stacks).

**Status:** v0.7.1 — GitHub Activity Dashboard with full event enrichment (Compare + PR APIs)
**Planned rename:** → `omniforge` (see [ROADMAP.md](./ROADMAP.md))

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun (not Node) |
| Language | TypeScript (strict) |
| Backend | Hono (HTTP + WebSocket), bun:sqlite |
| Frontend | React 19, Vite 7, Tailwind CSS v4, Radix UI |
| State | Zustand v5 |
| Testing | Vitest |
| Container | Docker / rootless Podman |

## Prerequisites

- Bun v1.2+
- GitHub CLI (`gh`) authenticated, or `GITHUB_TOKEN` env var set
- Docker or rootless Podman (for containerized deployment)

## Quick Start

```bash
bun install
bun run dev           # backend (API + GitHub poller) on :3000
bun run dev:dashboard # dashboard HMR on :5173 (proxies /api → :3000)
```

### Docker (recommended)

```bash
make up        # build + start (auto-resolves GITHUB_TOKEN from gh auth token)
make logs      # follow logs
make rebuild   # force full rebuild (no layer cache)
make down      # stop + remove containers
```

Dashboard at `http://localhost:3000` (production build served by the API process).

## Project Structure

```
src/
├── core/                    # Data layer (no HTTP)
│   ├── store.ts             # SQLite init, WAL mode, all 6 tables
│   ├── github-store.ts      # GitHub CRUD: events, commits, repos, stats
│   ├── github-poller.ts     # GitHub API ingestion + Compare/PR enrichment
│   └── github-discover.ts   # Repo auto-discovery (gh CLI → REST fallback)
├── api/                     # HTTP + WebSocket server (Hono)
│   ├── server.ts            # createApp, startServer, CORS, health check
│   ├── routes/github.ts     # 9 REST endpoints under /api/github/
│   └── ws/                  # ChannelRegistry pub/sub, WsHandler lifecycle
├── dashboard/               # React SPA (Vite root)
│   ├── App.tsx              # Gradient topbar, underline tab nav
│   ├── components/github/
│   │   ├── GithubPanel.tsx          # Three-column layout orchestrator
│   │   ├── ActivityTimeline.tsx     # Virtualised feed, day headers, Radix Accordion
│   │   ├── RepoSidebar.tsx          # Repo list, unread dots, 24h stats
│   │   ├── EventDetail.tsx          # Slide-in panel, diffstat bar, Radix Collapsible commits
│   │   ├── ContributionHeatmap.tsx  # Radix Tooltip per cell, month/day labels
│   │   ├── StatsHeader.tsx          # Inline metric strip
│   │   └── EventIcon.tsx            # Octicon-per-event-type mapping
│   ├── hooks/               # useGithubActivity, useWebSocket
│   ├── lib/                 # ApiClient singleton, WsClient with backoff
│   ├── stores/github.ts     # Zustand: events, commits, repos, repoStats, unreadRepos
│   └── styles/globals.css   # CSS token system (--surface-*, --text-*, --accent-*)
├── types/github.ts          # Shared TypeScript types
└── index.ts                 # Entry point: DB + server + poller wired together
```

## GitHub Enrichment

The poller fetches full event details for every new event — the raw Events API returns truncated payloads:

| Event type | Additional API call | Data retrieved |
|---|---|---|
| `PushEvent` | `GET /repos/{owner}/{repo}/compare/{before}...{head}` | Full commit list (`message`, `message_full`), aggregate `+additions −deletions files` |
| `PullRequestEvent` | `GET /repos/{owner}/{repo}/pulls/{number}` | `title`, `body`, `html_url`, `additions`, `deletions`, `changed_files` |

Falls back to payload data if additional calls fail (private repos, rate limit).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/github/events` | Paginated events with filters |
| GET | `/api/github/events/:id` | Single event |
| GET | `/api/github/commits` | Commits (filterable by `repo`, `event_id`, `from`) |
| GET | `/api/github/commits/:sha` | Single commit |
| GET | `/api/github/repos` | Tracked repos |
| GET | `/api/github/repos/stats` | 24h push/PR counts per repo |
| GET | `/api/github/contributions` | Contribution heatmap data |
| GET | `/api/github/summary` | Aggregate stats (events/pushes/PRs/commits/repos) |

## Commands

```bash
bun run dev           # API server + poller
bun run dev:dashboard # Vite HMR
bun run lint          # TypeScript type check
bun run test          # Vitest (all tests, one-shot)
bun run test:watch    # Vitest watch mode
bun run build:dashboard # Production build → dist/dashboard/
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_FORGE_DB` | `~/.agent-forge/state.db` | SQLite database path |
| `PORT` | `3000` | API server port |
| `GITHUB_TOKEN` | (from `gh auth token`) | GitHub API auth |

## Reference

- [`CHANGELOG.md`](./CHANGELOG.md) — version history
- [`ROADMAP.md`](./ROADMAP.md) — planned improvements (v0.7.2 UX overhaul, v0.8.0 multi-panel)
- `docs/` — full specs: `PRD.md`, `github-dashboard.md`, `dashboard-design.md`
