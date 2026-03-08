# Agent Forge (OmniForge)

CLI/TUI orchestrator for AI agents managing Mercury stack services (52 containers, 5 stacks).

**Status:** v0.7.2 — OmniForge UX overhaul (inline commit accordion, resizable sidebar, social strip)
**Planned rename:** → `omniforge` (see [ROADMAP.md](./ROADMAP.md) and [docs/omniforge-architecture.md](./docs/omniforge-architecture.md))

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
| Issue Tracking | beads (`bd`) with Dolt backend |

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
│   ├── App.tsx              # OmniForge topbar, tab nav
│   ├── components/github/
│   │   ├── GithubPanel.tsx          # 2-column layout: sidebar + timeline
│   │   ├── ActivityTimeline.tsx     # Virtualised feed, day headers, inline commit accordion
│   │   ├── RepoSidebar.tsx          # Resizable repo list, sorted by last activity, relative timestamps
│   │   ├── StatsHeader.tsx          # 32px single-line metric bar with octicons
│   │   ├── EventDetail.tsx          # Diffstat bar, expandable commits (deferred from main layout)
│   │   ├── ContributionHeatmap.tsx  # Radix Tooltip per cell (deferred to v0.8.0)
│   │   └── EventIcon.tsx            # Octicon-per-event-type mapping
│   ├── hooks/               # useGithubActivity, useWebSocket
│   ├── lib/                 # ApiClient singleton, WsClient with backoff
│   ├── stores/github.ts     # Zustand: events, commits, repos, repoStats, unreadRepos
│   └── styles/globals.css   # CSS token system (--surface-*, --text-*, --accent-*)
├── types/github.ts          # Shared TypeScript types
└── index.ts                 # Entry point: DB + server + poller wired together
```

## Dashboard Features (v0.7.2)

| Feature | Description |
|---------|-------------|
| Repo sidebar | Resizable (drag handle), sorted by last activity, relative timestamps, own repos only |
| Activity timeline | Virtualised, day-grouped, PushEvent accordion with inline commit list |
| Commit accordion | SHA link → subject → expandable `message_full` body, 20-line soft cap |
| Stats bar | 32px single-line, octicons per stat, monospace numbers |
| Social strip | WatchEvent/ForkEvent/MemberEvent separated into collapsed "★ N starred this week" strip |
| Keyboard nav | `j`/`k` to move between events, `Escape` to deselect |

## GitHub Enrichment

| Event type | Additional API call | Data retrieved |
|---|---|---|
| `PushEvent` | `GET /repos/{owner}/{repo}/compare/{before}...{head}` | Full commit list, `message_full`, aggregate `+additions −deletions` |
| `PullRequestEvent` | `GET /repos/{owner}/{repo}/pulls/{number}` | `title`, `body`, `html_url`, `additions`, `deletions`, `changed_files` |

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
- [`ROADMAP.md`](./ROADMAP.md) — planned improvements
- [`docs/omniforge-architecture.md`](./docs/omniforge-architecture.md) — multi-repo split guide (forge-core / gitboard / forge)
- `docs/` — full specs: `PRD.md`, `github-dashboard.md`, `dashboard-design.md`
