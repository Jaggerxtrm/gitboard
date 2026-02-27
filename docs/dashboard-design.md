# Agent Dashboard — Design Document

**Date**: 2026-02-27
**Status**: Proposal
**Parent**: [PRD.md](./PRD.md) — Section 7 (TUI Dashboard)
**Inspiration**: [OpenClaw Mission Control](https://github.com/abhi1693/openclaw-mission-control), [Claude Code UI](https://github.com/siteboon/claudecodeui)

---

## 1. Premise: Dashboard ≠ TUI

The PRD defines a TUI (Ink/React for terminals) as the primary visual interface. The Dashboard is a **complementary web interface** — not a replacement. Both consume the same core (Layers 1–3), but serve different use cases.

| Aspect | TUI (`agent-forge tui`) | Dashboard (`agent-forge dashboard`) |
|--------|------------------------|--------------------------------------|
| **Runtime** | Terminal (Ink) | Browser (React + Vite) |
| **Access** | Local terminal only | Any device (browser, mobile, tablet) |
| **Interaction** | Keyboard-driven | Mouse + keyboard + touch |
| **Use case** | Operator in-terminal, fast actions | Monitoring, approval, output review |
| **Real-time** | Poll-based (2–5s) | WebSocket push (sub-second) |
| **Rich content** | ANSI text | Markdown render, syntax highlighting, charts |
| **Control** | Full (spawn, kill, send, protocol) | Full (same capabilities via API) |

### Design Principle

**One core, two views.** The Dashboard introduces a thin API layer between Layer 3 (Orchestration) and Layer 4 (UI). Both TUI and Dashboard become API consumers. The API layer is optional — CLI and TUI can still use core modules directly for zero-latency local operation.

```
+─────────────────────────────────────────────────────────+
│                     LAYER 4: UI                          │
│                                                          │
│  ┌──────────────┐   ┌────────────────┐   ┌──────────┐   │
│  │  CLI (cmdr)  │   │  TUI (Ink)     │   │ Dashboard │   │
│  │  Headless    │   │  Terminal      │   │ Web (React│   │
│  │  Direct call │   │  Direct call   │   │ + Vite)   │   │
│  └──────┬───────┘   └──────┬─────────┘   └─────┬─────┘   │
│         │                  │                    │         │
│         ▼                  ▼                    ▼         │
│  ┌──────────────────────────────────────────────────┐    │
│  │           API Bridge (HTTP + WebSocket)           │    │
│  │           (optional — Dashboard requires it,      │    │
│  │            CLI/TUI can bypass for local use)      │    │
│  └──────────────────────┬───────────────────────────┘    │
│                         │                                 │
+─────────────────────────┼─────────────────────────────────+
                          ▼
              LAYER 3: Orchestration (unchanged)
              LAYER 2: Execution (unchanged)
              LAYER 1: Identity & Knowledge (unchanged)
```

---

## 2. Architecture

### 2.1 API Bridge

A lightweight server embedded in the `agent-forge` process. Started with `agent-forge dashboard` or `agent-forge serve`.

```
src/api/
├── server.ts              # Hono HTTP server + WebSocket upgrade
├── routes/
│   ├── sessions.ts        # CRUD sessions, spawn, kill, send
│   ├── messages.ts        # Message bus queries
│   ├── protocols.ts       # Protocol execution + status
│   ├── agents.ts          # Agent output streaming, status
│   ├── registry.ts        # Profiles, specialists, protocols listing
│   └── system.ts          # Health, config, version
├── ws/
│   ├── handler.ts         # WebSocket connection manager
│   └── channels.ts        # Event channels (sessions, output, messages)
└── middleware/
    ├── auth.ts            # Bearer token (local mode) or JWT
    └── cors.ts            # CORS for browser access
```

**Technology**: [Hono](https://hono.dev) — ultrafast, runs on Bun natively, zero-dependency HTTP framework. Chosen over Express for Bun alignment and performance.

**WebSocket Channels** (real-time push):

| Channel | Events | Consumer |
|---------|--------|----------|
| `session:{id}` | status_change, activity_update, stalled, zombie | Fleet panel, agent cards |
| `output:{id}` | new_lines (streaming pane capture) | Agent output viewer |
| `messages` | new_message (from any session) | Message feed |
| `protocol:{id}` | turn_start, turn_complete, turn_error | Protocol monitor |
| `system` | reconciliation_tick, health_check | Status bar |

### 2.2 Dashboard Frontend

Single-page application served by the API bridge. Built with React + Vite + Tailwind CSS.

```
src/dashboard/
├── index.html
├── main.tsx                    # React entry
├── App.tsx                     # Layout + routing
├── api/
│   ├── client.ts              # HTTP client (fetch wrapper)
│   └── ws.ts                  # WebSocket client + reconnect
├── stores/
│   ├── sessions.ts            # Zustand store — session state
│   ├── messages.ts            # Message feed state
│   └── protocol.ts            # Active protocol state
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx        # Navigation + fleet mini-view
│   │   ├── TopBar.tsx         # System status + controls
│   │   └── MobileNav.tsx      # Bottom tab bar (mobile)
│   ├── fleet/
│   │   ├── FleetGrid.tsx      # Agent cards grid (main view)
│   │   ├── AgentCard.tsx      # Single agent: status, role, task, duration
│   │   └── SpawnDialog.tsx    # Spawn new agent (profile + specialist picker)
│   ├── agent/
│   │   ├── AgentView.tsx      # Full agent detail page
│   │   ├── OutputTerminal.tsx # Live terminal output (xterm.js)
│   │   ├── SendPrompt.tsx     # Input box to send message to agent
│   │   └── AgentControls.tsx  # Kill, pause, nudge, view log
│   ├── boss/
│   │   ├── BossPanel.tsx      # Orchestrator/boss dedicated view
│   │   ├── BossChat.tsx       # Chat-style interface to boss agent
│   │   └── DelegationLog.tsx  # What boss delegated to whom
│   ├── protocol/
│   │   ├── ProtocolView.tsx   # Active protocol progress
│   │   ├── TurnTimeline.tsx   # Visual turn-by-turn progress
│   │   └── ProtocolRunner.tsx # Start new protocol (wizard)
│   ├── messages/
│   │   ├── MessageFeed.tsx    # Real-time message stream
│   │   └── MessageDetail.tsx  # Single message with payload
│   ├── registry/
│   │   ├── RegistryBrowser.tsx  # Profiles, protocols, specialists
│   │   ├── SpecialistCard.tsx   # Specialist detail + health status
│   │   └── ProfileCard.tsx      # Profile detail + test button
│   └── common/
│       ├── StatusBadge.tsx    # Agent status indicator
│       ├── Terminal.tsx       # xterm.js wrapper
│       └── ConfirmDialog.tsx  # Destructive action confirmation
├── hooks/
│   ├── useWebSocket.ts       # WS connection + auto-reconnect
│   ├── useAgentOutput.ts     # Subscribe to agent output stream
│   └── useSessions.ts        # Session list with real-time updates
└── styles/
    └── globals.css            # Tailwind base + custom tokens
```

### 2.3 Key Dependencies (Dashboard-specific)

| Package | Purpose |
|---------|---------|
| `hono` | HTTP + WebSocket server (Bun-native) |
| `react` + `react-dom` | Dashboard UI framework |
| `vite` | Build tool + dev server |
| `tailwindcss` | Utility-first CSS |
| `@xterm/xterm` | Terminal emulator in browser (agent output) |
| `zustand` | Lightweight state management |
| `lucide-react` | Icon library |

---

## 3. Dashboard Views

### 3.1 Fleet Overview (Home)

The default landing page. Grid of agent cards showing real-time status.

```
┌─────────────────────────────────────────────────────────────────┐
│  Agent Forge Dashboard                          ● System OK     │
├──────────┬──────────────────────────────────────────────────────┤
│          │                                                      │
│  Fleet   │  ┌─ Claude (boss) ──────┐ ┌─ Gemini ─────────────┐  │
│  --------│  │ ● WORKING  4m 23s    │ │ ○ IDLE  2m 10s       │  │
│  ● claude│  │ Task: orchestrating  │ │ Task: review auth     │  │
│  ○ gemini│  │ protocol collab...   │ │ Specialist: code-rev  │  │
│  ◌ qwen  │  │ Messages: 12 sent   │ │ Messages: 3 received  │  │
│  · glm   │  │ [View] [Send] [Log] │ │ [View] [Send] [Kill]  │  │
│          │  └──────────────────────┘ └───────────────────────┘  │
│  Proto   │                                                      │
│  --------│  ┌─ Qwen ──────────────┐ ┌─ + Spawn Agent ───────┐  │
│  ▶ collab│  │ ◌ READY  0m 45s     │ │                       │  │
│          │  │ Task: validate fix   │ │    [+] New Worker     │  │
│  Msgs    │  │ Specialist: —        │ │                       │  │
│  --------│  │ [View] [Send] [Kill] │ │  Profile: [▼ gemini]  │  │
│  12 total│  │                      │ │  Specialist: [▼ none] │  │
│  3 unread│  └──────────────────────┘ └───────────────────────┘  │
│          │                                                      │
├──────────┴──────────────────────────────────────────────────────┤
│  Protocol: collaborative ▶ Turn 2/3 (critique) │ Elapsed: 4:23 │
└─────────────────────────────────────────────────────────────────┘
```

**Agent Card States** (visual indicators):

| Status | Icon | Color | Description |
|--------|------|-------|-------------|
| `working` | ● | Blue (pulsing) | Agent is processing |
| `idle` | ○ | Green | Agent is idle/ready |
| `ready` | ◌ | Gray-green | Agent is ready for input |
| `stalled` | ⚠ | Yellow | No progress detected |
| `error` | ✕ | Red | Agent in error state |
| `zombie` | ☠ | Red (dim) | tmux session lost |
| `waiting_for_input` | ? | Orange | Agent waiting for user action |
| `completed` | ✓ | Gray | Agent finished |

### 3.2 Agent Detail View

Click an agent card to enter the full agent view. This is the **core interaction point** — inspired by Claude Code UI's chat interface.

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Fleet    Gemini (worker) ● WORKING         [Kill] [Nudge]   │
├──────────────────────────────────┬──────────────────────────────┤
│                                  │                              │
│  Live Output                     │  Agent Info                  │
│  ─────────────────────────────   │  ──────────────────────────  │
│  │ $ gemini -p "Review auth"  │  │  Session: af_gemini_def456  │
│  │                            │  │  Role: worker               │
│  │ Analyzing src/auth.ts...   │  │  Specialist: code-reviewer  │
│  │                            │  │  Parent: claude (abc123)    │
│  │ Found 3 potential issues:  │  │  Started: 14:21:03          │
│  │                            │  │  Duration: 4m 12s           │
│  │ 1. SQL injection risk in   │  │  Status: working            │
│  │    line 47: raw string     │  │  Last activity: 2s ago      │
│  │    interpolation in query  │  │                              │
│  │                            │  │  ──────────────────────────  │
│  │ 2. Missing CSRF token      │  │  Messages (3)               │
│  │    validation on POST      │  │  ──────────────────────────  │
│  │    /api/auth/login         │  │  14:21 claude → gemini      │
│  │                            │  │    "Review auth module..."  │
│  │ 3. JWT expiry not checked  │  │  14:23 gemini → claude      │
│  │    in middleware...         │  │    "Found 3 issues..."     │
│  │                            │  │  14:24 claude → gemini      │
│  │ ▌ (streaming)              │  │    "Also check for XSS"   │
│  │                            │  │                              │
│  └────────────────────────────┘  │                              │
│                                  │                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Send to agent: [Type message here...]          [Send ↵]   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Key features:**
- **OutputTerminal**: Uses `xterm.js` to render raw terminal output faithfully (ANSI colors, cursor movement, escape sequences). This is critical for accurately displaying Claude Code's rich output.
- **SendPrompt**: Text input that calls `sendToAgent()` — respects wait-for-ready protocol.
- **Messages sidebar**: Shows all messages to/from this agent, with payload expansion.
- **Controls**: Kill (with confirmation), Nudge (sends empty keys for stalled agents), view full log.

### 3.3 Boss/Orchestrator Panel

Dedicated view for the boss agent (Claude). This is where the user **controls the orchestration** — inspired by OpenClaw's approval workflows.

```
┌─────────────────────────────────────────────────────────────────┐
│  Boss: Claude (abc123) ● WORKING                                │
├────────────────────────────────────┬────────────────────────────┤
│                                    │                            │
│  Boss Chat                         │  Delegation Log            │
│  ──────────────────────────────    │  ────────────────────────  │
│                                    │                            │
│  [You] 14:20                       │  14:21 → Gemini            │
│  Review the auth module and fix    │    Task: "Review auth..."  │
│  all security issues.              │    Status: ● working       │
│                                    │    Protocol: —             │
│  [Claude] 14:20                    │                            │
│  I'll delegate this as follows:    │  14:22 → Qwen             │
│  1. Gemini: security code review   │    Task: "Validate fix..." │
│  2. Qwen: validate the fixes      │    Status: ◌ ready         │
│  3. I'll synthesize results        │    Protocol: —             │
│                                    │                            │
│  [Claude] 14:24                    │  14:25 → Protocol          │
│  Gemini found 3 issues. Spawning   │    Run: collaborative     │
│  Qwen to validate the proposed     │    Agents: gemini, qwen    │
│  patches...                        │    Turn: 2/3               │
│                                    │                            │
│  [System] 14:26                    │                            │
│  ⚠ Qwen stalled (no activity      │                            │
│  for 3m). Nudge sent.             │                            │
│                                    │                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Send to boss: [Type instruction here...]     [Send ↵]   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Key features:**
- **BossChat**: Chat-style view showing the boss agent's output as conversation bubbles. The user can send instructions directly to the boss. Inspired by Claude Code UI's chat interface.
- **DelegationLog**: Real-time list of what the boss has delegated — which workers, which protocols, current status. Provides the "unified visibility" inspired by OpenClaw Mission Control.
- **System events**: Reconciliation loop events (stalled, zombie, escalation) appear inline as system messages.
- **Approval points** (future): When the boss requests confirmation for high-cost actions (spawn protocol, kill agent), the Dashboard can surface approval buttons inline.

### 3.4 Protocol Monitor

Visual representation of running protocols. Inspired by OpenClaw's activity timeline.

```
┌─────────────────────────────────────────────────────────────────┐
│  Protocol: collaborative                        ▶ Running       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Parameters                                                      │
│  ───────────────────────────────────────────                    │
│  task: "Design rate limiting for API"                            │
│  agents: a=gemini, b=qwen                                        │
│                                                                  │
│  Turn Timeline                                                   │
│  ───────────────────────────────────────────                    │
│                                                                  │
│  ✓ Turn 1: design (gemini)              1m 42s                  │
│    ├─ Status: COMPLETE                                           │
│    ├─ Output: "Token bucket algorithm with Redis backend..."    │
│    └─ [View full output]                                        │
│                                                                  │
│  ● Turn 2: critique (qwen)             0m 38s (running)         │
│    ├─ Status: IN_PROGRESS                                        │
│    ├─ AF_STATUS: not yet emitted                                 │
│    └─ [View live output]                                        │
│                                                                  │
│  ○ Turn 3: refine (gemini)             — (pending)              │
│    └─ Waiting for Turn 2                                        │
│                                                                  │
│  ───────────────────────────────────────────                    │
│  Elapsed: 2m 20s  │  Est. remaining: ~2m  │  Cost: medium       │
└─────────────────────────────────────────────────────────────────┘
```

### 3.5 Message Feed

Global view of all inter-agent communication. Filterable by agent, type, priority.

```
┌─────────────────────────────────────────────────────────────────┐
│  Messages                    Filter: [All ▼] [All types ▼]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  14:26:03  claude → qwen         type: task     prio: normal    │
│  "Validate the security patches from gemini's review..."         │
│                                                                  │
│  14:25:41  gemini → claude       type: result   prio: normal    │
│  "Found 3 issues: SQL injection (L47), CSRF missing, JWT..."    │
│  payload: { artifacts: ["auth-review.md"], exit_signal: true }  │
│                                                                  │
│  14:25:02  [system] → claude     type: escalation  prio: high   │
│  "Worker qwen (ghi789) stalled for 180s. Escalation level: 2"  │
│                                                                  │
│  14:21:05  claude → gemini       type: task     prio: normal    │
│  "Review this code for security: [src/auth.ts content]..."      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.6 Registry Browser

Browse all available profiles, protocols, specialists. Same data as TUI's F6 panel, but with richer display.

```
┌─────────────────────────────────────────────────────────────────┐
│  Registry              [Profiles] [Protocols] [Specialists]      │
├────────────────────────────────┬────────────────────────────────┤
│                                │                                │
│  Specialists                   │  mercury-db-health             │
│  ────────────────────────      │  ──────────────────────────── │
│  SYSTEM (2)                    │  v1.2.0 — monitoring/database  │
│    code-reviewer               │  "Monitors Mercury PostgreSQL  │
│    security-auditor            │   health, query performance,   │
│  USER (1)                      │   connection pools"            │
│    doc-writer                  │                                │
│  PROJECT (3)                   │  Profile: gemini               │
│  > mercury-db-health     ←     │  Model: gemini-2.0-flash      │
│    mercury-ingestion           │  Health: ✓ OK (3d ago)         │
│    mercury-api-guard           │  Watches: models.py, migrations│
│                                │                                │
│                                │  [Spawn with this specialist]  │
│                                │  [View YAML] [Check health]   │
│                                │                                │
└────────────────────────────────┴────────────────────────────────┘
```

---

## 4. API Specification

### 4.1 REST Endpoints

```
GET    /api/sessions                   # List all sessions
POST   /api/sessions                   # Spawn new agent
GET    /api/sessions/:id               # Get session detail
DELETE /api/sessions/:id               # Kill session
POST   /api/sessions/:id/send          # Send message to agent
GET    /api/sessions/:id/output        # Get output (log or tail)
GET    /api/sessions/:id/output/stream # SSE stream of output lines

GET    /api/messages                   # List messages (filterable)
GET    /api/messages?to=:id&unread=true  # Inbox for session

POST   /api/protocols/run              # Start protocol execution
GET    /api/protocols/:runId           # Protocol run status
GET    /api/protocols                  # List available protocols

GET    /api/registry/profiles          # List profiles
GET    /api/registry/specialists       # List specialists
GET    /api/registry/protocols         # List protocol definitions

GET    /api/system/health              # System health
GET    /api/system/config              # Current config
```

### 4.2 WebSocket Protocol

```typescript
// Client → Server
{ type: "subscribe", channel: "session:abc123" }
{ type: "subscribe", channel: "output:abc123" }
{ type: "subscribe", channel: "messages" }
{ type: "subscribe", channel: "protocol:run-xyz" }
{ type: "unsubscribe", channel: "session:abc123" }

// Server → Client
{ type: "event", channel: "session:abc123", event: "status_change",
  data: { from: "working", to: "idle", timestamp: "..." } }

{ type: "event", channel: "output:abc123", event: "new_lines",
  data: { lines: "Found 3 issues:\n1. SQL injection...", offset: 1247 } }

{ type: "event", channel: "messages", event: "new_message",
  data: { id: 42, from: "claude", to: "gemini", type: "task", ... } }

{ type: "event", channel: "protocol:run-xyz", event: "turn_complete",
  data: { turn_id: "design", agent: "gemini", duration_ms: 102000 } }
```

### 4.3 Output Streaming Strategy

Agent output is the most latency-sensitive data. Two approaches, used together:

1. **Log file tailing** (primary): The API watches log files (created by `tmux pipe-pane`) and pushes new lines via WebSocket. This is reliable, persisted, and handles reconnection (client sends last offset, server replays from there).

2. **Pane capture** (fallback/supplement): For agents without `pipe-pane` logging, periodic `tmux capture-pane` provides the current screen state. The client renders this as a terminal snapshot rather than a continuous stream.

For `output_format: json` agents (Claude with `--output-format stream-json`), the API parses the JSON stream and sends structured events (tool use, text output, thinking) — enabling richer Dashboard rendering than raw terminal text.

---

## 5. CLI Integration

### 5.1 New Commands

```bash
agent-forge dashboard                  # Start API server + open Dashboard in browser
  --port 3200                         # HTTP port (default: 3200)
  --host 0.0.0.0                      # Bind address (default: localhost)
  --no-open                           # Don't auto-open browser
  --token <token>                     # Set auth token (default: auto-generated)

agent-forge serve                      # Start API server only (headless, no browser)
  --port 3200
  --host 0.0.0.0
```

### 5.2 Dashboard as Static Build

The Dashboard frontend is built at package publish time (`vite build`) and served as static files by the Hono server. No separate build step needed by the user.

```
dist/dashboard/                        # Pre-built, shipped with npm package
├── index.html
├── assets/
│   ├── app-[hash].js
│   └── app-[hash].css
```

The `agent-forge dashboard` command:
1. Starts the Hono API server
2. Serves the pre-built Dashboard SPA
3. Opens the user's default browser
4. Prints the URL + auth token to the terminal

---

## 6. Mobile Experience

Inspired by Claude Code UI's mobile responsiveness. The Dashboard adapts to mobile screens for monitoring on the go.

```
Mobile Layout (< 768px):

┌──────────────────────┐
│  Agent Forge     ≡   │
├──────────────────────┤
│                      │
│  ● Claude  working   │
│     orchestrating    │
│     4m 23s           │
│                      │
│  ○ Gemini  idle      │
│     review auth      │
│     2m 10s           │
│                      │
│  ◌ Qwen    ready     │
│     validate fix     │
│     0m 45s           │
│                      │
│  [+ Spawn Agent]     │
│                      │
├──────────────────────┤
│ Fleet│Msgs│Proto│Reg │  ← Bottom tab bar
└──────────────────────┘
```

Tap an agent → full-screen agent view with output terminal and send prompt.

---

## 7. Security Model

The Dashboard runs on localhost by default. When exposed to the network (`--host 0.0.0.0`), security becomes critical.

### Authentication

```
Local mode (default):
  - Auto-generated bearer token printed to terminal on start
  - Token stored in ~/.agent-forge/dashboard.token
  - Dashboard reads token from localStorage after first login
  - Single-user, no session management needed

Network mode (--host 0.0.0.0):
  - Requires explicit --token flag or AF_DASHBOARD_TOKEN env var
  - HTTPS recommended (user responsibility or future built-in via mkcert)
  - Token-based auth via Authorization header + WebSocket query param
```

### Authorization

All actions go through the same core modules — the API doesn't bypass any safety checks. The `sendToAgent()` API call still waits for ready, the `kill` endpoint still requires the session to exist.

**Dangerous actions** require confirmation:
- Kill agent → "Are you sure?" dialog
- Kill all → Double confirmation
- Protocol abort → Confirmation + reason

---

## 8. Integration with PRD Roadmap

The Dashboard is **not a new version** — it's a parallel workstream that enhances Layer 4.

### Phase 1: API Bridge (v0.3.0 — alongside TUI)

Add the API layer as the TUI is being built. This ensures both UIs share the same data contracts from the start.

- `src/api/server.ts` — Hono server
- REST endpoints for sessions, messages, agents
- WebSocket for real-time events
- Serves static Dashboard build

### Phase 2: Core Dashboard (v0.4.0 — alongside Specialist System)

- Fleet Overview with agent cards
- Agent Detail View with OutputTerminal (xterm.js)
- Boss Panel with chat interface
- Message Feed
- Spawn dialog with profile + specialist picker

### Phase 3: Rich Dashboard (v0.5.0 — alongside Advanced Protocols)

- Protocol Monitor with visual timeline
- Registry Browser
- Mobile-optimized layout
- Protocol Runner wizard (start protocols from Dashboard)

### Phase 4: Advanced Features (v0.6.0+)

- Approval workflows (boss requests → Dashboard approves)
- Notification system (browser push for stalled/zombie/completed)
- Activity timeline (full audit trail, inspired by OpenClaw)
- Dashboard themes (light/dark)
- Multi-session overview (across projects)

---

## 9. Adoption from Reference Projects

### From OpenClaw Mission Control

| Feature | OpenClaw | Agent Forge Dashboard |
|---------|----------|-----------------------|
| Agent lifecycle management | ✓ | Fleet Overview + Agent Detail |
| Approval workflows | Core feature | Phase 4 — boss action approval |
| Activity timeline | ✓ | Message Feed + Protocol Monitor |
| Gateway integration | ✓ | N/A (local tmux, not distributed) |
| Work boards | Kanban-style | Protocol Monitor (turn-based) |
| Unified API | REST | REST + WebSocket |

**Adopted**: Approval workflow concept, activity timeline, agent lifecycle CRUD from web UI.
**Not adopted**: Gateway abstraction (Agent Forge is local-first), work board metaphor (protocols are turn-based, not Kanban).

### From Claude Code UI

| Feature | Claude Code UI | Agent Forge Dashboard |
|---------|---------------|-----------------------|
| Chat interface | ✓ (core) | Boss Panel (BossChat) |
| File management | ✓ | N/A (agents handle files, not Dashboard) |
| Session persistence | ✓ | Inherited from core (SQLite + tmux) |
| Terminal output | Basic | xterm.js (full ANSI fidelity) |
| Mobile support | ✓ (responsive) | Phase 3 — mobile layout |
| Multi-agent | Single agent | Multi-agent fleet (core differentiator) |

**Adopted**: Chat-style interaction with boss agent, mobile-responsive design, session auto-discovery, WebSocket real-time updates.
**Not adopted**: File browser (out of scope — agents manage files), code editor (not a Dashboard concern), Git explorer (agents use git, not the Dashboard).

---

## 10. What the Dashboard Is NOT

To avoid scope creep and maintain the "headless-first" principle:

1. **Not a code editor** — Agents write code. The Dashboard monitors and controls agents.
2. **Not a file browser** — Use the terminal or your IDE for files.
3. **Not a replacement for the TUI** — The TUI remains the fastest interface for terminal operators. The Dashboard adds accessibility, richer visualization, and mobile monitoring.
4. **Not a required component** — Agent Forge works fully without the Dashboard. CLI and TUI are the primary interfaces. The Dashboard is Layer 4 additive.
5. **Not a multi-tenant platform** — Single user, local-first. Network mode is for personal remote access, not team management (that's OpenClaw's domain).

---

## 11. File Structure Impact

New additions to the PRD's project structure:

```
agent-forge/
├── src/
│   ├── api/                          # NEW — API Bridge
│   │   ├── server.ts
│   │   ├── routes/
│   │   │   ├── sessions.ts
│   │   │   ├── messages.ts
│   │   │   ├── protocols.ts
│   │   │   ├── agents.ts
│   │   │   ├── registry.ts
│   │   │   └── system.ts
│   │   ├── ws/
│   │   │   ├── handler.ts
│   │   │   └── channels.ts
│   │   └── middleware/
│   │       ├── auth.ts
│   │       └── cors.ts
│   │
│   ├── dashboard/                    # NEW — Dashboard Frontend
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── vite.config.ts
│   │   ├── api/
│   │   ├── stores/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── styles/
│   │
│   ├── cli/
│   │   └── commands/
│   │       └── dashboard.ts          # NEW — dashboard command
│   │
│   ├── core/                         # UNCHANGED
│   ├── tmux/                         # UNCHANGED
│   ├── tui/                          # UNCHANGED
│   └── types/                        # UNCHANGED
```

### New Dependencies

```json
{
  "dependencies": {
    "hono": "^4.x"
  },
  "devDependencies": {
    "vite": "^6.x",
    "@vitejs/plugin-react": "^4.x",
    "tailwindcss": "^4.x",
    "@xterm/xterm": "^5.x",
    "zustand": "^5.x",
    "lucide-react": "^0.x"
  }
}
```

Note: `react` and `react-dom` are already dependencies (required by Ink for TUI). The Dashboard reuses them.

---

## 12. Summary: Why This Approach

1. **Additive, not disruptive**: The Dashboard doesn't change Layers 1–3. It adds an API Bridge and a web frontend — both optional.
2. **Shared core**: TUI and Dashboard consume the same session store, message bus, and protocol engine. No state duplication.
3. **Progressive enhancement**: Start with the API Bridge (useful for testing and automation even without the Dashboard), then add the web UI incrementally.
4. **Bun-native**: Hono runs natively on Bun (no Node.js adapter needed). Vite builds work with Bun. The entire stack stays in the Bun ecosystem.
5. **Ship the Dashboard pre-built**: Users run `agent-forge dashboard` and it just works. No `npm run build` step.
