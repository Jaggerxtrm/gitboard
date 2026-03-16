# Omniforge

A unified dashboard for AI agent orchestration and issue tracking.

## Monorepo Structure

```
omniforge/
├── apps/
│   └── gitboard/          # GitHub Activity Dashboard
├── packages/
│   ├── core/              # @omniforge/core - Shared utilities and types
│   ├── ui/                # @omniforge/ui - Design system components
│   └── api-client/        # @omniforge/api-client - REST + WebSocket client
└── pnpm-workspace.yaml
```

## Getting Started

```bash
# Install dependencies
bun install

# Run gitboard dashboard
bun run dev

# Run tests
bun run test

# Build all packages
bun run build
```

## Apps

### Gitboard

GitHub Activity Dashboard showing events, commits, and contribution data.

```bash
bun run --filter @omniforge/gitboard dev
```

## Packages

### @omniforge/core

Shared utilities, types, and constants.

```typescript
import { relativeTime, formatNumber, cn } from "@omniforge/core";
import type { BeadIssue, Status, Priority } from "@omniforge/core";
```

### @omniforge/ui

Design system components following the Omniforge visual language.

```typescript
import { Card, Badge, Button, Sidebar } from "@omniforge/ui";
```

### @omniforge/api-client

REST and WebSocket client for Omniforge services.

```typescript
import { ApiClient, WsClient } from "@omniforge/api-client";
```

## License

MIT
