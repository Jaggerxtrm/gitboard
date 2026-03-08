# Gitboard

Self-hosted GitHub activity dashboard. Polls your repos via the GitHub API and shows a live, filterable feed of events, commits, PRs, and contribution data — all in one place.

**v0.7.2** · Bun · TypeScript · React 19 · SQLite

---

## What it does

- **Live activity feed** — PushEvents, PRs, issues, releases streamed in real-time via WebSocket
- **Inline commit accordion** — expand any push to see full commit list with subject + collapsible body
- **Repo sidebar** — repos sorted by last activity, relative timestamps, resizable drag handle
- **Stats bar** — 32px single-line summary: events / pushes / PRs / commits / active repos
- **Social strip** — starred/forked/member events separated into a collapsed "★ N starred this week" strip; repo names link directly to GitHub
- **Contribution heatmap** — per-day contribution grid (sidebar-pinned)
- **Filters** — click any repo to filter the timeline; reset to see everything
- **Auto-discovery** — on first run, discovers your repos via `gh repo list` with REST fallback
- **Enrichment** — PushEvents get full commit messages + diff stats; PRs get title, body, changed files

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun (not Node) |
| Language | TypeScript (strict) |
| Backend | Hono, bun:sqlite (WAL mode) |
| Frontend | React 19, Vite 7, Tailwind CSS v4, Radix UI |
| Virtualisation | @tanstack/react-virtual (dynamic row heights) |
| State | Zustand v5 |
| Icons | @primer/octicons-react |
| Testing | Vitest (210 tests) |
| Container | Docker / rootless Podman |

---

## Quick Start

### Prerequisites

- Bun v1.2+
- GitHub CLI (`gh`) authenticated **or** `GITHUB_TOKEN` env var

### Dev mode

```bash
bun install
bun run dev            # API server + GitHub poller on :3000
bun run dev:dashboard  # Vite HMR on :5173 (proxies /api → :3000)
```

Open `http://localhost:5173` in development, `http://localhost:3000` in production.

### Docker (recommended for production)

```bash
make build    # build image + start container (named: gitboard)
make up       # start without rebuilding
make logs     # follow logs
make restart  # restart without rebuild
make down     # stop + remove
make rebuild  # full rebuild, no layer cache
```

The container is named `gitboard` and auto-restarts unless stopped.

---

## Project Structure

```
src/
├── index.ts                  # Entry point — wires DB + server + poller
├── types/github.ts           # Shared TypeScript types
├── core/
│   ├── store.ts              # SQLite init, WAL mode, schema (6 tables)
│   ├── github-store.ts       # CRUD: events, commits, repos, stats
│   ├── github-poller.ts      # GitHub API ingestion + enrichment
│   └── github-discover.ts    # Repo auto-discovery
├── api/
│   ├── server.ts             # Hono app, Bun.serve, CORS, health
│   ├── routes/github.ts      # 9 REST endpoints under /api/github/
│   └── ws/                   # WebSocket pub/sub (ChannelRegistry + WsHandler)
└── dashboard/                # React SPA (Vite root: src/dashboard/)
    ├── App.tsx
    ├── components/github/
    │   ├── GithubPanel.tsx           # Main layout: sidebar + timeline
    │   ├── ActivityTimeline.tsx      # Virtualised feed, day headers, commit accordion
    │   ├── RepoSidebar.tsx           # Resizable repo list, activity-sorted
    │   ├── StatsHeader.tsx           # 32px stats bar with octicons
    │   ├── EventDetail.tsx           # Diffstat + expandable commits
    │   ├── ContributionHeatmap.tsx   # Per-day contribution grid
    │   └── EventIcon.tsx             # Octicon per event type
    ├── hooks/                # useGithubActivity, useWebSocket
    ├── lib/                  # ApiClient singleton, WsClient (exponential backoff)
    ├── stores/github.ts      # Zustand store
    └── styles/globals.css    # CSS token system (--surface-*, --text-*, --accent-*)
```

---

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/github/events` | Paginated events (filters: `repo`, `type`, `from`) |
| GET | `/api/github/events/:id` | Single event |
| GET | `/api/github/commits` | Commits (filters: `repo`, `event_id`, `from`) |
| GET | `/api/github/commits/:sha` | Single commit |
| GET | `/api/github/repos` | Tracked repos |
| GET | `/api/github/repos/stats` | 24h push/PR counts per repo |
| GET | `/api/github/contributions` | Contribution heatmap data |
| GET | `/api/github/summary` | Aggregate stats |

WebSocket: `ws://localhost:3000/ws` — subscribe to `github:activity` for live `new_event` / `new_commits` pushes.

---

## GitHub Data Enrichment

| Event | Extra API call | Data added |
|-------|---------------|------------|
| `PushEvent` | `GET /compare/{before}...{head}` | Full commit list, `message_full`, `+additions −deletions` |
| `PullRequestEvent` | `GET /pulls/{number}` | `title`, `body`, `html_url`, `additions`, `deletions`, `changed_files` |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | (`gh auth token`) | GitHub API auth |
| `PORT` | `3000` | API server port |
| `AGENT_FORGE_DB` | `~/.agent-forge/state.db` | SQLite database path |

---

## Commands

```bash
bun run dev              # API + poller
bun run dev:dashboard    # Vite HMR
bun run lint             # TypeScript check (no emit)
bun run test             # Vitest one-shot
bun run test:watch       # Vitest watch
bun run build:dashboard  # Production build → dist/dashboard/
```
