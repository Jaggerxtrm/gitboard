# Agent Forge — Implementation Handoff

> **Date**: 2026-03-06
> **From**: Architecture & Design session
> **To**: Implementer agent
> **Status**: All design docs committed and pushed to `main`

---

## Project Context

Agent Forge is a CLI/TUI orchestrator for AI agents managing 52 Mercury stack services. The project is currently **docs-only** — no source code exists yet. Your job is to turn these specs into a working system.

**Runtime**: Bun/TypeScript (not Node). Use `bun:sqlite`, `bun install`, Vitest for tests.

---

## Reference Documents (read in this order)

| Priority | Document | What it covers |
|----------|----------|----------------|
| 1 | `docs/PRD.md` | Full product spec — architecture, schemas, roadmap, specialist YAML format, spawn flow, database schema, alert integration. **This is the authority.** |
| 2 | `docs/github-dashboard.md` | GitHub Activity Dashboard (v0.7.0) — SQLite tables, poller design, API endpoints, WebSocket channel, UI wireframes, Octicons color system. **This is what you build first.** |
| 3 | `docs/dashboard-design.md` | Omni-Dashboard shell — Hono + React + Vite + Tailwind, API bridge, WebSocket protocol, file structure, phased roadmap |
| 4 | `docs/pi-engine.md` | Pi RPC execution layer — how agents are spawned, `agents.md` convention, `skill_inherit` composition, `execution.mode` |
| 5 | `docs/omni-specialist.md` | Specialist YAML schema (unified across unitAI/Agent Forge/Mercury) — all fields documented, including `skill_inherit` and `diagnostic_scripts` |
| 6 | `docs/ecosystem-alignment-delta.md` | Cross-system alignment decisions — Bun migration, circuit breaker model, AF_STATUS format, staleness algorithm |

---

## Implementation Order

### Phase 1: Data Layer (`src/core/`)

**Start here.** Everything depends on SQLite.

#### 1.1 `src/core/store.ts` — Database initialization

Create `state.db` with `bun:sqlite`. Tables defined in PRD.md (search for `CREATE TABLE`):
- `sessions` — agent session lifecycle
- `messages` — inter-agent message bus
- `specialist_events` — specialist lifecycle tracking
- `github_events` — GitHub activity (schema in `github-dashboard.md` Section 3)
- `github_commits` — commit details with FK to events
- `github_repos` — tracked repositories with groups

#### 1.2 `src/core/github-store.ts` — GitHub data access

Typed read/write functions over the 3 GitHub tables:
- Insert events/commits from poller
- Query by repo, date range, event type
- Contribution aggregation (daily/weekly counts)
- Repo group management

Reference: `github-dashboard.md` Section 3 (Data Model) and Section 5 (API — shows what queries are needed).

#### 1.3 `src/core/github-poller.ts` — GitHub ingestion loop

Polls GitHub REST + GraphQL API every 5 minutes:
- Auth: `gh auth token` or `GITHUB_TOKEN` env var
- Transforms GitHub API events into `github_events`/`github_commits` rows
- Deduplicates by event ID
- Emits to WebSocket channel on new data (when API layer exists)

Reference: `github-dashboard.md` Section 4 (Ingestion).

**Checkpoint**: After Phase 1, you can run `bun run src/core/github-poller.ts` and inspect `state.db` with any SQLite viewer. The entire data pipeline works without a server or UI.

---

### Phase 2: API Bridge (`src/api/`)

#### 2.1 `src/api/server.ts` — Hono HTTP + WebSocket server

- Hono framework (Bun-native, zero-dependency)
- Serves REST endpoints and upgrades to WebSocket
- Serves static Dashboard build in production

Reference: `dashboard-design.md` Section 2.1 and Section 4.

#### 2.2 GitHub REST endpoints

8 routes defined in `github-dashboard.md` Section 5:

```
GET /api/github/events          — paginated, filterable by repo/type/date
GET /api/github/events/:id      — single event detail
GET /api/github/commits          — paginated, filterable
GET /api/github/commits/:sha    — single commit
GET /api/github/repos            — tracked repos with groups
PUT /api/github/repos/:name     — update tracking/group/color
GET /api/github/contributions    — daily contribution counts
GET /api/github/summary          — stats for dashboard header
```

#### 2.3 WebSocket channels

Channel system defined in `dashboard-design.md` Section 4.2:
- `github:activity` — pushes `new_event`/`new_commits` on poller ingestion
- Other channels (`session:{id}`, `output:{id}`, `messages`, `protocol:{id}`, `system`) come later

**Checkpoint**: After Phase 2, all endpoints work with `curl`. The poller writes data, the API serves it.

---

### Phase 3: Dashboard UI (`src/dashboard/`)

#### 3.1 Shell + routing

- React + Vite + Tailwind CSS
- Tab-based layout: GitHub is the first (and initially only) tab
- Zustand for state management
- WebSocket client with auto-reconnect

Reference: `dashboard-design.md` Section 2.2, file structure in Section 7.

#### 3.2 GitHub Panel components

Defined in `github-dashboard.md` Section 6 (UI Design):

- **ActivityTimeline** — vertical event list with Octicons, subtle colors per event type
- **CommitList** — scrollable commit messages alongside the timeline
- **ContributionHeatmap** — daily activity grid (like GitHub profile)
- **RepoFilter** — filter by repo/group, toggle tracking
- **StatsHeader** — today/week/month counters

Key constraints from design session:
- No emoji — use `@primer/octicons-react` (GitCommit, GitPullRequest, GitMerge, IssueOpened, etc.)
- Subtle, non-garish colors per event type (see color table in `github-dashboard.md` Section 6.1)
- Commit messages must be readable by scrolling a list
- Use `@tanstack/react-virtual` for large event lists

**Checkpoint**: After Phase 3, the GitHub dashboard is fully functional end-to-end.

---

## What NOT to Build Yet

These come in later phases — don't scaffold them now:

| Feature | Phase | Why not now |
|---------|-------|-------------|
| Agent/session management (spawn, kill, send) | v0.3.0+ | Needs pi engine integration |
| Specialist system (YAML loading, validation) | v0.3.0+ | Needs pi engine + profile system |
| Fleet Overview / Agent Detail panels | v0.4.0 | Needs session management |
| Protocol Monitor | v0.5.0 | Needs protocol engine |
| Service Health panel | v0.8.0 | Needs Prometheus proxy |
| Alert integration / incidents | v1.5.0 | Needs webhook receiver + specialist monitoring |

---

## Key Technical Decisions (already made)

- **Bun/TS only** — no Node, no `better-sqlite3`, use `bun:sqlite` native
- **Hono** for HTTP — not Express, not Fastify
- **SQLite** in `state.db` — single file, no external DB
- **`gh auth token`** for GitHub auth — falls back to `GITHUB_TOKEN` env var
- **Octicons** (`@primer/octicons-react`) — not custom icons, not emoji
- **Tailwind CSS** — not CSS modules, not styled-components
- **Zustand** for state — not Redux, not MobX
- **No Grafana replacement** — agents query Prometheus directly when needed (v1.4.0+)
- **No Telegram replacement** — existing Mercury alerting pipeline preserved

---

## Project Structure (target)

```
src/
  core/
    store.ts               # bun:sqlite init + migrations
    github-store.ts        # GitHub table operations
    github-poller.ts       # GitHub API ingestion loop
  api/
    server.ts              # Hono HTTP + WebSocket
    routes/
      github.ts            # /api/github/* endpoints
    ws/
      handler.ts           # WebSocket connection manager
      channels.ts          # Channel subscription system
  dashboard/
    index.html
    App.tsx
    api/
      client.ts            # HTTP fetch wrapper
      ws.ts                # WebSocket client + reconnect
    stores/
      github.ts            # Zustand — GitHub activity state
    components/
      github/
        GithubPanel.tsx
        ActivityTimeline.tsx
        CommitList.tsx
        ContributionHeatmap.tsx
        RepoFilter.tsx
        StatsHeader.tsx
    hooks/
      useWebSocket.ts
      useGithubActivity.ts
```

---

## Validation

When the implementation is complete, these should all work:

1. `bun run src/core/github-poller.ts` populates `state.db` with real GitHub data
2. `curl localhost:3000/api/github/summary` returns stats JSON
3. `curl localhost:3000/api/github/events?repo=Jaggerxtrm/agent-forge` returns filtered events
4. Opening `localhost:3000` in a browser shows the GitHub Activity panel with real data
5. New GitHub events appear in the dashboard within the poll interval (5 min default)
