---
title: "Dashboard UI (src/dashboard/)"
domain: agent-forge
subcategory: architecture
version: 1.0.0
created: 2026-03-06
updated: 2026-03-06
tracks:
  - "src/dashboard/**/*.tsx"
  - "src/dashboard/**/*.ts"
  - "src/dashboard/**/*.css"
  - "tests/dashboard/**/*.ts"
  - "tests/dashboard/**/*.tsx"
  - "vite.config.ts"
---

<!-- INDEX -->
## Sections
- [Overview](#overview)
- [Stack](#stack)
- [Project Structure](#project-structure)
- [Components](#components)
- [State Management](#state-management)
- [API Client and WebSocket](#api-client-and-websocket)
- [Dev Server Configuration](#dev-server-configuration)
<!-- /INDEX -->

## Overview

React single-page dashboard with tab-based layout. Currently one tab: GitHub Activity. Dark theme (slate-900 background). Vite dev server with HMR proxies API calls to the backend.

## Stack

- React 19 + TypeScript (strict)
- Vite 7 (dev server + build)
- Tailwind CSS v4 (`@import "tailwindcss"` syntax, requires `@tailwindcss/vite` plugin)
- Zustand for state management
- `@primer/octicons-react` for icons (no emoji)
- `@tanstack/react-virtual` for virtualized lists
- `happy-dom` + `@testing-library/react` for tests

## Project Structure

```
src/dashboard/
  index.html          # Vite entry
  main.tsx             # React root mount
  App.tsx              # Tab shell (dark theme header)
  styles/globals.css   # Tailwind import + base styles
  lib/                 # ⚠️ NOT api/ — renamed to avoid Vite proxy collision
    client.ts          # Typed HTTP wrapper (ApiClient class)
    ws.ts              # WebSocket client with auto-reconnect
  stores/
    github.ts          # Zustand store for GitHub state
  hooks/
    useWebSocket.ts    # Shared WsClient singleton
    useGithubActivity.ts # Fetches all GitHub data on mount
  components/github/
    GithubPanel.tsx     # Container orchestrating sub-components
    ActivityTimeline.tsx # Virtual-scrolled event list
    CommitList.tsx       # Commit messages for selected event
    ContributionHeatmap.tsx # Daily activity grid
    EventIcon.tsx        # Octicons per event type
    RepoFilter.tsx       # Repo/group filter toggles
    StatsHeader.tsx      # Today/week/month counters
```

## Components

- **GithubPanel** — Top-level container. Calls `useGithubActivity()` hook on mount, renders StatsHeader → ContributionHeatmap → RepoFilter → ActivityTimeline + CommitList side-by-side.
- **ActivityTimeline** — Virtualized vertical event list using `@tanstack/react-virtual`. Each row shows EventIcon + event details.
- **EventIcon** — Maps event types to Octicons (GitCommitIcon, GitPullRequestIcon, GitMergeIcon, IssueOpenedIcon, etc.) with subtle per-type colors.
- **CommitList** — Shows commits for the selected event.
- **ContributionHeatmap** — GitHub-style daily activity grid.
- **RepoFilter** — Filter events by repository/group.
- **StatsHeader** — Summary counters (events, pushes, PRs, commits, repos).

## State Management

Zustand store (`stores/github.ts`):
- State: events, selectedEvent, selectedEventCommits, repos, contributions, summary, filter, loading, error
- Actions: setEvents, appendEvents, prependEvent, selectEvent, setFilter, resetFilter, etc.
- No Redux, no context API — pure Zustand.

## API Client and WebSocket

- `lib/client.ts` — `ApiClient` class wrapping fetch. Singleton `apiClient` exported. Methods for all 9 GitHub endpoints.
- `lib/ws.ts` — `WsClient` class with auto-reconnect (exponential backoff). `buildWsUrl()` derives WS URL from current origin. Shared singleton in `useWebSocket` hook.

## Dev Server Configuration

`vite.config.ts`:
- Root: `src/dashboard`
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`
- Proxy: `/api` → `http://localhost:3000`, `/ws` → `ws://localhost:3000`
- `server.fs.allow: ['.']` — allows imports from `src/types/` outside dashboard root
- Build output: `dist/dashboard/`

⚠️ **Known constraint**: The `lib/` directory was renamed from `api/` because Vite's `/api` proxy intercepted requests for source files in the `api/` directory during dev mode.
