# OmniForge — Repository Architecture

> How to split `agent-forge` into a public/private multi-repo system
> under the `omniforge` GitHub organization.

---

## Target structure

```
omniforge/forge-core    → public   shared types, API client, WebSocket client
omniforge/gitboard      → public   GitHub Activity dashboard (standalone + embeddable)
omniforge/forge         → private  full product: all tabs, agent orchestration, Mercury
```

Dependency graph (no cycles):

```
forge-core   ←── gitboard
forge-core   ←── forge
gitboard     ←── forge
forge        ←── nothing (leaf — the product)
```

---

## Step 1 — Create the GitHub org

1. github.com → `+` → **New organization** → name: `omniforge`
2. Add `Jaggerxtrm` as owner
3. Create three repos: `forge-core` (public), `gitboard` (public), `forge` (private)

---

## Step 2 — `@omniforge/core` (forge-core)

**What goes here:** everything that both the public dashboard and the private
product need to agree on — no business logic, no UI.

### Contents

```
packages/core/
  src/
    types/
      github.ts         ← GithubEvent, GithubCommit, GithubRepo, Summary, …
    client/
      client.ts         ← ApiClient class + singleton apiClient
      ws.ts             ← WsClient with exponential-backoff reconnect
    index.ts            ← re-exports everything
  package.json
  tsconfig.json
```

### package.json

```json
{
  "name": "@omniforge/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

### Migration from agent-forge

| Source | Destination |
|--------|-------------|
| `src/types/github.ts` | `src/types/github.ts` |
| `src/dashboard/lib/client.ts` | `src/client/client.ts` |
| `src/dashboard/lib/ws.ts` | `src/client/ws.ts` |

Update imports in `gitboard` and `forge`:
```ts
// before
import type { GithubEvent } from "../../../types/github.ts";
import { apiClient } from "../../lib/client.ts";

// after
import type { GithubEvent } from "@omniforge/core";
import { apiClient } from "@omniforge/core";
```

---

## Step 3 — `@omniforge/gitboard` (gitboard)

**What goes here:** the React dashboard — fully functional as a standalone app
AND exportable as a component for `forge` to embed as a tab.

### Contents

```
packages/gitboard/
  src/
    components/         ← all React components (github/, layout/, etc.)
    stores/             ← Zustand stores
    hooks/              ← useGithubActivity, useWebSocket
    styles/             ← globals.css, design tokens
    App.tsx             ← standalone app shell (single-tab)
    main.tsx            ← Vite entry point
    index.ts            ← component export for forge
  index.html
  vite.config.ts
  package.json
  tsconfig.json
```

### package.json

```json
{
  "name": "@omniforge/gitboard",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./styles": "./src/styles/globals.css"
  },
  "dependencies": {
    "@omniforge/core": "workspace:*",
    "@primer/octicons-react": "^19",
    "@radix-ui/react-accordion": "^1",
    "@radix-ui/react-collapsible": "^1",
    "@tanstack/react-virtual": "^3",
    "react": "^19",
    "zustand": "^5"
  }
}
```

### Component export (`src/index.ts`)

```ts
// What forge imports to embed gitboard as a tab
export { GithubPanel } from "./components/github/GithubPanel";
export type { GithubPanelProps } from "./components/github/GithubPanel";
```

### Standalone app (`src/App.tsx`)

The public app runs gitboard as a single-tab dashboard — no changes to
current behaviour, just the tab label becomes "GitHub Activity".

### Rule

`gitboard` must never import from `forge`. It only imports from
`@omniforge/core` and its own files.

---

## Step 4 — `forge` (private)

**What goes here:** the full product — multi-tab shell, agent orchestration,
Mercury integration, DB, poller, API server, private panels.

### Tab system

```tsx
// src/dashboard/App.tsx
import { GithubPanel } from "@omniforge/gitboard";
import "@omniforge/gitboard/styles";

import { SpecialistPanel } from "./panels/SpecialistPanel";
import { AgentPanel } from "./panels/AgentPanel";
import { FleetPanel } from "./panels/FleetPanel";

const TABS = [
  { id: "github",      label: "GitHub",      Panel: GithubPanel },
  { id: "specialists", label: "Specialists", Panel: SpecialistPanel },
  { id: "agents",      label: "Agents",      Panel: AgentPanel },
  { id: "fleet",       label: "Fleet",       Panel: FleetPanel },
];
```

### package.json (dashboard deps only)

```json
{
  "name": "forge",
  "dependencies": {
    "@omniforge/core":     "workspace:*",
    "@omniforge/gitboard": "workspace:*"
  }
}
```

### Private panels (future)

| Panel | Description |
|-------|-------------|
| `SpecialistPanel` | unitAI specialist registry and status |
| `AgentPanel` | active agent sessions, logs, controls |
| `FleetPanel` | Mercury stack services health |
| `AlertPanel` | Prometheus → AlertManager feed |

---

## Local development setup

Use a **Bun workspace** so all packages share `node_modules` and link to
each other without publishing.

### Directory layout

```
omniforge/                  ← private root (git repo = forge)
  package.json              ← workspace root
  packages/
    core/                   ← git subtree or submodule → omniforge/forge-core
    gitboard/               ← git subtree or submodule → omniforge/gitboard
    forge/                  ← the private app (src/ lives here)
```

### Workspace root `package.json`

```json
{
  "name": "omniforge-workspace",
  "private": true,
  "workspaces": [
    "packages/core",
    "packages/gitboard",
    "packages/forge"
  ]
}
```

### One-time setup

```bash
bun install          # links all workspace packages
bun run dev          # from packages/forge — API + poller
bun run dev:dashboard # from packages/gitboard — Vite HMR
```

### Keeping public repos in sync

Two options:

**Option A — git subtree** (simpler, no submodule UX friction)
```bash
# Add remotes once
git remote add core    git@github.com:omniforge/forge-core.git
git remote add gitboard git@github.com:omniforge/gitboard.git

# Push core changes upstream
git subtree push --prefix=packages/core core main

# Push gitboard changes upstream
git subtree push --prefix=packages/gitboard gitboard main

# Pull upstream changes back
git subtree pull --prefix=packages/core core main --squash
```

**Option B — git submodules** (cleaner separation, more friction)
```bash
git submodule add git@github.com:omniforge/forge-core.git packages/core
git submodule add git@github.com:omniforge/gitboard.git   packages/gitboard
```

Recommendation: **subtree** for a solo or small team. Submodules for larger
teams where public repos have independent contributors.

---

## Publishing to npm (when ready)

```bash
# from workspace root
cd packages/core    && bun publish --access public
cd packages/gitboard && bun publish --access public
# forge is never published — it's a deployed application
```

Version together using a script or changesets:
```bash
bunx changeset       # describe changes
bunx changeset version # bump versions
bunx changeset publish # publish both
```

---

## Migration order

```
Phase 1 — Extract core
  [ ] Create omniforge/forge-core repo
  [ ] Move types + client + ws to core
  [ ] Update imports in agent-forge → @omniforge/core
  [ ] Verify tests pass

Phase 2 — Extract gitboard
  [ ] Create omniforge/gitboard repo
  [ ] Move src/dashboard → gitboard/src
  [ ] Add index.ts component export
  [ ] Verify standalone app runs
  [ ] Verify tests pass

Phase 3 — Wire forge
  [ ] Set up workspace root
  [ ] Replace dashboard src with @omniforge/gitboard import
  [ ] Add private panels scaffold
  [ ] Verify full app runs

Phase 4 — Publish
  [ ] bun publish @omniforge/core
  [ ] bun publish @omniforge/gitboard
  [ ] Tag v1.0.0 on both public repos
```

---

*Last updated: 2026-03-08*
