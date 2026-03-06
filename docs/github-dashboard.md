# GitHub Activity Dashboard — Design Document

**Date**: 2026-03-06
**Status**: Proposal
**Version**: 0.1.0
**Parent**: [PRD.md](./PRD.md) -- Section 9 (v0.7.0), [dashboard-design.md](./dashboard-design.md) -- Section 3
**Supersedes**: [github-tracking.md](./github-tracking.md) (ideation notes)

---

## 1. Problem Statement

Working across 50+ repositories in the Mercury stack, there is no single view to answer: "What happened yesterday across all my services?" GitHub's native UI fragments activity across repos. Existing tools (OSS Insight, Skyline, Octoprofile) focus on public analytics or cosmetics, not operational awareness.

The GitHub Activity Dashboard is the **first panel** of the omni-dashboard — designed to slot into the existing Hono + React + Tailwind architecture from `dashboard-design.md`. It is not a standalone application. It shares the same API bridge, WebSocket protocol, SQLite persistence, and component patterns. When agent-forge specialists, service health, and Grafana alerts arrive later, they plug in as additional modules within the same shell.

### Scope

| In scope | Out of scope |
|----------|-------------|
| GitHub event ingestion (REST + GraphQL) | GitHub Actions CI/CD monitoring (v0.8.0) |
| Event persistence in SQLite (beyond 90-day API limit) | Code diff rendering |
| Filterable activity timeline | Repository settings management |
| Contribution heatmap | Issue/PR management (create, assign, close) |
| Commit message browsing | Multi-user / team dashboards |
| Future integration hooks for agent-forge + alerts | Real-time webhook receiver (v1.5.0) |

---

## 2. Architecture — Integration with Existing Dashboard

The `dashboard-design.md` defines a tab-based dashboard shell with API bridge (Hono), WebSocket channels, and React frontend. The GitHub panel is a new tab alongside Fleet, Messages, Protocol, and Registry.

```
+-- agent-forge dashboard ----------------------------------------+
|  [Fleet] [GitHub] [Services] [Registry]         dawid · 3:42 PM |
+--+--------------------------------------------------------------+
```

### 2.1 Data Flow

```
GitHub REST/GraphQL API
        |
        v
github-poller.ts  (periodic, every 5 min)
        |
        v
state.db  (github_events, github_commits, github_repos tables)
        |
        +---> Hono REST routes (/api/github/*)
        |         |
        |         v
        |     Dashboard React SPA (GithubPanel)
        |
        +---> WebSocket channel (github:activity)
        |         |
        |         v
        |     Real-time timeline updates
        |
        +---> [FUTURE] Specialist agents query activity
        |     via SQLite or REST API
        |
        +---> [FUTURE] Alert correlation engine
              matches github_events.created_at
              against prometheus alerts + incidents
```

### 2.2 File Structure (within existing project)

New files only — additions to the structure defined in `dashboard-design.md` Section 11:

```
src/
  core/
    github-store.ts              # SQLite schema + CRUD for GitHub data
    github-poller.ts             # Periodic GitHub API ingestion
  api/
    routes/
      github.ts                  # REST endpoints for GitHub data
  dashboard/
    components/
      github/
        GithubPanel.tsx          # Composition root (tab content)
        ActivityFeed.tsx         # Scrollable event timeline (left)
        EventRow.tsx             # Single event in timeline
        EventIcon.tsx            # Octicon + subtle color per event type
        CommitDetail.tsx         # Detail panel (right)
        ContributionMap.tsx      # 12-week heatmap (top)
        RepoFilter.tsx           # Multi-select repo + type + branch filter
        DaySummary.tsx           # Bottom stats bar
    stores/
      github.ts                  # Zustand store for GitHub state
    hooks/
      useGithubActivity.ts       # Subscribe + filter + infinite scroll
  types/
    github.ts                    # GitHub event/commit/repo types
```

---

## 3. Data Model — SQLite

All GitHub data persists in `~/.agent-forge/state.db` alongside sessions and messages. This solves the 90-day / 300-event GitHub API limit permanently and enables agent-forge specialists to query activity via the same SQLite they already use for session coordination.

```sql
-- GitHub event types: PushEvent, PullRequestEvent, IssueCommentEvent,
-- WatchEvent, CreateEvent, DeleteEvent, PullRequestReviewEvent,
-- IssueEvent, ReleaseEvent, ForkEvent

CREATE TABLE github_events (
  id              TEXT PRIMARY KEY,        -- GitHub event ID (unique, dedup key)
  type            TEXT NOT NULL,           -- PushEvent, PullRequestEvent, etc.
  repo            TEXT NOT NULL,           -- owner/repo
  branch          TEXT,                    -- ref extracted from payload
  actor           TEXT NOT NULL,           -- GitHub username
  action          TEXT,                    -- opened, closed, merged, created...
  title           TEXT,                    -- PR title, issue title, first commit msg
  body            TEXT,                    -- full description or commit messages
  url             TEXT,                    -- html_url to GitHub
  additions       INTEGER,                -- line stats (for push/PR)
  deletions       INTEGER,
  changed_files   INTEGER,
  commit_count    INTEGER,                -- number of commits (PushEvent)
  created_at      DATETIME NOT NULL,      -- event timestamp from GitHub
  ingested_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE github_commits (
  sha             TEXT PRIMARY KEY,
  repo            TEXT NOT NULL,
  branch          TEXT,
  author          TEXT NOT NULL,
  message         TEXT NOT NULL,           -- full commit message
  url             TEXT,                    -- html_url to commit
  additions       INTEGER,
  deletions       INTEGER,
  changed_files   INTEGER,
  event_id        TEXT REFERENCES github_events(id),
  committed_at    DATETIME NOT NULL
);

CREATE TABLE github_repos (
  full_name       TEXT PRIMARY KEY,        -- owner/repo
  display_name    TEXT,                    -- short alias for dashboard UI
  tracked         BOOLEAN DEFAULT TRUE,    -- user can disable tracking
  group_name      TEXT,                    -- optional grouping (e.g. "mercury", "infra")
  last_polled_at  DATETIME,
  color           TEXT                     -- hex color for UI differentiation
);

CREATE INDEX idx_events_repo_date ON github_events(repo, created_at DESC);
CREATE INDEX idx_events_type_date ON github_events(type, created_at DESC);
CREATE INDEX idx_events_created   ON github_events(created_at DESC);
CREATE INDEX idx_commits_repo     ON github_commits(repo, committed_at DESC);
CREATE INDEX idx_commits_event    ON github_commits(event_id);
CREATE INDEX idx_repos_group      ON github_repos(group_name);
```

### Why state.db (not a separate database)?

Following the dual-database principle from Mercury Terminal (mercury.db for domain data, state.db for agent coordination): GitHub activity is **agent-forge domain data**. Specialists will query it to correlate commits with alerts. The incidents table (PRD v1.5.0) will reference `github_events.id` to link incidents to the code changes that caused them. One database, one WAL lock, one backup path.

---

## 4. Ingestion — GitHub Poller

### 4.1 Authentication

Uses GitHub CLI token (already authenticated) or `GITHUB_TOKEN` env var:

```typescript
// src/core/github-poller.ts
function getGithubToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  // Fall back to gh CLI auth
  const result = Bun.spawnSync(['gh', 'auth', 'token']);
  if (result.exitCode === 0) return result.stdout.toString().trim();
  throw new Error('No GitHub token found. Run `gh auth login` or set GITHUB_TOKEN.');
}
```

With `repo` + `read:user` scopes, full private repo visibility is available.

### 4.2 Polling Strategy

```
Every 5 minutes (configurable via config.yaml: github.poll_interval_seconds):
  1. For each tracked repo in github_repos:
     GET /repos/{owner}/{repo}/events?per_page=100
     - Deduplicate by event ID (INSERT OR IGNORE)
     - Extract commits from PushEvent payloads
     - Store in github_events + github_commits

  Once daily (contribution heatmap data):
     GraphQL: viewer.contributionsCollection.contributionCalendar
     - Cache in memory, refresh daily at midnight
```

### 4.3 Rate Limits

GitHub REST API: 5,000 requests/hour with PAT. With 52 repos polled every 5 min = 624 requests/hour. Well within limits. The poller tracks `X-RateLimit-Remaining` and backs off at 10% remaining.

### 4.4 Initial Backfill

On first run or when adding a new repo:
```
GET /repos/{owner}/{repo}/events?per_page=100 (pages 1-3)
```
This captures the last ~300 events (GitHub's maximum retention). For deeper history, the GraphQL `contributionsCollection` API provides aggregate stats going back 1 year.

---

## 5. API Endpoints

Added to the Hono API bridge alongside existing session/message/protocol routes:

```
GET  /api/github/events                    # Paginated activity timeline
     ?repos=mercury-api,mercury-ingestion   # comma-separated repo filter
     ?types=PushEvent,PullRequestEvent      # event type filter
     ?branch=main                           # branch filter
     ?from=2026-03-05&to=2026-03-06        # date range
     ?search=rate+limiter                   # full-text search on title/body
     ?group=mercury                         # repo group filter
     ?limit=50&offset=0                     # pagination

GET  /api/github/events/:id                # Single event with commits

GET  /api/github/commits                   # Commits, paginated
     ?repo=mercury-api&from=2026-03-05

GET  /api/github/repos                     # Tracked repos list
POST /api/github/repos                     # Add repo to track
PUT  /api/github/repos/:name               # Update (color, display_name, group)
DELETE /api/github/repos/:name             # Stop tracking

GET  /api/github/contributions             # Heatmap data (12 weeks)
GET  /api/github/summary?period=today      # Aggregate stats (today|week|month)
```

### WebSocket Channel

```typescript
// New channel added to ws/channels.ts
// Server pushes new events as they are ingested
{ type: "event", channel: "github:activity", event: "new_event",
  data: { id: "...", type: "PushEvent", repo: "mercury-api", ... } }
```

---

## 6. UI Design

### 6.1 Design Language

| Principle | Implementation |
|-----------|----------------|
| Minimal | No emoji. No decorative elements. Information density. |
| Subtle color | HSL-based palette at low saturation on dark background (`#0f172a`) |
| GitHub-native iconography | `@primer/octicons-react` for all event type indicators |
| Professional typography | System monospace for commits, Inter/system-ui for UI chrome |
| Scannable | Time-aligned left column, event type always visible, repo always visible |

### 6.2 Event Type Visual System

| Event Type | Octicon | Color | Hex |
|---|---|---|---|
| Push | `git-commit` | Slate blue | `#6366f1` |
| PR opened | `git-pull-request` | Emerald | `#10b981` |
| PR merged | `git-merge` | Violet | `#8b5cf6` |
| PR closed (not merged) | `git-pull-request-closed` | Muted rose | `#f43f5e` at 40% opacity |
| Review submitted | `code-review` | Amber | `#f59e0b` |
| Issue opened | `issue-opened` | Green | `#22c55e` |
| Issue closed | `issue-closed` | Neutral gray | `#6b7280` |
| Release/Tag | `tag` | Teal | `#14b8a6` |
| Branch created | `git-branch` | Neutral | `#94a3b8` |
| Star/Fork | `star` / `repo-forked` | Warm gray | `#78716c` |

All colors at low saturation against `bg-slate-900`. Hover states increase opacity by 20%. Selected state adds a 1px left border in the event's color.

### 6.3 Layout

```
+-- GitHub Activity -----------------------------------------------+
|                                                                    |
|  Contribution Map (12 weeks)                                       |
|  [Mon] ░░▒▒▓▓██░░▒▒▓▓░░░░▒▒▓▓██░░▒▒░░░░░░▒▒▓▓██████▒▒░░▒▒▓▓  |
|  [Wed] ░░▒▒██░░▒▒▓▓██▒▒▓▓▒▒░░▓▓████░░▒▒▓▓██▓▓████▒▒░░▒▒▓▓██  |
|  [Fri] ░░░░▒▒▓▓░░░░▓▓░░▒▒▓▓██░░▓▓░░░░▒▒████░░██▓▓▒▒▒▒▓▓░░░░  |
|                                                                    |
|  Filters                                                           |
|  Repos: [All ▼]  Types: [All ▼]  Branch: [All ▼]  [Today ▼]     |
|  Search: [________________________________________]                |
|                                                                    |
|  Activity Timeline              | Detail                           |
|  ───────────────────────────── | ─────────────────────────────── |
|                                 |                                  |
|  15:41  mercury-api             |  mercury-api / main              |
|   (git-commit) Push  3 commits  |                                  |
|   feat: add rate limiter to..   |  feat: add rate limiter          |
|                                 |  to /api/v2/orders endpoint      |
|  15:38  mercury-ingestion       |                                  |
|   (git-merge) PR #47 merged     |  +142  -23  5 files changed     |
|   fix: batch processor OOM      |                                  |
|                                 |  Commits:                        |
|  15:12  mercury-api             |   a3f2c1d  rate limiter config   |
|   (git-pull-request) PR #128    |   b8e4a22  middleware hookup     |
|   refactor: auth middleware      |   c1d5f33  tests for rate limit |
|                                 |                                  |
|  14:55  mercury-worker          |  [View on GitHub ->]             |
|   (code-review) Review on #89   |                                  |
|                                 |                                  |
|  14:41  agent-forge             |                                  |
|   (git-commit) Push  1 commit   |                                  |
|   wip: github panel layout      |                                  |
|                                 |                                  |
|  [Load more]                    |                                  |
|                                 |                                  |
|  ────────────────────────────────────────────────────────────────  |
|  Today: 12 pushes  4 PRs merged  2 PRs opened  1 review           |
|  Active repos: mercury-api (7)  mercury-ingestion (4)  +3 more    |
+-------------------------------------------------------------------+
```

### 6.4 Interaction

| Action | Behavior |
|--------|----------|
| Click event row | Load detail in right panel (commits, stats, description) |
| Click repo name | Filter timeline to that repo |
| Click commit SHA | Open on GitHub in new tab |
| Scroll timeline | Infinite scroll, loads older events from SQLite |
| Hover heatmap cell | Tooltip: date + contribution count |
| Click heatmap cell | Filter timeline to that date |
| Keyboard `/` | Focus search input |
| Keyboard `j/k` | Navigate timeline rows |

### 6.5 Dependencies (Dashboard-specific additions)

| Package | Purpose |
|---------|---------|
| `@primer/octicons-react` | GitHub's official icon library |
| `@tanstack/react-virtual` | Virtualized list for 1000+ events |

These are added to the existing dashboard deps from `dashboard-design.md` Section 2.3 (react, vite, tailwindcss, zustand, xterm.js, lucide-react).

---

## 7. Integration with Mercury Alert System

The Mercury stack already has a production alert system:

- **`EconomicReleaseMonitor`** (mercury-api) polls BLS API, publishes notifications to Redis channels (`economic-releases`, `economic-alerts`)
- **`AlertType`/`AlertStatus` enums** define price alerts (price_above, price_below, change_percent, volume)
- **Redis pub/sub** distributes alerts to subscribers
- **Telegram** receives squawks and economic release notifications via the existing ingestion pipeline

### 7.1 Alert-to-Dashboard Bridge (v1.5.0+)

When Agent Forge's event-driven triggers (PRD v1.5.0) are implemented, the flow is:

```
Mercury AlertManager (Redis pub/sub)
     |
     v
agent-forge webhook receiver (/api/alerts/ingest)
     |
     v
incidents table (state.db)
     |
     +---> Correlate with github_events by repo + timestamp
     |     "This alert fired 3 min after commit a3f2c1d on mercury-api"
     |
     +---> Dashboard: alert appears in GitHub timeline as annotation
     |     (vertical marker on the contribution heatmap, inline badge on event row)
     |
     +---> [If specialist assigned] Wake specialist agent
     |     Specialist applies hotfix OR reports to dashboard for review
     |
     +---> Telegram notification (existing channel, preserved)
           "Alert: mercury-api error rate 5%. Correlated with push a3f2c1d 3min ago."
```

### 7.2 Telegram as Existing Notification Channel

Agent Forge does not replace Telegram notifications. The Mercury stack's Telegram integration (via `telethon_wrappers` and the ingestion pipeline) remains the real-time alerting channel. The dashboard adds **visual correlation and context** that Telegram cannot provide: seeing the alert alongside the commit timeline, clicking through to the PR, reviewing the specialist's proposed fix.

The notification hierarchy:
1. **Telegram** -- immediate push (already working, keep it)
2. **Dashboard** -- visual context + correlation + agent interaction
3. **TUI status bar** -- tmux indicator for terminal operators

---

## 8. Integration with Service Skills System

The service skills system (`jaggers-agent-tools/project-skills/service-skills-set`) provides a proven pattern for territory-based auto-activation of expert knowledge. Agent Forge specialists inherit this pattern directly.

### 8.1 Specialist-Inherits-Skill Pattern

A service monitoring specialist (e.g. `mercury-api-monitor.specialist.yaml`) inherits its domain knowledge from an existing service SKILL.md:

```yaml
# .agent-forge/specialists/mercury-api-monitor.specialist.yaml
specialist:
  metadata:
    name: mercury-api-monitor
    version: 1.0.0
    description: "Monitors mercury-api service health, correlates errors with recent deploys"
    category: monitoring/service

  execution:
    preferred_profile: gemini
    model: gemini-2.0-flash
    mode: auto

  prompt:
    system: |
      You are the Mercury API Monitor specialist. You monitor the mercury-api
      service for errors, performance degradation, and anomalies.
      When woken by an alert, you:
      1. Check recent GitHub activity for correlated deploys
      2. Run diagnostic scripts from your service skill
      3. If hotfix is obvious: propose a PR
      4. If not: report to dashboard with diagnosis
    # Service skill reference -- loaded at spawn time alongside system prompt
    skill_inherit: .claude/skills/mercury-api/SKILL.md

  capabilities:
    diagnostic_scripts:
      - .claude/skills/mercury-api/scripts/health_probe.py
      - .claude/skills/mercury-api/scripts/log_hunter.py
      - .claude/skills/mercury-api/scripts/data_explorer.py
    file_scope:
      - mercury-api/src/
      - .agent-forge/sessions/
    blocked_tools:
      - Write    # read-only monitor, proposes changes via PR
    can_spawn: false

  validation:
    files_to_watch:
      - mercury-api/src/
      - mercury-api/docker-compose.yml
    stale_threshold_days: 14
```

### 8.2 skill_inherit Field

New field in the specialist YAML schema. When present, `specialist-loader.ts` reads the referenced SKILL.md and appends its content to `agents.md` at spawn time, after the specialist's own `prompt.system`. This gives the specialist:

- The service's architecture knowledge
- Failure modes table
- Log patterns
- Diagnostic script paths and usage
- Data layer understanding

The SKILL.md is not duplicated into the specialist YAML -- it is referenced. The staleness detection of both the specialist and the skill are independent: the specialist tracks `files_to_watch` for the service code, while the skill's own drift detection (via the PostToolUse hook from service-skills-set) tracks implementation changes.

### 8.3 diagnostic_scripts Field

New field under `capabilities`. Lists paths to executable scripts that the specialist can invoke via Bash tool. These are the same `health_probe.py`, `log_hunter.py`, `data_explorer.py` scripts generated by the service skill builder's `creating-service-skills` scaffolder.

At spawn time, `specialist-loader.ts` includes instructions in `agents.md` telling the agent which scripts are available and how to use them (with `--json` flag for structured output).

### 8.4 Memory Deduplication for Monitoring Specialists

A monitoring specialist that wakes periodically (v1.4.0 heartbeat) needs memory of what it has already reported, to avoid duplicate suggestions. This is solved by the existing `specialist_events` table (PRD Section 11):

```sql
-- Before suggesting a fix, the specialist queries:
SELECT payload FROM specialist_events
WHERE specialist_name = 'mercury-api-monitor'
  AND hook = 'post_execute'
  AND status = 'COMPLETE'
  AND timestamp > datetime('now', '-7 days')
ORDER BY timestamp DESC;

-- If the same issue was already reported, skip.
-- If a PR was already opened for this pattern, skip.
```

The specialist also checks the `incidents` table (PRD v1.5.0) for open incidents on the same repo before creating duplicates.

---

## 9. Future: Service Health Panel

The GitHub dashboard establishes the data layer and UI patterns that the Service Health panel will reuse. The integration path:

```
v0.7.0 (this document):
  GitHub activity in state.db
  Dashboard tab with timeline + heatmap

v0.8.0 (GitHub CI + Service Health prep):
  GitHub Actions workflow runs (status, duration, failures)
  Prometheus query proxy: /api/services/metrics?query=...
  Service health table in state.db

v1.4.0 (Proactive Specialists):
  Monitoring specialists wake on schedule
  Query github_events + prometheus metrics
  Correlate: "error rate spike on mercury-api started 2min after push a3f2c1d"
  Report to dashboard OR propose hotfix PR

v1.5.0 (Autonomous Operations):
  Webhook receiver: Prometheus AlertManager -> agent-forge
  incidents table links to github_events
  Full closed loop: alert -> specialist -> diagnosis -> PR -> review -> merge
```

### Grafana/Loki Integration Path

Agent Forge does not replace Grafana. Grafana remains the metrics visualization layer. Integration is through **data correlation**, not duplication:

| Data source | Owner | Agent Forge role |
|-------------|-------|------------------|
| Prometheus metrics | Grafana dashboards | Query via PromQL proxy for specialist context |
| Loki logs | Grafana Explore | Specialist runs `log_hunter.py` which calls Loki API |
| Alertmanager alerts | Telegram + Grafana | Webhook to agent-forge, creates incident, wakes specialist |
| GitHub events | Agent Forge state.db | Source of truth for code change correlation |

The specialist does not need Grafana -- it needs the same data Grafana uses. It queries Prometheus directly (read-only) and Loki directly (via log scripts). The dashboard provides the **human view** that correlates these data sources visually.

---

## 10. Configuration

Added to `~/.agent-forge/config.yaml`:

```yaml
github:
  token: ${GITHUB_TOKEN}           # or gh auth token fallback
  poll_interval_seconds: 300       # 5 minutes default
  repos:                           # explicitly tracked repos
    - owner/mercury-api
    - owner/mercury-ingestion
    - owner/mercury-worker
    # ... all 52 services
  auto_discover: true              # also track repos from recent user events
  groups:                          # repo grouping for dashboard filters
    mercury:
      - owner/mercury-*
    infra:
      - owner/infra-*
    tools:
      - owner/agent-forge
      - owner/jaggers-agent-tools
  backfill_pages: 3                # pages to fetch on first poll (max 100 events/page)
```

---

## 11. Roadmap Integration

This document defines work for **v0.7.0** in the PRD roadmap, positioned after v0.6.0 (Resilience) and before v1.0.0 (Production Release):

```
v0.7.0 -- Omni-Dashboard: GitHub Activity
  github-store.ts: SQLite schema for events, commits, repos
  github-poller.ts: periodic ingestion via GitHub REST + GraphQL API
  API routes: /api/github/* (events, commits, repos, contributions, summary)
  WebSocket channel: github:activity (real-time new events)
  Dashboard: GithubPanel tab with ActivityFeed, ContributionMap, filters
  Configuration: github.* section in config.yaml
  Specialist schema: skill_inherit + diagnostic_scripts fields
```

---

## 12. Open Questions

| Question | Options | Recommendation |
|----------|---------|----------------|
| Contribution heatmap: GitHub GraphQL vs local computation? | GraphQL is accurate but rate-limited; local computation from stored events is fast but misses non-event contributions | GraphQL daily, local as fallback |
| Repo auto-discovery: track all user repos or explicit list only? | Auto-discover adds noise from personal/fork repos | Explicit list + auto-discover with `tracked: false` default for unknown repos |
| SQLite FTS5 for commit message search? | FTS5 adds complexity but enables fast full-text search across 10k+ commits | Yes, add FTS5 virtual table indexed on `github_events.title + body` |
