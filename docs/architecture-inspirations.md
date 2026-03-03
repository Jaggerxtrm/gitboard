# Agent Forge — Architecture Inspirations & Improvement Recommendations

**Date**: 2026-02-27  
**Version**: 1.0.0  
**Scope**: Comprehensive survey of battle-tested multi-agent systems, with actionable improvements for Agent Forge

---

## Table of Contents

1. [Systems Surveyed](#1-systems-surveyed)
2. [Pattern 1 — Tiered Watchdog (Overstory)](#2-pattern-1--tiered-watchdog-overstory)
3. [Pattern 2 — Git Worktree Isolation (Overstory + Jean)](#3-pattern-2--git-worktree-isolation-overstory--jean)
4. [Pattern 3 — Typed SQLite Mail Bus (Overstory)](#4-pattern-3--typed-sqlite-mail-bus-overstory)
5. [Pattern 4 — Runtime Adapter Interface (Overstory)](#5-pattern-4--runtime-adapter-interface-overstory)
6. [Pattern 5 — Hierarchical Delegation with Depth Limits (Overstory + AutoGen)](#6-pattern-5--hierarchical-delegation-with-depth-limits-overstory--autogen)
7. [Pattern 6 — Team Execution Modes (Agno)](#7-pattern-6--team-execution-modes-agno)
8. [Pattern 7 — Durable Execution & Checkpointing (LangGraph + Temporal)](#8-pattern-7--durable-execution--checkpointing-langgraph--temporal)
9. [Pattern 8 — NDJSON Event Stream + Observability (Agno + Overstory)](#9-pattern-8--ndjson-event-stream--observability-agno--overstory)
10. [Pattern 9 — Agent2Agent (A2A) Protocol (Google)](#10-pattern-9--agent2agent-a2a-protocol-google)
11. [Pattern 10 — Guardrails & Human-in-the-Loop (OpenAI Agents SDK + Agno)](#11-pattern-10--guardrails--human-in-the-loop-openai-agents-sdk--agno)
12. [Pattern 11 — Structured Expertise / Continuous Learning (everything-claude-code)](#12-pattern-11--structured-expertise--continuous-learning-everything-claude-code)
13. [Pattern 12 — FIFO Merge Queue with Tiered Conflict Resolution (Overstory)](#13-pattern-12--fifo-merge-queue-with-tiered-conflict-resolution-overstory)
14. [Pattern 13 — Cost Tracking & Token Budget Enforcement](#14-pattern-13--cost-tracking--token-budget-enforcement)
15. [Pattern 14 — Agent Identity & Persistent CVs (Overstory)](#15-pattern-14--agent-identity--persistent-cvs-overstory)
16. [Prioritized Improvement Roadmap](#16-prioritized-improvement-roadmap)
17. [Architecture Comparison Matrix](#17-architecture-comparison-matrix)

---

## 1. Systems Surveyed

| System | Stars | Language | Key Innovation |
|--------|-------|----------|----------------|
| **Overstory** (jayminwest) | 554 | TypeScript/Bun | tmux + git worktrees + SQLite mail + tiered watchdog |
| **AutoGen** (Microsoft) | 54,939 | Python | Actor model, event-driven, distributed runtime |
| **LangGraph** (LangChain) | 25,217 | Python | Pregel-inspired graph, durable checkpointing, HITL |
| **CrewAI** | ~30k | Python | Crews + Flows, event-driven, enterprise-ready |
| **Agno** (agno-agi) | 38,247 | Python | Team modes (coordinate/route/broadcast/tasks), workflow primitives |
| **OpenHands** (All-Hands) | ~40k | Python | SWE-bench 77.6%, sandbox execution, SDK |
| **OpenAI Agents SDK** | 19,200 | Python | Handoffs, guardrails, sessions, tracing |
| **Pydantic AI** | 15,130 | Python | Type-safe agents, durable execution, graph support |
| **Google ADK** | 18,025 | Python | A2A protocol, sub-agents, tool confirmation |
| **Letta** (MemGPT) | 21,312 | Python/TS | Stateful memory, self-improving agents |
| **Temporal** | 18,551 | Go | Durable execution, workflow orchestration |
| **Inngest** | 4,926 | Go | Serverless durable functions, step functions |
| **ralph-claude-code** | 7,300 | Bash | Circuit breaker, git-diff progress detection |
| **get-shit-done** | — | — | Dual-layer verification, executor + verifier |
| **everything-claude-code** | — | — | 8-hook taxonomy, continuous learning pipeline |
| **jean** (coollabsio) | 461 | Rust/React | File-tailing NDJSON, git worktrees, detached processes |
| **CAMEL** | 16,119 | Python | Role-playing, scaling laws, 1M agent simulation |
| **Semantic Kernel** | 27,323 | C#/Python | Plugin system, planner, memory |

---

## 2. Pattern 1 — Tiered Watchdog (Overstory)

### What It Is

Overstory implements a **three-tier watchdog system** that goes far beyond Agent Forge's current binary alive/dead reconciliation loop:

```
Tier 0 — Mechanical Daemon (ov watch)
  - Runs every N ms (configurable, default 5s)
  - Checks: tmux session alive? last_activity recent?
  - Actions: mark zombie, send escalation mail

Tier 1 — AI-Assisted Triage (watchdog/triage.ts)
  - Triggered when Tier 0 detects anomaly
  - Reads agent transcript, classifies failure type
  - Actions: nudge, restart, escalate to coordinator

Tier 2 — Monitor Agent (ov monitor)
  - A full Claude Code session running at project root
  - Continuously patrols fleet health
  - Can spawn replacement agents, merge stalled work
```

### Why It Matters for Agent Forge

Agent Forge's current reconciliation loop (Section 3 of PRD) has three phases but only two tiers of intelligence:
1. **Liveness** (tmux exists?) — mechanical
2. **Progress** (last_activity recent?) — mechanical  
3. **Interaction** (waiting for input?) — mechanical

There is **no AI-assisted triage**. When an agent stalls, the system can nudge it (escalation_level 1) or mark it stalled (escalation_level 2), but it cannot *understand why* it stalled or *decide what to do* about it.

### Recommended Improvement

Add a **Tier 1 AI triage** step between mechanical detection and escalation:

```typescript
// Current Agent Forge flow:
// stalled_since set → escalation_level++ → nudge → mark stalled → notify parent

// Improved flow:
// stalled_since set → escalation_level++ → nudge
//   → if still stalled: AI triage (read log, classify failure)
//     → BLOCKED: notify parent with reason
//     → CONFUSED: inject clarification prompt
//     → LOOPING: inject circuit-breaker prompt
//     → CRASHED: restart agent with checkpoint
//     → WAITING_EXTERNAL: pause and notify user
```

Add to `sessions` table:
```sql
stall_classification TEXT,  -- 'blocked' | 'confused' | 'looping' | 'crashed' | 'waiting_external'
stall_reason         TEXT,  -- AI-generated one-line reason
```

---

## 3. Pattern 2 — Git Worktree Isolation (Overstory + Jean)

### What It Is

Both Overstory and Jean use **git worktrees** to give each agent an isolated filesystem view:

```bash
# Overstory: one worktree per worker agent
git worktree add .overstory/worktrees/{agent-name} -b agent/{agent-name}/{task-id}

# Jean: one worktree per Claude session
git worktree add .jean/worktrees/{session-id} -b jean/{session-id}
```

Each agent operates on its own branch. Work is merged back via a FIFO queue with conflict resolution.

### Why It Matters for Agent Forge

Agent Forge's current model has **no filesystem isolation**. Multiple worker agents writing to the same working directory will produce:
- Race conditions on file writes
- Merge conflicts that corrupt state
- Agents overwriting each other's work

This is critical for Mercury's strategy suite: Developer, Documentor, and Backtester all write files. Without worktree isolation, concurrent execution is unsafe.

### Recommended Improvement

Add optional worktree isolation to `agent-forge spawn`:

```yaml
# profiles/claude.yaml — add worktree config
worktree:
  enabled: false          # opt-in per profile
  base_path: ".agent-forge/worktrees"
  branch_prefix: "af/"
  auto_merge: false       # require explicit ov merge
  merge_strategy: "squash | merge | rebase"
```

```bash
# New CLI commands
agent-forge spawn gemini --task "implement auth" --worktree
agent-forge merge <session-id> [--into main] [--dry-run]
agent-forge worktree list
agent-forge worktree clean --completed
```

Add to `sessions` table:
```sql
worktree_path   TEXT,   -- .agent-forge/worktrees/{session-id}
worktree_branch TEXT,   -- af/{agent-id}/{session-id}
```

---

## 4. Pattern 3 — Typed SQLite Mail Bus (Overstory)

### What It Is

Overstory's mail system is a **purpose-built SQLite database** (`mail.db`) separate from the session store, with WAL mode for concurrent multi-agent access:

```typescript
// mail.db schema (simplified)
CREATE TABLE messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent  TEXT NOT NULL,
  to_agent    TEXT NOT NULL,   -- or @all, @builders, @scouts
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL,   -- 'task' | 'result' | 'nudge' | 'escalation' | 'broadcast'
  priority    TEXT DEFAULT 'normal',
  thread_id   TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  read        BOOLEAN DEFAULT FALSE,
  injected    BOOLEAN DEFAULT FALSE  -- has been injected into agent context?
);

-- WAL mode for concurrent access from multiple agents
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
```

Key innovation: **`--inject` flag** on `ov mail check` — when an agent polls its inbox, unread messages are formatted and injected directly into the agent's next prompt via the `UserPromptSubmit` hook. The agent doesn't need to know about the mail system; it just sees new context.

### Why It Matters for Agent Forge

Agent Forge's current `messages` table is in the same SQLite database as sessions. This creates:
1. **Contention**: multiple agents writing to the same DB file
2. **No broadcast**: no `@all` or capability-group addressing
3. **No injection**: messages are stored but not automatically surfaced to agents

### Recommended Improvement

Separate the message bus into its own database with WAL mode:

```typescript
// agent-forge/mail.db — separate from state.db
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;

CREATE TABLE mail (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id     TEXT NOT NULL,   -- session ID or 'forge' (system)
  to_id       TEXT NOT NULL,   -- session ID, '@all', '@workers', '@{specialist}'
  subject     TEXT,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN (
                'task', 'result', 'nudge', 'escalation',
                'broadcast', 'health_check', 'spawn_request',
                'worker_done', 'status_update'
              )),
  priority    TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  thread_id   TEXT,
  payload     TEXT,            -- JSON structured data
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  read        BOOLEAN DEFAULT FALSE,
  injected    BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_inbox    ON mail (to_id, read, injected);
CREATE INDEX idx_thread   ON mail (thread_id);
CREATE INDEX idx_priority ON mail (priority, created_at);
```

Add broadcast address resolution:
```typescript
// Resolve @all, @workers, @{specialist-id} to session IDs
function resolveAddress(address: string, sessions: Session[]): string[] {
  if (address === '@all') return sessions.map(s => s.id);
  if (address === '@workers') return sessions.filter(s => s.role === 'worker').map(s => s.id);
  if (address.startsWith('@')) {
    const specialistId = address.slice(1);
    return sessions.filter(s => s.specialist_id === specialistId).map(s => s.id);
  }
  return [address];
}
```

---

## 5. Pattern 4 — Runtime Adapter Interface (Overstory)

### What It Is

Overstory defines a formal `AgentRuntime` interface that abstracts over different CLI agents:

```typescript
// src/runtimes/types.ts
interface AgentRuntime {
  name: string;
  
  // Spawn a new agent session
  spawn(opts: SpawnOptions): Promise<RuntimeConnection>;
  
  // Deploy configuration (hooks, guards) to worktree
  deployConfig(worktreePath: string, opts: ConfigOptions): Promise<void>;
  
  // Detect if agent is ready (not busy)
  isReady(session: string): Promise<boolean>;
  
  // Parse agent transcript for structured output
  parseTranscript(logPath: string): Promise<TranscriptEntry[]>;
  
  // Enforce tool guards (block dangerous operations)
  enforceGuards(session: string, rules: GuardRule[]): Promise<void>;
}

// Implementations: claude.ts, pi.ts, copilot.ts, codex.ts
```

### Why It Matters for Agent Forge

Agent Forge's profiles YAML is a good start, but it's **data-only** — it defines detection patterns and commands, but doesn't define a programmatic interface for runtime-specific behavior. Adding a new agent requires modifying the core orchestrator, not just adding a profile.

### Recommended Improvement

Formalize the runtime adapter pattern in TypeScript:

```typescript
// src/runtimes/types.ts
export interface AgentRuntime {
  readonly id: string;
  readonly name: string;
  
  // Lifecycle
  spawn(opts: SpawnOpts): Promise<SpawnResult>;
  resume(session: Session, prompt: string): Promise<void>;
  kill(session: Session): Promise<void>;
  
  // Status detection
  isReady(session: Session): Promise<boolean>;
  isBusy(session: Session): Promise<boolean>;
  isError(session: Session): Promise<boolean>;
  isWaitingForInput(session: Session): Promise<boolean>;
  
  // Communication
  send(session: Session, message: string): Promise<void>;
  read(session: Session, opts?: ReadOpts): Promise<string>;
  
  // Output parsing
  parseAFStatus(output: string): AFStatus | null;
  parseStructuredOutput(logPath: string): Promise<StructuredOutput[]>;
  
  // Optional: hook deployment for supported runtimes
  deployHooks?(worktreePath: string): Promise<void>;
}

// Register adapters
const runtimeRegistry = new Map<string, AgentRuntime>();
runtimeRegistry.set('claude', new ClaudeRuntime());
runtimeRegistry.set('gemini', new GeminiRuntime());
runtimeRegistry.set('qwen', new QwenRuntime());
runtimeRegistry.set('ccs-glm', new CCSGLMRuntime());
```

---

## 6. Pattern 5 — Hierarchical Delegation with Depth Limits (Overstory + AutoGen)

### What It Is

Overstory implements a **configurable depth-limited hierarchy**:

```
Coordinator (depth 0) — persistent orchestrator, read-only
  └── Team Lead (depth 1) — can spawn sub-workers, read-write
        └── Workers: Scout, Builder, Reviewer, Merger (depth 2, leaf nodes)
```

Depth is enforced at spawn time: `ov sling --depth 2` will fail if `maxDepth: 2` is configured. This prevents runaway spawning cascades.

AutoGen's Core API uses the **Actor model** — each agent is an actor that receives messages, processes them, and sends messages to other actors. The runtime handles message routing, backpressure, and distributed execution.

### Why It Matters for Agent Forge

Agent Forge's current boss/worker model is **flat** — there's one boss and N workers. There's no intermediate tier. Mercury's workflow (Supervisor → Researcher + Developer + Backtester + Documentor) maps naturally to a 3-tier hierarchy, not a flat model.

### Recommended Improvement

Add a `supervisor` role and depth-limited spawning:

```yaml
# profiles/claude.yaml — add hierarchy config
hierarchy:
  role: boss          # boss | supervisor | worker
  max_depth: 2        # max spawn depth from this agent
  can_spawn: true     # can this agent spawn sub-agents?
  spawn_roles:        # which roles can this agent spawn?
    - supervisor
    - worker
```

```typescript
// Enforce depth at spawn time
async function spawnAgent(opts: SpawnOpts): Promise<Session> {
  const parentSession = opts.parentId 
    ? await store.getSession(opts.parentId) 
    : null;
  
  const depth = parentSession ? (parentSession.depth ?? 0) + 1 : 0;
  const maxDepth = config.hierarchy?.maxDepth ?? 2;
  
  if (depth > maxDepth) {
    throw new HierarchyError(
      `Cannot spawn at depth ${depth}: max depth is ${maxDepth}`
    );
  }
  
  return store.createSession({ ...opts, depth });
}
```

Add to `sessions` table:
```sql
depth           INTEGER DEFAULT 0,  -- hierarchy depth (0=boss, 1=supervisor, 2=worker)
max_children    INTEGER,            -- max sub-agents this session can spawn
children_count  INTEGER DEFAULT 0,  -- current spawned children
```

---

## 7. Pattern 6 — Team Execution Modes (Agno)

### What It Is

Agno defines **four distinct team execution modes** that cover the full spectrum of multi-agent coordination:

```python
class TeamMode(str, Enum):
    coordinate = "coordinate"
    # Default supervisor pattern. Leader picks members, crafts tasks, synthesizes responses.
    # Best for: complex tasks requiring judgment about which agent to use
    
    route = "route"
    # Router pattern. Leader routes to a specialist and returns the member's response directly.
    # Best for: triage/dispatch where the leader just needs to pick the right expert
    
    broadcast = "broadcast"
    # Broadcast pattern. Leader delegates the same task to all members simultaneously.
    # Best for: getting multiple independent opinions, parallel evaluation
    
    tasks = "tasks"
    # Autonomous task-based execution. Leader decomposes goals into a shared task list,
    # delegates tasks to members, and loops until all work is complete.
    # Best for: large projects requiring decomposition and parallel execution
```

### Why It Matters for Agent Forge

Agent Forge's Protocol Engine defines specific named protocols (collaborative, adversarial, troubleshoot, handshake) but doesn't abstract the **execution mode** from the **protocol content**. The execution mode (how agents are coordinated) is conflated with the protocol definition (what agents do).

### Recommended Improvement

Add execution modes as a first-class concept in protocol YAML:

```yaml
# protocols/collaborative.yaml
name: collaborative
execution_mode: coordinate    # coordinate | route | broadcast | tasks | sequential
description: "Multi-turn design session"

# protocols/parallel-review.yaml
name: parallel-review
execution_mode: broadcast     # All agents review simultaneously
description: "Get independent opinions from all workers"

# protocols/task-decomposition.yaml
name: task-decomposition
execution_mode: tasks         # Boss decomposes, workers execute autonomously
description: "Decompose large task and execute in parallel"
```

```typescript
type ExecutionMode = 
  | 'sequential'   // Current default: turns execute one after another
  | 'coordinate'   // Boss picks agent per turn based on context
  | 'route'        // Boss routes to one specialist, returns directly
  | 'broadcast'    // All agents get same task simultaneously
  | 'tasks';       // Boss decomposes into task list, workers self-assign
```

---

## 8. Pattern 7 — Durable Execution & Checkpointing (LangGraph + Temporal)

### What It Is

**LangGraph** implements durable execution via checkpointers — every state transition is persisted to a store (SQLite, Redis, Postgres). If the process crashes, execution resumes from the last checkpoint:

```python
# LangGraph: every node execution is checkpointed
from langgraph.checkpoint.sqlite import SqliteSaver

checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
graph = workflow.compile(checkpointer=checkpointer)

# Resume from checkpoint
result = graph.invoke(
    {"messages": []},
    config={"configurable": {"thread_id": "session-123"}}
)
```

**Temporal** takes this further — workflows are **durable functions** that survive process crashes, server restarts, and network failures. Every activity (function call) is retried automatically with configurable backoff.

**Pydantic AI** adds durable execution at the agent level — agents can pause mid-execution, wait for human approval, and resume exactly where they left off.

### Why It Matters for Agent Forge

Agent Forge's current resilience model is: "if the forge process dies, agents continue in tmux. `forge attach` reconnects." This is **process-level resilience** (tmux survives), but not **protocol-level resilience** (protocol state is lost).

If the forge process dies mid-protocol (e.g., during the `critique` turn of a collaborative protocol), the protocol must restart from the beginning. There's no checkpoint of which turns completed and what their outputs were.

### Recommended Improvement

Add protocol checkpointing to the Protocol Engine:

```typescript
// protocol-checkpoint.db (separate from state.db)
CREATE TABLE protocol_runs (
  id           TEXT PRIMARY KEY,   -- uuid
  protocol_id  TEXT NOT NULL,      -- 'collaborative', 'adversarial', etc.
  status       TEXT NOT NULL,      -- 'running' | 'completed' | 'failed' | 'paused'
  parameters   TEXT,               -- JSON: {task, context, ...}
  started_at   DATETIME,
  completed_at DATETIME,
  thread_id    TEXT                -- groups all turns in this run
);

CREATE TABLE protocol_turns (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL REFERENCES protocol_runs(id),
  turn_id      TEXT NOT NULL,      -- 'design', 'critique', 'refine'
  status       TEXT NOT NULL,      -- 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  agent_id     TEXT,               -- which agent executed this turn
  session_id   TEXT,               -- which session executed this turn
  output       TEXT,               -- captured output (output_var value)
  started_at   DATETIME,
  completed_at DATETIME,
  attempt      INTEGER DEFAULT 1   -- retry count
);
```

```typescript
// Protocol Engine: resume from checkpoint
async function runProtocol(
  protocolId: string,
  params: Record<string, string>,
  opts: { resumeRunId?: string }
): Promise<ProtocolResult> {
  
  const run = opts.resumeRunId
    ? await checkpointStore.getProtocolRun(opts.resumeRunId)
    : await checkpointStore.createProtocolRun(protocolId, params);
  
  const completedTurns = await checkpointStore.getCompletedTurns(run.id);
  const completedTurnIds = new Set(completedTurns.map(t => t.turn_id));
  
  for (const turn of protocol.turns) {
    if (completedTurnIds.has(turn.id)) {
      // Restore output from checkpoint
      const checkpoint = completedTurns.find(t => t.turn_id === turn.id)!;
      context[turn.output_var] = checkpoint.output;
      continue;
    }
    
    await executeTurn(turn, context, run.id);
  }
}
```

---

## 9. Pattern 8 — NDJSON Event Stream + Observability (Agno + Overstory)

### What It Is

Both Agno and Overstory emit **structured NDJSON events** for every significant action:

**Overstory** (`ov feed --follow`):
```jsonl
{"ts":"2026-02-27T10:00:00Z","agent":"builder-1","event":"tool-start","tool":"Write","args":{"path":"src/auth.ts"}}
{"ts":"2026-02-27T10:00:01Z","agent":"builder-1","event":"tool-end","tool":"Write","duration_ms":45}
{"ts":"2026-02-27T10:00:02Z","agent":"scout-1","event":"mail-received","from":"coordinator","subject":"Research auth patterns"}
{"ts":"2026-02-27T10:00:05Z","agent":"builder-1","event":"stall-detected","last_activity_ago_ms":600000}
```

**Agno** emits typed run events:
```python
class RunEvent(str, Enum):
    run_started = "RunStarted"
    run_completed = "RunCompleted"
    run_error = "RunError"
    tool_call_started = "ToolCallStarted"
    tool_call_completed = "ToolCallCompleted"
    reasoning_started = "ReasoningStarted"
    reasoning_completed = "ReasoningCompleted"
```

**Jean** uses file-tailing of Claude's `--output-format stream-json` output:
```jsonl
{"type":"chat:chunk","content":"I'll implement the auth module..."}
{"type":"chat:tool_use","tool":"Write","input":{"path":"src/auth.ts"}}
{"type":"chat:tool_result","tool":"Write","output":"File written"}
{"type":"chat:done","usage":{"input_tokens":1200,"output_tokens":450}}
```

### Why It Matters for Agent Forge

Agent Forge currently logs to SQLite `messages` table and file logs, but has **no unified event stream**. The TUI dashboard reads from SQLite, but there's no way to:
- Stream events to external observability tools (Prometheus, Grafana, Datadog)
- Replay a session's event history
- Build a web UI that subscribes to live events
- Track token costs per session

### Recommended Improvement

Add a structured event emitter to the Agent Forge core:

```typescript
// src/events/emitter.ts
type AgentForgeEvent = 
  | { type: 'session.created'; sessionId: string; agentId: string; role: string }
  | { type: 'session.status_changed'; sessionId: string; from: string; to: string }
  | { type: 'message.sent'; fromId: string; toId: string; messageType: string }
  | { type: 'turn.started'; runId: string; turnId: string; agentId: string }
  | { type: 'turn.completed'; runId: string; turnId: string; durationMs: number }
  | { type: 'agent.stalled'; sessionId: string; lastActivityAgoMs: number }
  | { type: 'agent.zombie'; sessionId: string; reason: string }
  | { type: 'token.usage'; sessionId: string; inputTokens: number; outputTokens: number }
  | { type: 'cost.update'; sessionId: string; costUsd: number };

class EventEmitter {
  private handlers: Array<(event: AgentForgeEvent) => void> = [];
  
  emit(event: AgentForgeEvent): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
    
    // Write to events.db
    this.eventsDb.run(
      'INSERT INTO events (ts, type, payload) VALUES (?, ?, ?)',
      [new Date().toISOString(), event.type, JSON.stringify(event)]
    );
    
    // Write to NDJSON log
    fs.appendFileSync(this.eventLogPath, line + '\n');
    
    // Notify handlers (TUI, web UI, etc.)
    this.handlers.forEach(h => h(event));
  }
}
```

Add new CLI commands:
```bash
agent-forge feed --follow              # Live NDJSON event stream
agent-forge trace <session-id>         # Chronological event timeline
agent-forge costs [--by-agent]         # Token/cost breakdown
agent-forge replay <session-id>        # Replay session events
```

---

## 10. Pattern 9 — Agent2Agent (A2A) Protocol (Google)

### What It Is

Google's **A2A protocol** (Apache 2.0, Linux Foundation) defines a standard for agent-to-agent communication over HTTP(S) with JSON-RPC 2.0:

```json
// Agent Card — discovery document served at /.well-known/agent.json
{
  "name": "Mercury Strategy Researcher",
  "description": "Researches trading strategies using market data",
  "url": "https://localhost:8001",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true
  },
  "skills": [
    {
      "id": "research-strategy",
      "name": "Research Trading Strategy",
      "description": "Research and analyze a trading strategy",
      "inputModes": ["text"],
      "outputModes": ["text", "file"]
    }
  ]
}
```

Key features:
- **Agent Cards** for capability discovery
- **Streaming** via Server-Sent Events (SSE)
- **Async push notifications** for long-running tasks
- **Opacity** — agents collaborate without exposing internal state
- SDKs in Python, TypeScript, Go, Java, .NET

### Why It Matters for Agent Forge

Agent Forge currently uses tmux as the only inter-agent communication channel. This means:
- All agents must run on the same machine
- No standard protocol for external agent integration
- No capability discovery

A2A would allow Agent Forge to:
- Integrate with external agents (e.g., a remote Gemini agent on a different server)
- Expose Agent Forge sessions as A2A-compliant endpoints
- Discover and use third-party specialist agents

### Recommended Improvement

Add A2A as an optional transport layer alongside tmux:

```yaml
# profiles/gemini-remote.yaml
id: gemini-remote
name: "Gemini CLI (Remote)"
transport: a2a              # 'tmux' (default) | 'a2a'
a2a:
  agent_card_url: "https://gemini-agent.example.com/.well-known/agent.json"
  auth:
    type: bearer
    token_env: GEMINI_AGENT_TOKEN
```

```typescript
// src/transports/a2a.ts
class A2ATransport implements AgentTransport {
  async send(agentCardUrl: string, message: string): Promise<void> {
    const card = await fetchAgentCard(agentCardUrl);
    await jsonRpc(card.url, 'tasks/send', { message });
  }
  
  async stream(agentCardUrl: string, message: string): AsyncIterable<string> {
    const card = await fetchAgentCard(agentCardUrl);
    return sseStream(card.url, 'tasks/sendSubscribe', { message });
  }
}
```

---

## 11. Pattern 10 — Guardrails & Human-in-the-Loop (OpenAI Agents SDK + Agno)

### What It Is

**OpenAI Agents SDK** implements guardrails as first-class objects:

```python
from agents import Agent, GuardrailFunctionOutput, input_guardrail

@input_guardrail
async def no_dangerous_commands(ctx, agent, input):
    if "rm -rf" in input or "DROP TABLE" in input:
        return GuardrailFunctionOutput(
            output_info="Dangerous command detected",
            tripwire_triggered=True  # blocks execution
        )
    return GuardrailFunctionOutput(tripwire_triggered=False)

agent = Agent(
    name="coder",
    guardrails=[no_dangerous_commands]
)
```

**Agno** adds **approval workflows** — certain tool calls require explicit human confirmation before execution:

```python
agent = Agent(
    tools=[dangerous_tool],
    tool_approval=True,  # all tools require approval
    # or per-tool:
    tools=[
        Function(dangerous_tool, requires_approval=True),
        Function(safe_tool, requires_approval=False),
    ]
)
```

**Pydantic AI** supports **deferred tools** — tools that pause execution and wait for human input:

```python
@agent.tool(defer=True)  # pauses until human approves
async def deploy_to_production(ctx, environment: str) -> str:
    ...
```

### Why It Matters for Agent Forge

Agent Forge's current `interaction_patterns` detection (waiting for `[y/N]`, passphrase, etc.) is **reactive** — it detects when an agent is already blocked. There's no **proactive** guardrail system that can intercept dangerous operations before they execute.

### Recommended Improvement

Add a guardrail layer to the Protocol Engine:

```yaml
# protocols/collaborative.yaml — add guardrails
guardrails:
  - type: pattern_block
    patterns: ["rm -rf", "DROP TABLE", "DELETE FROM"]
    action: abort_turn
    message: "Dangerous operation blocked by guardrail"
  
  - type: approval_required
    patterns: ["git push", "deploy", "production"]
    action: pause_and_notify
    notify: boss_session
  
  - type: cost_limit
    max_tokens_per_turn: 50000
    action: warn_and_continue
```

```typescript
// src/guardrails/engine.ts
interface Guardrail {
  check(message: string, context: TurnContext): GuardrailResult;
}

type GuardrailResult = 
  | { action: 'allow' }
  | { action: 'block'; reason: string }
  | { action: 'pause'; reason: string; notifySessionId: string }
  | { action: 'warn'; reason: string };
```

---

## 12. Pattern 11 — Structured Expertise / Continuous Learning (everything-claude-code)

### What It Is

The `everything-claude-code` repo implements a **Continuous Learning v2** pipeline:

```
Every tool call (PostToolUse hook)
  → Background Haiku observer agent
    → Extracts atomic "instincts" (YAML + Markdown)
      → Clusters into artifacts (commands/skills/agents)
        → Promotes to specialist definitions
```

Instinct data model:
```yaml
---
id: "inst-auth-pattern-001"
trigger: "implementing authentication"
confidence: 0.85
domain: "security"
source: "PostToolUse:Write:src/auth.ts"
---
## Action
Always use bcrypt with cost factor >= 12 for password hashing.

## Evidence
Observed in 3 sessions: sessions/abc123, sessions/def456, sessions/ghi789
```

### Why It Matters for Agent Forge

Agent Forge's specialists are **static** — they're defined once in YAML and never updated based on what agents learn. There's no mechanism for agents to contribute back to the knowledge base.

### Recommended Improvement

Add a learning pipeline that promotes agent outputs to specialist knowledge:

```typescript
// src/learning/pipeline.ts
interface LearningEvent {
  sessionId: string;
  specialistId: string | null;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: string;
  timestamp: Date;
}

class LearningPipeline {
  // Called by PostToolUse hook
  async observe(event: LearningEvent): Promise<void> {
    // Extract patterns from tool call
    const patterns = await this.extractor.extract(event);
    
    // Store as candidate instincts
    await this.instinctStore.add(patterns);
    
    // Periodically cluster and promote
    if (await this.shouldPromote()) {
      await this.promoter.promote();
    }
  }
}
```

Add to specialist YAML:
```yaml
# specialists/mercury-db-health.specialist.yaml
learning:
  enabled: true
  auto_promote_threshold: 0.8   # confidence threshold for auto-promotion
  review_required: false         # require human review before promotion
  instinct_store: ".agent-forge/instincts/{specialist-id}/"
```

---

## 13. Pattern 12 — FIFO Merge Queue with Tiered Conflict Resolution (Overstory)

### What It Is

Overstory's merge system uses a **FIFO queue** with **4-tier conflict resolution**:

```
Tier 1: Auto-merge (no conflicts)
  → git merge --no-ff

Tier 2: Semantic merge (non-overlapping changes)
  → git merge-file with custom driver

Tier 3: AI-assisted merge (overlapping changes)
  → Merger agent reads both versions, produces merged output

Tier 4: Human escalation (irreconcilable conflicts)
  → Pause queue, notify user, wait for manual resolution
```

The merge queue is a separate SQLite database (`merge-queue.db`) with WAL mode:
```sql
CREATE TABLE merge_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name  TEXT NOT NULL,
  branch      TEXT NOT NULL,
  target      TEXT NOT NULL,
  status      TEXT DEFAULT 'pending',  -- pending | running | completed | failed | escalated
  tier        INTEGER,                 -- which tier resolved it
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
```

### Why It Matters for Agent Forge

Agent Forge has no merge system at all. If worktree isolation is added (Pattern 2), a merge system becomes essential. Without it, worktrees are dead ends.

### Recommended Improvement

Add a merge queue as part of the worktree feature:

```bash
# New CLI commands
agent-forge merge <session-id>           # Merge session's worktree branch
agent-forge merge --all                  # Merge all completed sessions
agent-forge merge --dry-run              # Check for conflicts only
agent-forge merge-queue list             # Show pending merges
agent-forge merge-queue status           # Show queue health
```

```typescript
// src/merge/queue.ts
class MergeQueue {
  async enqueue(sessionId: string, targetBranch: string): Promise<void>;
  async process(): Promise<void>;
  
  private async tryAutoMerge(entry: MergeEntry): Promise<boolean>;
  private async trySemanticMerge(entry: MergeEntry): Promise<boolean>;
  private async tryAIMerge(entry: MergeEntry): Promise<boolean>;
  private async escalateToHuman(entry: MergeEntry): Promise<void>;
}
```

---

## 14. Pattern 13 — Cost Tracking & Token Budget Enforcement

### What It Is

**Overstory** (`ov costs`) tracks token usage per agent, per run, per capability:
```bash
ov costs --by-capability
# builder:    $2.34 (45,230 tokens)
# scout:      $0.89 (17,100 tokens)
# reviewer:   $0.45 (8,700 tokens)
# Total:      $3.68 (71,030 tokens)
```

**Agno** tracks `RunMetrics` and `SessionMetrics` per agent run.

**ralph-claude-code** implements hourly API call rate limiting with a rolling window counter.

### Why It Matters for Agent Forge

Agent Forge has no cost tracking. For Mercury's strategy suite (which may run for hours with multiple agents), uncontrolled token usage could result in unexpected API costs.

### Recommended Improvement

Add cost tracking to the session store and protocol engine:

```sql
-- Add to sessions table
input_tokens    INTEGER DEFAULT 0,
output_tokens   INTEGER DEFAULT 0,
cost_usd        REAL DEFAULT 0.0,
token_budget    INTEGER,            -- max tokens for this session (null = unlimited)
```

```typescript
// src/costs/tracker.ts
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 0.000003, output: 0.000015 },
  'gemini-2.5-flash':  { input: 0.000001, output: 0.000004 },
  'qwen-2.5-coder':    { input: 0.0000005, output: 0.000002 },
};

class CostTracker {
  async recordUsage(sessionId: string, model: string, inputTokens: number, outputTokens: number): Promise<void> {
    const pricing = PRICING[model] ?? { input: 0, output: 0 };
    const cost = (inputTokens * pricing.input) + (outputTokens * pricing.output);
    
    await store.updateSession(sessionId, {
      input_tokens: sql`input_tokens + ${inputTokens}`,
      output_tokens: sql`output_tokens + ${outputTokens}`,
      cost_usd: sql`cost_usd + ${cost}`,
    });
    
    // Check budget
    const session = await store.getSession(sessionId);
    if (session.token_budget && (session.input_tokens + session.output_tokens) > session.token_budget) {
      await this.enforceTokenBudget(session);
    }
  }
}
```

---

## 15. Pattern 14 — Agent Identity & Persistent CVs (Overstory)

### What It Is

Overstory gives each agent a **persistent identity** that survives session restarts:

```yaml
# .overstory/agents/builder-1/identity.yaml
name: builder-1
capability: builder
created_at: "2026-02-27T10:00:00Z"
sessions_completed: 12
tasks_completed: 47
specializations:
  - "TypeScript/Bun backend"
  - "SQLite schema design"
  - "tmux orchestration"
expertise_level: 0.78   # 0.0-1.0, updated by learning pipeline
last_active: "2026-02-27T22:00:00Z"
```

This enables:
- **Routing by expertise**: assign tasks to agents with relevant specializations
- **Learning continuity**: expertise accumulates across sessions
- **Audit trail**: full history of what each agent has done

### Why It Matters for Agent Forge

Agent Forge sessions are ephemeral — when a session ends, its knowledge is gone. The specialist system provides domain knowledge, but there's no per-agent identity that accumulates over time.

### Recommended Improvement

Add agent identity as an optional feature for long-running specialist agents:

```yaml
# specialists/mercury-researcher.specialist.yaml
identity:
  enabled: true
  persist_path: ".agent-forge/identities/{specialist-id}.yaml"
  track_metrics:
    - tasks_completed
    - avg_quality_score
    - specializations
    - expertise_domains
```

---

## 16. Prioritized Improvement Roadmap

### P0 — Critical (v0.6.0, before Mercury launch)

| # | Pattern | Effort | Impact | Rationale |
|---|---------|--------|--------|-----------|
| 1 | **Tiered Watchdog** (Pattern 1) | Medium | Critical | Mercury agents run for hours; mechanical detection is insufficient |
| 2 | **Protocol Checkpointing** (Pattern 7) | Medium | Critical | Protocol state lost on forge crash; unacceptable for long runs |
| 3 | **Separate Mail DB with WAL** (Pattern 3) | Low | High | SQLite contention with multiple concurrent agents |
| 4 | **Cost Tracking** (Pattern 13) | Low | High | Mercury strategy suite can run for hours; budget enforcement needed |

### P1 — High Value (v0.7.0)

| # | Pattern | Effort | Impact | Rationale |
|---|---------|--------|--------|-----------|
| 5 | **Git Worktree Isolation** (Pattern 2) | High | High | Developer + Documentor + Backtester write files concurrently |
| 6 | **NDJSON Event Stream** (Pattern 8) | Medium | High | Observability foundation for TUI, web UI, and external tools |
| 7 | **Hierarchical Delegation** (Pattern 5) | Medium | High | Mercury's Supervisor → Worker model needs 3-tier hierarchy |
| 8 | **Runtime Adapter Interface** (Pattern 4) | Medium | Medium | Formalize what's currently implicit in profile YAML |

### P2 — Strategic (v1.0.0)

| # | Pattern | Effort | Impact | Rationale |
|---|---------|--------|--------|-----------|
| 9 | **Team Execution Modes** (Pattern 6) | Medium | High | Broadcast and task-decomposition modes unlock new workflows |
| 10 | **Guardrails** (Pattern 10) | Medium | Medium | Safety for autonomous agents in production |
| 11 | **FIFO Merge Queue** (Pattern 12) | High | Medium | Required if worktree isolation is adopted |
| 12 | **A2A Protocol** (Pattern 9) | High | Medium | Future-proofing for distributed/remote agents |

### P3 — Future (v1.3.0+)

| # | Pattern | Effort | Impact | Rationale |
|---|---------|--------|--------|-----------|
| 13 | **Continuous Learning** (Pattern 11) | Very High | High | Specialists that improve over time |
| 14 | **Agent Identity & CVs** (Pattern 14) | Medium | Medium | Long-running specialist agents with accumulated expertise |

---

## 17. Architecture Comparison Matrix

| Feature | Agent Forge (current) | Overstory | AutoGen | LangGraph | Agno |
|---------|----------------------|-----------|---------|-----------|------|
| **Execution layer** | tmux | tmux + git worktrees | Python processes | Python processes | FastAPI + Python |
| **State store** | SQLite (single DB) | SQLite (5 DBs, WAL) | In-memory + Redis | SQLite/Redis/Postgres | SQLite/Postgres |
| **Message bus** | SQLite messages table | Separate mail.db (WAL) | Actor mailboxes | State graph edges | Agent handoffs |
| **Watchdog** | 3-phase mechanical | 3-tier (mechanical + AI + monitor agent) | None | None | None |
| **Protocol definition** | YAML turns | Instruction overlays | Python code | Graph nodes | Workflow steps |
| **Execution modes** | Sequential turns | Sequential + parallel | Sequential + parallel | Graph-based | coordinate/route/broadcast/tasks |
| **Checkpointing** | None | Session checkpoints | None | Full graph checkpointing | None |
| **Cost tracking** | None | Per-agent, per-run | None | None | Per-run metrics |
| **Guardrails** | None | Tool guards (hooks) | None | None | Approval workflows |
| **Observability** | SQLite + file logs | NDJSON events + 8 CLI commands | Tracing | LangSmith | AgentOS UI + tracing |
| **Agent isolation** | None | Git worktrees | None | None | None |
| **Merge system** | None | FIFO queue + 4-tier resolution | None | None | None |
| **A2A support** | None | None | None | None | Partial |
| **Learning** | None | None | None | None | None |
| **TypeScript/Bun** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Headless-first** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Declarative YAML** | ✅ | Partial | ❌ | ❌ | ❌ |

---

## Key Takeaways

1. **Overstory is the closest architectural sibling** — same tech stack (TypeScript/Bun + tmux + SQLite), same problem domain (CLI agent orchestration), but 18 months ahead in production hardening. The tiered watchdog, separate mail DB, git worktrees, and FIFO merge queue are all directly adoptable.

2. **LangGraph's checkpointing is the most critical missing feature** — protocol state loss on forge crash is unacceptable for Mercury's long-running strategy suite. This should be P0.

3. **Agno's team execution modes are the most elegant abstraction** — the coordinate/route/broadcast/tasks taxonomy cleanly covers all multi-agent coordination patterns. Agent Forge's named protocols (collaborative, adversarial, etc.) should be refactored to use these modes as primitives.

4. **A2A protocol is the right long-term bet for interoperability** — Google, IBM, and the Linux Foundation are backing it. Agent Forge should plan A2A support for v1.0.0 to enable integration with the broader agent ecosystem.

5. **Cost tracking is non-negotiable for production** — every production multi-agent system (Overstory, Agno, OpenAI Agents SDK) tracks token usage. Agent Forge must add this before Mercury goes live.

6. **The Actor model (AutoGen Core) is the right mental model for distributed agents** — even if Agent Forge stays single-machine for now, designing the message bus as an actor mailbox system will make future distribution straightforward.
