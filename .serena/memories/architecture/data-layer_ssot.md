---
title: "Data Layer (src/core/)"
domain: agent-forge
subcategory: architecture
version: 1.0.0
created: 2026-03-06
updated: 2026-03-06
tracks:
  - "src/core/*.ts"
  - "tests/core/*.ts"
---

<!-- INDEX -->
## Sections
- [Overview](#overview)
- [Database Schema](#database-schema)
- [GitHub Store](#github-store)
- [GitHub Poller](#github-poller)
- [GitHub Auto-Discovery](#github-auto-discovery)
<!-- /INDEX -->

## Overview

SQLite data layer using `bun:sqlite` with WAL mode. Single file database at `~/.agent-forge/state.db` (configurable via `AGENT_FORGE_DB` env var).

Entry point: `src/core/store.ts` exports `createDatabase(path)` → returns `Database` instance with all tables created.

## Database Schema

6 tables defined in `store.ts`:

| Table | Purpose |
|-------|---------|
| `sessions` | Agent session lifecycle |
| `messages` | Inter-agent message bus |
| `specialist_events` | Specialist lifecycle tracking |
| `github_events` | GitHub activity events |
| `github_commits` | Commit details (FK to events) |
| `github_repos` | Tracked repositories with groups |

Indexes on: `github_events(repo, created_at)`, `github_commits(repo)`, `github_repos(group_name)`.

## GitHub Store

`src/core/github-store.ts` — Typed CRUD functions over the 3 GitHub tables:

- `insertEvent`, `getEvents`, `getEvent` — event lifecycle with filtering (repo, type, date range, search, group)
- `insertCommit`, `getCommits`, `getCommit` — commit operations
- `upsertRepo`, `updateRepo`, `getRepos` — repo tracking management
- `getContributions(db, weeks)` — daily contribution aggregation
- `getSummary(db, period)` — stats (events, pushes, PRs, commits, repos) for today/week/month

## GitHub Poller

`src/core/github-poller.ts` — Polls GitHub REST API:

- `GithubPoller` class with `start(repos)`, `stop()`, `backfill(repo)` methods
- Auth: `getGithubToken()` — tries `gh auth token` first, falls back to `GITHUB_TOKEN` env var
- Transforms GitHub API events into `github_events`/`github_commits` rows
- Deduplicates by event ID
- Configurable interval (default 5 min)

## GitHub Auto-Discovery

`src/core/github-discover.ts` — Auto-discovers repos on first startup:

- Primary: `gh repo list --json nameWithOwner,isPrivate,pushedAt --limit 100`
- Fallback: GitHub REST API (`GET /user/repos`) with token
- Filters by recency and privacy settings
- Inserts discovered repos as tracked into `github_repos`
