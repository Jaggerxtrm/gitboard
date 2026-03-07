---
title: "API Bridge (src/api/)"
domain: agent-forge
subcategory: architecture
version: 1.0.0
created: 2026-03-06
updated: 2026-03-06
tracks:
  - "src/api/**/*.ts"
  - "tests/api/**/*.ts"
---

<!-- INDEX -->
## Sections
- [Overview](#overview)
- [Server](#server)
- [GitHub REST Endpoints](#github-rest-endpoints)
- [WebSocket System](#websocket-system)
<!-- /INDEX -->

## Overview

Hono HTTP + WebSocket server (`src/api/server.ts`). Factory pattern: `createApp(db)` returns `{ app, registry, wsHandler }`. Separate `startServer(db, options)` wires up Bun.serve.

## Server

`src/api/server.ts`:
- Hono framework (Bun-native, zero external deps beyond hono)
- CORS enabled via `hono/cors`
- Routes mounted at `/api/github` via `createGithubRouter(db, registry)`
- Health check at `GET /health`
- Port configurable via `PORT` env var (default 3000)

## GitHub REST Endpoints

`src/api/routes/github.ts` — 9 endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/github/events` | Paginated, filterable (repo/type/date/search/group) |
| GET | `/api/github/events/:id` | Single event detail |
| GET | `/api/github/commits` | Paginated, filterable |
| GET | `/api/github/commits/:sha` | Single commit |
| GET | `/api/github/repos` | All tracked repos with groups |
| POST | `/api/github/repos` | Add a repo |
| PUT | `/api/github/repos/:name` | Update tracking/group/color |
| DELETE | `/api/github/repos/:name` | Untrack a repo |
| GET | `/api/github/contributions` | Daily contribution counts (configurable weeks) |
| GET | `/api/github/summary` | Stats for period (today/week/month) |

## WebSocket System

- `src/api/ws/channels.ts` — `ChannelRegistry` pub/sub with typed channels
- `src/api/ws/handler.ts` — `WsHandler` connection lifecycle, subscribe/unsubscribe
- Client messages use `{ action: 'subscribe', channel: '...' }` format
- Channel: `github:activity` pushes `new_event`/`new_commits` on poller ingestion
