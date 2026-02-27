# Agent 4 Research: agentmanager + overstory

**Date**: 2026-02-27
**Researcher**: Agent 4 (autonomous research session)
**Scope**: Deep analysis of `kevinelliott/agentmanager` and `jayminwest/overstory`, with specific focus on features the Agent Forge PRD explicitly did not adopt.

---

## Executive Summary

1. **agentmanager is not a runtime orchestrator — it is a package manager for AI CLI tools.** The PRD's integrations.md lists it as "gestione di agenti non via tmux" — but after reading the actual source, catalog.json (47 agents), and storage schema, the repo's purpose is detecting, installing, updating, and version-managing AI CLI agents across platforms (npm, pip, brew, native). It has no process lifecycle management, no inter-agent communication, and no session state. The comparison to tmux is a category error. This finding eliminates the framing question but raises a different, more useful one: what does the kevinelliott/agentpipe repo do? That is likely the intended comparison. agentmanager itself offers zero architectural signal for autonomous systems.

2. **Overstory's watchdog daemon is materially more sophisticated than Agent Forge's reconciliation loop.** The PRD's reconciliation loop is a binary alive/dead check (every 5s). Overstory's watchdog implements a four-level progressive escalation (warn → nudge → AI triage → terminate), tracks `stalled_since` separately from `last_activity`, and applies the Zero-False-Confidence (ZFC) principle. The difference is the distinction between "is the process running?" and "is the agent making progress?" Agent Forge cannot currently detect a running-but-stuck agent — a critical gap for Mercury's long-running strategy suite agents.

3. **Overstory's typed SQLite mail system would directly solve Mercury's dual-DB reference problem.** Agent Forge's current message bus (tmux pipe + file log + simple `messages` table) has no typed protocol, no payload column for structured JSON, and no cross-database linking mechanism. Overstory uses `bead_id` as the foreign key across all its databases (sessions.db, mail.db, merge-queue.db). Mercury needs exactly this: a session-id or artifact-id that ties agent-forge/state.db records to mercury.db artifacts without creating circular dependencies.

4. **Git worktrees are the correct primitive for Mercury's strategy suite agents that modify files (Developer, Documentor, Backtester).** Three of the four strategy suite agents write files. A shared filesystem with no isolation means concurrent modifications produce merge conflicts and state corruption. The cost (disk: one working tree per agent, complexity: merge pipeline) is warranted for the Developer and Documentor agents specifically. The Researcher (read-only) and Supervisor (orchestrator) do not need worktrees.

5. **The four-tier capability hierarchy is unnecessary for Mercury but the lead/worker split is underused in Agent Forge.** Coordinator→supervisor→lead→worker is over-engineered for a four-agent suite. But Agent Forge's flat boss/worker model currently has no intermediate orchestrator tier. Mercury's workflow (Supervisor → Researcher + Developer + Backtester + Documentor in waves) maps well to Overstory's supervisor/lead→worker delegation pattern, not to a flat boss/worker model.

---

## agentmanager (kevinelliott) — Deep Analysis

### What agentmanager Actually Is

`kevinelliott/agentmanager` (binary: `agentmgr`) is a cross-platform CLI/TUI/library application for **detecting, managing, installing, and updating AI development CLI agents** across macOS, Linux, and Windows. It is architecturally equivalent to `homebrew` or `pyenv` — but for AI coding assistants.

It catalogs 47 AI agents: Claude Code, Gemini CLI, Aider, Amp, Goose, Plandex, Qwen Code, Agent Deck, OpenHands, DeepSeek CLI, Codex, and ~37 others. Each catalog entry defines:

```json
{
  "id": "claude-code",
  "name": "Claude Code",
  "executables": ["claude"],
  "version_cmd": "claude --version",
  "installation": [
    { "method": "npm", "command": "npm install -g @anthropic-ai/claude-code" },
    { "method": "native", "command": "..." }
  ],
  "changelog": { "source": "github-releases", "repo": "anthropic/claude-code" }
}
```

The `integrations.md` note — "gestione di agenti non via tmux, potrebbe essere utile se tmux è considerato fragile per un sistema tecnicamente completamente autonomo" — reflects a misreading of the repo's purpose. agentmanager manages which AI tools are *installed*, not how running instances are orchestrated.

### What agentmanager Does NOT Do

The following capabilities do NOT exist in agentmanager:

- Runtime process lifecycle management (no start/pause/resume/kill of running agents)
- Inter-agent communication of any kind
- Session state persistence for running agents
- Transport layer (no WebSockets, stdio, HTTP, or anything)
- Failure detection or recovery for running processes
- Agent definition formats for runtime behavior (YAML configs for task execution)

### The Storage Schema

agentmanager persists four concerns in SQLite:

| Table | Purpose |
|-------|---------|
| `installations` | Which agents are installed, at what version, via what method |
| `update_events` | History of update operations with status (pending/running/completed/failed/cancelled) |
| `catalog_cache` | Cached catalog JSON with etag for offline use |
| `detection_cache` | Cached detection results (installed executables, versions) |
| `settings` | Key-value configuration store |

This schema has no concept of agent sessions, tasks, messages, or orchestration.

### tmux vs agentmanager: Concrete Comparison Table

This comparison is not meaningful in the way the research brief assumed — agentmanager does not operate in the same problem space as tmux. The correct comparison is:

| Dimension | tmux (Agent Forge) | agentmanager |
|-----------|-------------------|-------------|
| **Problem domain** | Runtime session management and isolation | Package installation and version management |
| **Process lifecycle** | Creates/monitors/kills PTY processes | Installs/updates CLI binaries |
| **State tracked** | Session liveness, agent output, task assignment | Installed versions, update history |
| **Communication** | tmux send-keys, capture-pane | N/A |
| **Appropriate for** | Agent orchestration runtime | Initial system setup |
| **Replaces** | Nothing in the same domain | `brew install`, `npm install -g` |

### Verdict: What to Adopt from agentmanager

**Nothing directly.** agentmanager is useful as an *installation* primitive (bootstrapping a developer's machine with all AI CLI tools), not as an orchestration primitive. If Agent Forge v2.0 builds an "Agent Marketplace" (PRD section 9), agentmanager's catalog.json is a useful data source — the 47-agent catalog with installation methods, detection commands, and version checks would save significant implementation time.

**Recommended action**: Contact `kevinelliott/agentpipe` instead — the integrations.md references both, and agentpipe is likely the pipeline/orchestration repo that was intended to be compared here.

---

## Overstory — Deep Analysis of "Not Adopted" Features

### Git Worktrees for Isolation

#### How It Works

Overstory creates one git worktree per spawned worker agent. The worktree lives at `.overstory/worktrees/{agentName}/` in the project root. The `overstory sling` command executes:

```bash
git worktree add .overstory/worktrees/{agentName} overstory/{agentName}/{beadId}
```

This creates a fully independent working directory on a dedicated branch. Each agent's `CLAUDE.md` overlay explicitly states its worktree path and `FILE_SCOPE` — the exhaustive list of files it is allowed to modify. Hook-based guards (`PreToolUse`) block any write to paths outside the agent's worktree boundary.

When the agent completes, a `Merger` agent uses a four-tier conflict resolution pipeline (clean merge → auto-resolve → AI-resolve → reimagine from scratch) to integrate the branch back to main. A `merge-queue.db` enforces FIFO ordering so simultaneous agents don't race on the merge step.

The `resolveProjectRoot` function uses `git rev-parse --git-common-dir` to ensure all agents — whether operating from the worktree or the main repo — access the shared `.overstory/` databases centrally, not from within their isolated worktrees.

#### Benefits for Agent Forge / Mercury Strategy Suite

For Mercury, three of the four strategy suite agents produce file artifacts:

- **Developer**: generates analysis scripts, strategy code
- **Documentor**: modifies documentation repo
- **Backtester**: potentially writes result files, modified strategy scripts

Without worktree isolation, running these agents concurrently on the same filesystem creates genuine race conditions: the Developer and Documentor can both touch `strategy_v2.py` in the same working directory. This is not hypothetical — Mercury's workflow explicitly calls for Onda 1 to run Researcher and Documentor in parallel, then Onda 3 to run Backtester and Documentor in parallel again.

Worktrees solve this at the git level rather than through file-level locking, which is far more robust. The merge pipeline also provides a natural audit trail (one commit per agent deliverable).

An additional benefit specific to Mercury: if the Developer's session crashes mid-script, its worktree is intact and can be inspected or resumed. A shared filesystem crash during a multi-file write leaves the repo in an indeterminate state.

#### Costs and Complexity

- **Disk**: Each worktree is a full working-directory checkout (not a full `.git` clone — worktrees share the object store). For a typical Mercury codebase this is tens of MB per agent, tolerable.
- **Merge pipeline**: Overstory's tiered merger is ~500+ lines of non-trivial logic. The AI-resolve tier (Tier 3) can itself produce broken code, requiring Tier 4 reimplementation. This adds significant complexity and potential cost (LLM calls per conflict).
- **Branch management**: Each agent gets a branch (`overstory/{agentName}/{beadId}`). Orphaned branches accumulate and require cleanup (`overstory clean`).
- **Implementation overhead**: The hook-based file scope enforcement, worktree lifecycle management, and merge pipeline add approximately 2,000+ lines of infrastructure code.

#### Recommendation: Reconsider for Mercury

**Yes — partially.** The recommendation is NOT to adopt Overstory's full merge pipeline (too complex for Mercury's use case), but to adopt worktree isolation for the file-writing agents:

- **Developer and Documentor**: use worktrees, with manual or simple auto-merge back to main after each task completes (no AI-resolve tier needed — Mercury strategies are rarely concurrent writes to the exact same lines).
- **Backtester**: use worktrees if it writes result files to the repo.
- **Researcher**: no worktree needed — read-only MCP access to databases.
- **Supervisor**: no worktree needed — orchestrator only.

The FILE_SCOPE + hook guard pattern from Overstory is independently valuable: even without worktrees, declaring `FILE_SCOPE` in each agent's specialist YAML and enforcing it via Claude Code hooks prevents the Researcher from accidentally modifying code files.

---

### Typed SQLite Mail System

#### Exact Schema (Message Types, Data Model)

Overstory's mail system lives in `mail.db` (`.overstory/mail.db`). The schema:

```sql
CREATE TABLE messages (
  id         TEXT PRIMARY KEY,
  from_agent TEXT NOT NULL,
  to_agent   TEXT NOT NULL,           -- agent name or "orchestrator"
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'status'
             CHECK(type IN (
               -- Semantic types (human-readable communication):
               'status', 'question', 'result', 'error',
               -- Protocol types (trigger specific behaviors):
               'worker_done', 'merge_ready', 'merged', 'merge_failed',
               'escalation', 'health_check', 'dispatch', 'assign'
             )),
  priority   TEXT NOT NULL DEFAULT 'normal'
             CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  thread_id  TEXT,                    -- conversation threading
  payload    TEXT,                    -- JSON-encoded structured data
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_inbox ON messages (to_agent, read);
CREATE INDEX idx_thread ON messages (thread_id);

PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

The `payload` column carries machine-readable JSON for protocol messages. For example, a `worker_done` message includes `{ beadId, filesModified, branchName }` in payload while the `body` carries a human-readable summary for logging/debugging.

The `type` enum creates a clean separation between conversational messages (status, question, result, error) and coordination signals (worker_done, merge_ready, assign, escalation). Protocol messages can trigger an auto-nudge to the recipient's tmux session — a direct injection into the agent's stdin.

#### Comparison to Agent Forge's Current Message Bus

Agent Forge's `messages` table (from PRD section 3):

```sql
CREATE TABLE messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_session TEXT NOT NULL,
  to_session   TEXT NOT NULL,
  type         TEXT NOT NULL,    -- "task", "result", "status", "follow_up"
  content      TEXT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  read         BOOLEAN DEFAULT FALSE
);
```

Critical differences:

| Dimension | Agent Forge | Overstory |
|-----------|------------|-----------|
| **Type system** | 4 open strings ("task", "result", "status", "follow_up") | 12 constrained types with CHECK constraint |
| **Semantic vs protocol** | Not distinguished | Explicitly separated by type category |
| **Structured payload** | None — content is raw text | `payload TEXT` for JSON-encoded structured data |
| **Priority** | None | 4-level priority (low/normal/high/urgent) |
| **Threading** | None | `thread_id` for conversation threads |
| **Cross-DB linking** | None — to_session is tmux session ID | `bead_id` in payload ties to external issue tracker |
| **Auto-nudge** | Manual (caller uses tmux send-keys) | Protocol messages trigger automatic tmux nudge |
| **Indexes** | None specified in PRD | Explicit `idx_inbox` and `idx_thread` |

The Agent Forge `type` field is an open string with no enforcement — any value can be inserted. The `content` field is unstructured text. This means the Supervisor agent in Mercury has no way to programmatically distinguish a "Researcher finished" status update from a raw result dump without parsing free text, which is brittle.

#### Could It Solve Mercury's Dual-DB Reference Problem?

Yes, directly. The open question in `mercury-workflow.md` is: "Come si referenziano i due database quando la strategy suite spawna agenti via Agent Forge?" The current state: `agent-forge/state.db` tracks sessions by tmux session ID; `mercury.db` tracks artifacts by topic/source_type. They have no shared key.

Overstory's solution: the `bead_id` (task identifier) is the common key embedded in sessions.db records AND in mail.db message payloads. Every agent session knows its assigned task ID, and every message references that task ID in its payload.

For Mercury, the equivalent would be adding an `artifact_ref` or `task_ref` column to both Agent Forge's `messages` table and Mercury's `intel_artifacts` table. When the Researcher completes its work, it sends a `worker_done` message with `payload: { artifact_id: "intel_artifact_uuid", session_id: "af_session_uuid" }`. The Supervisor can then query `mercury.db` for that artifact by ID without any filesystem or tmux capture-pane intermediation.

This is more robust than the current implied design where the Supervisor reads tmux output and parses markdown headers (PRD mercury-workflow.md section 3.1: "il Supervisor riceve output strutturati tramite header markdown standard").

#### Recommendation: Reconsider

**Yes — adopt the typed mail pattern, not the full mail.db.** The specific improvements for Agent Forge's `messages` table:

1. Add `type` CHECK constraint with semantic/protocol categories
2. Add `payload TEXT` for structured JSON (artifact references, task IDs, bead IDs)
3. Add `priority TEXT` with CHECK constraint
4. Add `thread_id TEXT` for conversation threading
5. Add indexes on `(to_session, read)` and `(thread_id)`
6. Introduce `artifact_ref TEXT` — the shared key between agent-forge/state.db and mercury.db

This can be implemented as a migration to the existing `messages` table, not a full separate database.

---

### Watchdog Daemon

#### How It Works

Overstory's watchdog daemon (`src/watchdog/daemon.ts`) runs on a configurable interval (default: 30 seconds). For each non-completed session in sessions.db, it:

1. Checks tmux session liveness via `isSessionAlive(name)` — a ptmx call
2. Checks process PID liveness via `isProcessRunning(pid)` — checks `/proc/{pid}` or OS equivalent
3. Compares `last_activity` timestamp against `staleThresholdMs` (configurable)

The `evaluateHealth()` function returns one of four actions:

| Action | Condition | Response |
|--------|-----------|----------|
| `terminate` | tmux dead OR pid dead | Mark zombie, kill session |
| `investigate` | tmux alive but marked zombie in DB | Surface to operator (inconsistent state) |
| `escalate` | tmux alive, pid alive, but last_activity > staleThreshold | Progressive nudging |
| `none` | All healthy | No action, clear stalled_since if set |

The escalation progression for stalled (but alive) agents:

- **Level 0**: Log warning via `onHealthCheck` callback
- **Level 1**: Send tmux nudge (`tmux send-keys` with a prompt continuation hint)
- **Level 2** (if Tier 1 AI enabled): Invoke AI triage — a Claude Code session that reads the agent's recent output and classifies the failure type
- **Level 3**: Kill tmux session, mark zombie

`stalled_since` is set when escalation begins and cleared when the agent recovers. `escalation_level` (0-3) tracks the current stage. Each level requires `nudgeIntervalMs` (default: 60 seconds) to elapse before advancing.

The three-tier monitoring architecture:
- **Tier 0**: Watchdog daemon (mechanical, this section)
- **Tier 1**: AI triage (optional, invoked by Level 2 escalation)
- **Tier 2**: Monitor agent — a persistent Claude Code agent running `overstory watch` that performs continuous semantic patrol

The `doctor` command runs on-demand health checks including "3-way consistency validation": cross-references git worktrees, tmux sessions, and sessions.db entries. Any of the three can be out of sync.

#### Comparison to Agent Forge's Reconciliation Loop

Agent Forge's reconciliation loop (PRD section 3):

```
for each session in SQLite with status != completed/killed/error:
  if tmux session does not exist:
    mark as "zombie"
    notify user
```

This runs every 5 seconds and performs a single binary check: tmux session exists or does not exist.

| Dimension | Agent Forge | Overstory Watchdog |
|-----------|------------|-------------------|
| **Check interval** | 5 seconds | 30 seconds (configurable) |
| **Liveness check** | tmux session exists? | tmux alive AND pid alive |
| **Progress check** | None | `last_activity` timestamp staleness |
| **Dead agent response** | Mark zombie | Mark zombie |
| **Stalled agent response** | None — not detected | Progressive 4-level escalation |
| **AI triage** | None | Optional Tier 1 AI classification |
| **Consistency validation** | tmux vs SQLite | git worktrees + tmux + SQLite (3-way) |
| **State field** | `status` enum | `state` + `stalled_since` + `escalation_level` |

The fundamental gap: Agent Forge cannot detect a running-but-stuck agent. An agent that has an active tmux session and an active Claude Code process but has not produced output in 45 minutes is indistinguishable from a healthy working agent. For Mercury's strategy suite — where the Developer might run for hours — this is a critical blind spot.

#### Progress Detection (Not Just Liveness)

Overstory tracks `last_activity` which is updated by the hook system every time an agent executes a tool. This means activity is measured at the semantic level (tool calls) not at the process level (CPU usage). An agent that is "thinking" (waiting for LLM response) does not trip the stale threshold because Claude Code's internal API calls are not tool events. An agent that has completed its LLM response but failed to take any action — stuck in a loop, confused, or awaiting input — will eventually trip the threshold.

For Mercury, the circuit breaker concept in `mercury-workflow.md` section 2.0.1 describes exactly this problem: "se per N cicli consecutivi non viene rilevato alcun progresso — nessun artifact nuovo, nessun summary aggiornato — il circuit breaker passa a HALF_OPEN". The Overstory watchdog implements the mechanical layer under this circuit breaker pattern.

#### Recommendation: Adopt the Pattern

**Yes — adopt the stalled-agent detection pattern.** Specific recommendations:

1. Add `stalled_since DATETIME` and `escalation_level INTEGER DEFAULT 0` to Agent Forge's `sessions` table
2. Extend the reconciliation loop (or replace it with a separate watchdog process) to check `last_activity` against a configurable threshold (default: 10 minutes for Mercury, configurable per specialist)
3. Implement Level 1 escalation: tmux nudge (send Enter or a "continue" signal to the agent)
4. Defer Level 2 (AI triage) to v1.4.0 — it's a significant implementation and Mercury's circuit breaker in the front-agent partially covers it
5. The `last_activity` field should be updated by Claude Code's PostToolUse hook, not by the reconciliation loop itself

This does not require adopting the full watchdog daemon architecture. The existing 5-second reconciliation loop can be extended with the stalled-detection logic as a second phase.

---

### Capability Hierarchy (coordinator → supervisor → lead → worker)

#### Comparison to Boss/Worker

Overstory's three-tier hierarchy with six agent types:

- **Depth 0 (Orchestration)**: `coordinator` (strategic), `monitor` (patrol, no spawn rights)
- **Depth 1 (Tactical)**: `supervisor` (per-project team lead), `lead` (work-stream owner, Scout→Build→Verify lifecycle)
- **Depth 2 (Execution)**: `scout` (read-only exploration), `builder` (implementation), `reviewer` (validation, read-only), `merger` (integration specialist)

Enforcement is bidirectional: structural (`canSpawn: false` on depth-2 agents, depth limit in `slingCommand`) and semantic (CLAUDE.md overlays explicitly state spawning rights, file scope, and capability).

Agent Forge's boss/worker model is flat: a boss can spawn any worker, workers cannot spawn. There are no intermediate tiers and no per-capability constraints on what tools a worker can use.

| Dimension | Agent Forge | Overstory |
|-----------|------------|-----------|
| **Tiers** | 2 (boss/worker) | 3 (depth 0/1/2) |
| **Agent types** | Generic (role from profile.yaml) | 6 specialized types with distinct capabilities |
| **Spawn enforcement** | Honor system (boss doesn't spawn bosses) | Structural + hook enforcement |
| **File scope** | None | FILE_SCOPE per agent, hook-enforced |
| **Tool restrictions** | None | Capability-specific tool blocking (scout can't Write) |
| **Depth limit** | None | configurable maxDepth (default: 2) |

#### Fit for Mercury Strategy Suite

Mercury's strategy suite as described in `mercury-workflow.md`:

```
Supervisor (boss)
  |
  +-- Researcher (worker, read-only MCP access)
  +-- Developer (worker, write access to scripts)
  +-- Backtester (worker, write access to result files)
  +-- Documentor (worker, write access to docs repo)
```

This is structurally equivalent to Overstory's supervisor→worker pattern at depth 1→2. The coordinator tier (depth 0) is unnecessary — the user or the front-agent Claude session IS the coordinator. The lead agent (depth 1) maps exactly to Mercury's Supervisor.

The four Overstory depth-2 specializations (scout, builder, reviewer, merger) map imperfectly but usefully to Mercury's four specialists:
- Researcher ≈ scout (read-only exploration, produces a spec/artifact)
- Developer ≈ builder (implementation, read-write file scope)
- Backtester ≈ reviewer (validation with quantitative output, read-only on strategy code)
- Documentor ≈ builder variant (write access to docs repo)

The missing piece in Agent Forge for Mercury: tool-level enforcement. The Researcher has access to MCP tools for reading darth_feedor, but there is currently nothing preventing it from calling a write tool. This needs to be addressed.

#### Recommendation: Adopt Partially

**Adopt the FILE_SCOPE + tool restriction pattern from Overstory; do not adopt the full hierarchy.**

Mercury does not need coordinator→supervisor→lead→worker. It needs:
1. **FILE_SCOPE declarations** in each specialist's YAML: what files the agent is allowed to modify
2. **Tool restriction lists** in specialist YAML: which MCP servers and Claude Code tools are available
3. **canSpawn flag** in specialist YAML: Researcher and Backtester cannot spawn subagents; Developer can spawn a subagent for script generation

The `capabilities` field already exists in the specialist YAML schema (PRD section 10) but is marked "future". This should be promoted to P0 for Mercury.

Concretely, in the specialist YAML:

```yaml
capabilities:
  can_spawn: false
  file_scope:
    - mercury/strategies/
    - mercury/scripts/analysis/
  allowed_tools:
    - mercury-local
    - mmd-market-intelligence
  blocked_tools:
    - Write
    - Edit
    - NotebookEdit
```

These constraints should be enforced by Claude Code hooks deployed per-session when the specialist is spawned, following Overstory's hook deployment pattern.

---

### sling Command & CLAUDE.md Overlay

#### How It Works, What Problems It Solves

`overstory sling` is the worker spawn command. It performs these steps atomically:

1. **Validates hierarchy**: checks capability, depth, parent agent, maxDepth constraint
2. **Creates git worktree**: `git worktree add .overstory/worktrees/{name} overstory/{name}/{beadId}`
3. **Generates CLAUDE.md overlay**: reads `templates/overlay.md.tmpl` and substitutes 15+ variables including `AGENT_NAME`, `BEAD_ID`, `SPEC_PATH`, `WORKTREE_PATH`, `FILE_SCOPE`, `CAN_SPAWN`, `DEPTH`, `BASE_DEFINITION`, `MULCH_EXPERTISE`
4. **Writes CLAUDE.md to worktree**: at `.claude/CLAUDE.md` in the agent's working directory
5. **Deploys hooks**: writes `.claude/settings.local.json` with capability-specific hook guards (path boundary, bash danger guards, tool blocks)
6. **Creates tmux session**: with CWD set to worktree path and `OVERSTORY_AGENT_NAME` env var injected
7. **Records session in SessionStore**: initial state "booting"
8. **Sends initial task via tmux**: the spec file is passed by path reference, not by content injection

The CLAUDE.md overlay solves a problem Agent Forge has not formally addressed: agent identity and constraint enforcement at the cognitive level. When Claude Code launches in a tmux session, it reads `.claude/CLAUDE.md` from its working directory. By writing a custom CLAUDE.md to each agent's worktree before launching, Overstory ensures the agent's instructions are:
- Specific to its task (spec file path, bead ID)
- Bounded by its file scope
- Aware of its position in the hierarchy (depth, parent, canSpawn)
- Pre-loaded with relevant domain expertise (mulch domains)

This contrasts with Agent Forge's approach, where the system prompt is delivered via the initial `start_with_prompt` command. That prompt exists only in the agent's conversation history and is lost on session resume. CLAUDE.md persists across resumes.

**What this means for Mercury**: Mercury's specialist YAML already has `prompt.system` — a system prompt that should be delivered to the agent. But Agent Forge currently injects this via the command line (`gemini -p "[system prompt]\n\n[task]"`). This approach:
- Does not persist if the session dies and resumes
- Is limited by command-line argument length
- Is not visible to Claude Code's own hook system

Overstory's approach (write CLAUDE.md to the working directory before launch) solves all three issues. For Mercury's specialists, the `specialist.prompt.system` content should be written to a per-session CLAUDE.md in a session-specific working directory, not passed as a CLI argument.

---

## tmux Fragility Analysis

The PRD's design principle "tmux is infrastructure — don't reinvent the terminal, orchestrate it" holds for interactive, human-supervised workflows. For Mercury's long-running autonomous strategy suite, tmux has specific fragility points that require honest assessment.

### Strengths of tmux (Valid)

- **Terminal multiplexer is a proven primitive**: tmux has been stable for 15+ years. The binary itself does not crash. Session persistence across SSH disconnects is battle-tested.
- **Orthogonality**: If Agent Forge dies, the tmux sessions continue. `forge attach` can reconnect. This is a genuine advantage over process-based orchestration where the orchestrator's death kills all workers.
- **Human-inspectable**: You can `tmux attach -t af_claude_abc123` and see exactly what the agent is doing. No abstraction layer between the operator and the running process.
- **Zero dependency on Agent Forge for execution**: The agent runs Claude Code, not a wrapper. Agent Forge is purely a session manager, not an execution runtime. This means the agent's reliability is Claude Code's reliability, not tmux's.

### Fragility Points (Real)

**1. Status detection via regex on pane content is brittle**

The `wait-for-ready` loop captures the last 5 lines of `tmux capture-pane` output and matches against regex patterns (`"^>"`, `"Thinking"`, etc.). This is inherently fragile:
- Pattern changes with Claude Code updates break detection
- Multi-line output that extends beyond the scrollback window breaks capture
- An agent outputting a false positive pattern (e.g., markdown code block containing `">"`) trips the ready detection
- The 10,000-line scrollback buffer is unbounded from above (a long agent run generates MBs of capture data)

Overstory addressed this by moving away from headless mode (`claude -p`) toward interactive mode with hook-based detection: the PostToolUse hook updates `last_activity` in sessions.db. No regex needed. Agent Forge should consider the same approach: use Claude Code hooks to update session state in SQLite directly, reducing dependency on pane content parsing.

**2. System restart kills all tmux sessions**

This is the P2 open question in `mercury-workflow.md`: "Come si gestisce il ciclo di vita delle sessioni long-running della strategy suite attraverso riavvii del sistema?"

tmux sessions do not survive `systemd` restarts, server reboots, or `tmux kill-server`. After a system restart, all sessions are in zombie state. The reconciliation loop marks them zombie, and users must manually respawn.

Overstory's approach (spawn fresh, rebuild context from external state) is the only viable solution. For Mercury this means:
- Checkpoint.json (per-agent progress summary) must be implemented
- The Supervisor must be able to recover its wave execution state from a checkpoint
- Each specialist's `last_completed_artifact` must be queryable from mercury.db to know what was accomplished before the restart

**3. No progress detection — only liveness**

Covered in the watchdog section above. A critical gap for Mercury's multi-hour strategy suite runs.

**4. tmux capture-pane is a snapshot, not a stream**

`tmux capture-pane` captures the current screen state (visible pane content), not a stream of all output. Long-running agents that produce substantial output can overflow the scrollback buffer, losing earlier content. The `pipe-pane` approach (PRD: "Captured via `tmux pipe-pane` — continuous log of pane content") mitigates this for log purposes, but the real-time read still uses `capture-pane`.

**5. tmux send-keys has no acknowledgment**

When Agent Forge calls `tmux send-keys` to deliver a task to an agent, there is no confirmation that the input was received and parsed. The `wait-for-ready` + send pattern handles this partially (wait for ready state before sending), but the agent could become "ready" momentarily between sends and then immediately start processing, causing a race condition in multi-message sequences.

### Verdict on tmux as Runtime Primitive

**tmux is the right primitive for interactive, human-supervised orchestration.** For Mercury's long-running autonomous strategy suite, tmux is an acceptable primitive IF the following mitigations are implemented:

1. **Hook-based state updates** instead of regex pane capture for status detection
2. **Checkpoint system** for restart recovery
3. **Stalled-agent detection** (watchdog extension to the reconciliation loop)
4. **CLAUDE.md overlay per specialist** instead of CLI argument injection for system prompts

The alternative — a process-based orchestrator (Python subprocess, node child_process) — gives up tmux's orthogonality: if Agent Forge crashes, all agents die. For autonomous systems that need to survive orchestrator crashes, tmux's session persistence is not a weakness — it is the system's most critical resilience property.

---

## PRD Fragility Analysis

### Fragility 1: Regex-Based Status Detection (PRD Section 4, "Wait-for-Ready")

**Description**: The `waitForReady` function captures the last 5 lines of pane content and matches against `ready_patterns`, `busy_patterns`, and `error_patterns` defined in profile YAML. These are open-ended regex strings.

**Cited PRD Section**: Section 4 — "Wait-for-Ready" code block; `detection` field in all profile YAMLs.

**Specific risk for Mercury**: Claude Code's output format changes with updates. The `"^>"` pattern (ready indicator) is already wrong — Claude Code 1.x uses `>` as a prompt indicator but later versions use different prompts, especially in non-interactive contexts. When Claude Code is "thinking" between turns, the pane shows the spinner character (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`), which matches the busy pattern — but a completed response that ends with a spinner artifact (if output is truncated) will appear perpetually busy.

**Proposed fix**: Implement a hook-based state update mechanism as a complementary channel. Add a PostToolUse Claude Code hook that writes `{ "session_id": "$OVERSTORY_AGENT_NAME", "event": "tool_complete", "timestamp": "..." }` to Agent Forge's sessions SQLite. This gives the reconciliation loop a reliable signal that does not depend on pane content parsing. The regex approach can be retained as a fallback for agents without hook capability (Gemini, Qwen, GLM which do not support Claude Code hooks).

---

### Fragility 2: No Progress Detection — Only Liveness (PRD Section 3, "State Reconciliation")

**Description**: The reconciliation loop (every 5s) checks only whether the tmux session exists. Running-but-stuck agents are invisible to the system.

**Cited PRD Section**: Section 3 — "State Reconciliation" pseudocode; Section 9 v0.6.0 "Reconciliation loop (zombie detection)".

**Specific risk for Mercury**: The Developer or Researcher can enter an LLM reasoning loop (model returns a large context, agent tries to parse it, hits an internal limit, retries indefinitely) while showing as "working" in Agent Forge. The Supervisor has no mechanism to detect this. Without stalled-agent detection, Mercury's circuit breaker concept (mercury-workflow.md section 2.5) has no mechanical foundation — it relies entirely on the front-agent's cognition, which is unreliable.

**Proposed fix**: Add `stalled_since DATETIME` and `escalation_level INTEGER DEFAULT 0` to the sessions table. Extend the reconciliation loop to compare `updated_at` (or a new `last_tool_event` field updated by hooks) against a configurable `stale_threshold_ms` per specialist. Implement Level 1 escalation: send a continuation nudge via tmux. This is a v0.6.0 item in the roadmap but must be promoted to a Mercury P0.

---

### Fragility 3: No Structured Return Protocol Between Specialist Agents and Supervisor (PRD Section 4, "Message Types")

**Description**: The PRD's `messages.type` field is an open string with values "task", "result", "status", "follow_up". The content field is unstructured text. There is no protocol for a worker agent to signal completion with structured metadata (artifact IDs, file paths, error codes).

**Cited PRD Section**: Section 3 — `messages` table schema; Section 4 — "Send Protocol".

**Specific risk for Mercury**: `mercury-workflow.md` section 3.1 describes the Supervisor reading markdown headers (`## RESEARCH COMPLETE`, `## STRATEGY DEVELOPED`) from agent output to determine task completion. This means the Supervisor must:
1. Capture pane output (brittle — see Fragility 1)
2. Parse free text for a specific markdown pattern
3. Hope the pattern appears exactly once and is not a false positive

The open question in `mercury-workflow.md`: "Come si referenziano i due database quando la strategy suite spawna agenti via Agent Forge?" has no answer in the current PRD.

**Proposed fix**: Adopt a typed protocol for specialist completion signals. Add a `payload TEXT` column to the messages table. Define a `worker_done` message type with a structured payload:

```typescript
interface WorkerDonePayload {
  specialist_id: string;
  task_ref: string;          // links agent-forge session to mercury.db work
  artifact_ids: string[];    // UUIDs of artifacts written to mercury.db
  files_modified: string[];  // paths of files changed
  exit_status: 'success' | 'partial' | 'failed';
  error_message?: string;
}
```

The specialist sends this message (via `agent-forge send` or a direct SQLite insert via a hook) when it completes. The Supervisor polls the messages table for `worker_done` messages addressed to it, rather than parsing tmux pane output. This is the `bead_id`-as-foreign-key pattern from Overstory, adapted for Mercury.

---

### Fragility 4: System Prompt Delivery via CLI Argument (PRD Section 10, "Spawn Flow with Specialist")

**Description**: The PRD's spawn flow passes the specialist system prompt as part of the `start_with_prompt` command (`gemini -p "[system prompt]\n\n[task]"`). This is delivered once at session start and is not recoverable after session resume.

**Cited PRD Section**: Section 10 — "Spawn Flow with Specialist" diagram.

**Specific risk for Mercury**: Mercury's specialist system prompts are substantial (the mercury-db-health example in the PRD is ~200 words; a full Researcher specialist with trading domain knowledge could be 1,000+ words). Passing this via CLI argument has OS-level length limits (~2MB on Linux, but some shells limit to ~32KB). More critically, if the tmux session is killed and reconnected via `--resume`, the specialist's system prompt is gone from the context. The resumed session is a generic agent, not the specialist.

**Proposed fix**: Write `prompt.system` content to a per-session CLAUDE.md file in a working directory before spawning the agent. Follow Overstory's overlay pattern: create a session-scoped directory under `.agent-forge/sessions/{session-id}/`, write CLAUDE.md there with the specialist's full system prompt, and set the tmux session's working directory to that path. On resume, the CLAUDE.md is already in place — Claude Code reads it automatically on session start.

---

### P0 Gap: Workspace/Issues SQLite (mercury-workflow.md section 3.0)

**Description**: `mercury-workflow.md` explicitly identifies this as P0: "Workspace/Issues SQLite — memoria condivisa cross-specialist e cross-sessione, con tabelle `issues`, `comments`, `relations` per coordinazione asincrona; senza di essa ogni specialist opera in silos e non può riferirsi al lavoro di un collega da sessioni precedenti."

**What Overstory does**: Uses `bead_id` as the common key + mail.db for async messaging + mulch for domain expertise across sessions. There is no dedicated "issues" table, but `sessions.db.bead_id` plus the external Beads CLI provides the equivalent.

**What Mercury needs**: A SQLite table (in mercury.db, not agent-forge/state.db) that tracks cross-session work items:

```sql
CREATE TABLE issues (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',    -- open, in_progress, done, blocked
  assignee    TEXT,                            -- specialist_id
  session_ref TEXT,                            -- agent-forge session ID
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE issue_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id   TEXT NOT NULL REFERENCES issues(id),
  from_agent TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE issue_artifacts (
  issue_id    TEXT NOT NULL REFERENCES issues(id),
  artifact_id TEXT NOT NULL,                   -- intel_artifacts.id in mercury.db
  relation    TEXT NOT NULL DEFAULT 'output'   -- output, input, reference
);
```

This is accessible via the `mercury-local` MCP server — the same server that already manages mercury.db. No new infrastructure needed. The `session_ref` field is the shared key with agent-forge/state.db.

---

### P0 Gap: MCP Server for Specialist Invocation (mercury-workflow.md section 3.0)

**Description**: `mercury-workflow.md` identifies this as P0: "MCP server per l'invocazione dei specialist — astrae la lifecycle management invece di fare spawning diretto via tmux."

**What Overstory does**: No MCP server — uses `overstory sling` CLI commands that the coordinator/lead agent calls via Bash tool. The Bash tool in Claude Code can run any CLI command, so `overstory sling --capability builder --name strategy-dev --spec /path/to/spec.md` is a natural invocation.

**What Mercury needs**: An MCP tool like `spawn_specialist(specialist_id, task, context_artifact_ids)` that the Supervisor can call without knowing tmux session management details. This is a higher-level abstraction over `agent-forge spawn --specialist`.

The simplest implementation: a `mercury-orchestrator` MCP server that wraps `agent-forge` CLI commands and exposes them as MCP tools:
- `spawn_specialist(id, task, artifacts)` → calls `agent-forge spawn --specialist`
- `get_specialist_status(session_id)` → calls `agent-forge status`
- `read_specialist_output(session_id)` → calls `agent-forge read`
- `send_to_specialist(session_id, message)` → calls `agent-forge send`

This MCP server can be implemented with Bun/TypeScript using `@modelcontextprotocol/sdk` and run as a local process alongside `mercury-worker`. It transforms Agent Forge from a CLI tool Claude calls via Bash into a proper MCP-integrated orchestrator.

---

## Direct PRD Improvement Recommendations

The following are numbered, specific recommendations referencing PRD sections.

**1. PRD Section 3 — Add stalled-agent detection to the sessions table and reconciliation loop** (P0 for Mercury, v0.6.0)

Add `stalled_since DATETIME` and `escalation_level INTEGER DEFAULT 0` columns. Extend the reconciliation loop to detect agents where `updated_at` has not changed for `> stale_threshold_ms` (configurable per-specialist in specialist YAML, default 10 minutes). Implement Level 1 escalation: send a tmux nudge. Update `updated_at` via PostToolUse hook, not just via Agent Forge send operations.

**2. PRD Section 3 — Add `artifact_ref TEXT` and `payload TEXT` to the messages table** (P0 for Mercury, ship with v0.5.0)

`artifact_ref` provides the shared key between agent-forge/state.db and mercury.db. `payload TEXT` carries JSON-encoded structured completion data (artifact IDs, files modified, exit status). Add a CHECK constraint on `type` with semantic and protocol categories. Add `priority` with CHECK constraint. Add indexes on `(to_session, read)` and `thread_id`.

**3. PRD Section 10 — Write specialist system prompt to a session-scoped CLAUDE.md instead of passing as CLI argument** (P0 for Mercury, v0.4.0)

Before spawning an agent with a specialist, write the specialist's `prompt.system` content to `.agent-forge/sessions/{session-id}/.claude/CLAUDE.md`. Set the tmux session's working directory to `.agent-forge/sessions/{session-id}/`. On resume, CLAUDE.md is already in place. This makes specialists resilient to session death and eliminates CLI argument length limits.

**4. PRD Section 2 — Add FILE_SCOPE and blocked_tools to specialist YAML capabilities** (P1 for Mercury, v0.4.0)

Promote the `capabilities` field (currently "future") to active. Add `file_scope: []` (list of allowed paths) and `blocked_tools: []` (list of Claude Code tools to block). Deploy per-session Claude Code hooks that enforce these constraints via PreToolUse guards.

**5. PRD Section 3 — Implement checkpoint.json for session restart recovery** (P1 for Mercury, v0.6.0)

Write a `checkpoint.json` to `.agent-forge/sessions/{session-id}/checkpoint.json` after each wave completion. Content: `{ session_id, specialist_id, task_ref, completed_artifacts[], pending_work_description, last_active_at }`. On `agent-forge attach`, the reconciliation loop checks for sessions with zombie status that have checkpoints and offers to respawn them with the checkpoint as context.

**6. PRD Section 9 — Accelerate v1.4.0 Heartbeat System to Mercury v1.0** (P1)

Mercury's `mercury-workflow.md` describes the Documentor and the darth_feedor-watcher as agents that run on schedules. The heartbeat system (v1.4.0 in the PRD roadmap) provides exactly this. Given Mercury's requirements, this should not wait for v1.4.0 — implement a minimal heartbeat for specialist YAML that allows `interval: 30m` and `trigger: file_watch | schedule`. The Documentor specialist needs this to detect undocumented changes.

**7. PRD Section 11 (Research/Inspiration) — Add kevinelliott/agentpipe as a research target** (Information)

The `integrations.md` lists `kevinelliott/agentpipe` as a separate repo from `agentmanager`. This is likely the pipeline/orchestration comparison that was intended. Research agentpipe before finalizing the architectural decisions around wave execution and parallel agent management.

**8. PRD Section 4 — Add tmux-independent status channel via Claude Code hooks** (P1 for Mercury, v0.6.0)

Register a `PostToolUse` Claude Code hook on every agent session that calls `agent-forge session update {session_id} --event tool_complete`. This updates `sessions.updated_at` without requiring pane capture or regex parsing. Retain regex-based detection as fallback for non-Claude agents (Gemini, Qwen, GLM).

---

## Hybrid Architecture Proposal

The following describes what an improved Agent Forge would look like combining the best of all three approaches.

### Architecture Overview

```
+-----------------------------------------------------------+
|                  MERCURY TERMINAL                           |
|                                                             |
|  LAYER 5: Interface (Bun/TypeScript launcher)              |
|  +- Splash screen, session navigation                      |
|  +- Market data visualizations                             |
|  +- Status bar (tmux integration)                          |
|                                                             |
|  LAYER 4: UI (Agent Forge TUI + CLI)                        |
|  +- Fleet panel, Agent view, Messages panel                |
|  +- Registry panel (specialists, protocols, profiles)      |
|                                                             |
|  LAYER 3: Orchestration (Agent Forge enhanced)              |
|  +- Protocol Engine (YAML declarative workflows)           |
|  +- Typed Message Bus (Overstory-inspired typed mail)      |
|  +- Watchdog Loop (stalled-agent detection, 30s)          |
|  +- Checkpoint Manager (restart recovery)                  |
|                                                             |
|  LAYER 2: Execution (tmux + worktrees)                     |
|  +- tmux Manager (session CRUD, capture, send)             |
|  +- Worktree Manager (git worktrees for file-writers)      |
|  +- CLAUDE.md Overlay Generator (per-specialist)           |
|  +- Hook Deployer (FILE_SCOPE + tool restrictions)         |
|                                                             |
|  LAYER 1: Identity & Knowledge                              |
|  +- Specialist YAML (Brain: system prompt, file scope,     |
|  |                   tool restrictions, heartbeat config)  |
|  +- Agent Profiles (Body: start/resume/detect commands)    |
|                                                             |
|  LAYER 0: State (SQLite dual-DB with shared key)           |
|  +- agent-forge/state.db (liveness, sessions, messages)    |
|  +- mercury.db (cognitive context, artifacts, issues)      |
|  +- Shared key: task_ref / artifact_ref in messages.payload|
+-----------------------------------------------------------+
```

### Key Hybrid Design Decisions

**From Agent Forge (keep):**
- tmux as the execution primitive (orthogonality, human-inspectable, proven resilience)
- Declarative YAML protocols (unique value; nothing in Overstory or agentmanager has this)
- Specialist YAML Brain+Body architecture (extend, do not replace)
- boss/worker model (extend to include intermediate Supervisor tier for Mercury)
- SQLite with `better-sqlite3` (proven choice)
- TypeScript/Bun runtime

**From Overstory (adopt):**
- Typed message bus with CHECK-constrained type enum and `payload TEXT` column
- `bead_id`/`task_ref` as the shared foreign key across databases
- Stalled-agent detection (`stalled_since` + `escalation_level` + progressive escalation)
- CLAUDE.md overlay written to session working directory (instead of CLI argument injection)
- FILE_SCOPE + tool restriction enforcement via Claude Code hooks
- Git worktrees for file-writing agents (Developer, Documentor in Mercury strategy suite)
- Checkpoint.json for restart recovery

**From agentmanager (defer):**
- catalog.json data as seed for Agent Forge v2.0 Agent Marketplace
- No runtime architectural components relevant to current scope

**New for Mercury (not in either reference):**
- `mercury-orchestrator` MCP server wrapping Agent Forge CLI for specialist invocation
- Workspace/Issues SQLite tables in mercury.db (cross-specialist coordination memory)
- Wave execution model (Supervisor builds dependency graph, executes in waves)
- Per-specialist `stale_threshold_ms` in specialist YAML

### The Dual-DB Reference Solution

The concrete answer to `mercury-workflow.md`'s open question "Come si referenziano i due database?":

```
agent-forge/state.db:
  sessions.id = "af_sess_abc123"          (Agent Forge session UUID)

agent-forge/state.db:
  messages {
    from_session: "af_sess_abc123",
    to_session:   "af_sess_supervisor",
    type:         "worker_done",           (typed protocol message)
    payload:      {
      "task_ref":     "strat_task_001",    (shared key)
      "artifact_ids": ["art_uuid_001"],    (references mercury.db)
      "session_id":   "af_sess_abc123",   (references state.db)
      "exit_status":  "success"
    }
  }

mercury.db:
  intel_artifacts {
    id:        "art_uuid_001",             (referenced by payload.artifact_ids)
    task_ref:  "strat_task_001",           (shared key — add this column)
    ...
  }

mercury.db:
  issues {
    id:          "strat_task_001",         (the shared key itself)
    session_ref: "af_sess_abc123",         (references state.db)
    status:      "done",
    ...
  }
```

The `task_ref` is the `issues.id` from mercury.db. It is stored in `sessions.task` (already exists in PRD schema), embedded in `messages.payload`, and added as a column to `intel_artifacts`. No circular dependency. No join across databases needed — each database has enough information to query the other by this key.

---

## Sources & Files Read

### Local Files

- `/home/jagger/projects/agent-forge/docs/PRD.md` — Agent Forge PRD v1.1.0 (full)
- `/home/jagger/projects/agent-forge/docs/mercury-system-details.md` — Mercury Terminal interface spec
- `/home/jagger/projects/agent-forge/docs/mercury-workflow.md` — Mercury workflow, strategy suite, P0 gaps
- `/home/jagger/projects/agent-forge/docs/integrations.md` — Integration targets list with repo URLs

### GitHub URLs Fetched

- `https://github.com/kevinelliott/agentmanager` — repository overview (Go, CLI/TUI, package manager)
- `https://raw.githubusercontent.com/kevinelliott/agentmanager/main/README.md` — full README (package management focus confirmed)
- `https://raw.githubusercontent.com/kevinelliott/agentmanager/main/catalog.json` — 47-agent catalog with installation methods
- `https://github.com/kevinelliott/agentpipe` — orchestration platform (multi-agent conversation rooms)

### Deepwiki Queries (jayminwest/overstory)

- Wiki structure and page index
- Git worktrees: implementation, directory structure, commands, benefits, costs
- SQLite mail system: exact schema, message type enum, indexes, WAL configuration
- Watchdog daemon: monitoring intervals, escalation levels, ZFC principle, three-tier architecture
- Capability hierarchy: depth levels, agent types, canSpawn enforcement, delegation rules
- sling command: CLAUDE.md overlay generation, hook deployment, tmux session creation
- Sessions.db schema: all columns in sessions and runs tables, stalled_since mechanics
- Cross-agent shared memory: database relationships, MCP integration (absent), session persistence
- Merge system: merge queue schema, four-tier conflict resolution (clean→auto→AI→reimagine)
- Hook system: path boundary guards, capability guards, bash danger guards, tool event tracking
- Mulch system: structured expertise management, prime/record pattern, session-end auto-recording
- Session restart recovery: checkpoint.json format, coordinator restart behavior, context reconstruction
- Beads system: external issue tracker integration, bead_id as cross-DB foreign key

---

## CHALLENGE RUN

**Date**: 2026-02-27
**Challenge Agent**: Adversarial Research Session
**Scope**: Critical verification of Agent 4's findings using deepwiki.com

---

### agentmanager — Dismissal Confirmed or Revisited?

**VERDICT: Dismissal CONFIRMED, but agentpipe clarification needed**

The original report correctly identified `kevinelliott/agentmanager` as a **package manager** (equivalent to `brew` or `npm install -g`) for AI CLI tools, not a runtime orchestrator. Deepwiki could not index the repo (404), but web search and GitHub fetch confirmed:

**agentmanager capabilities:**
- Detects, installs, updates, and version-manages 47 AI CLI agents (Claude Code, Gemini, Aider, Qwen Code, etc.)
- Persists: installations, update_events, catalog_cache, detection_cache, settings
- **NO** runtime process lifecycle management
- **NO** inter-agent communication
- **NO** session state or tmux integration

**However**, the original report correctly noted `kevinelliott/agentpipe` as the intended comparison. Web fetch on agentpipe reveals it **does** provide:
- Runtime orchestration with 3 modes: round-robin, reactive, free-form
- Process management with lifecycle, timeout, rate limiting
- Inter-agent communication via shared "rooms"
- Session management with save/resume, export, conversation history

**Challenge outcome**: The agentmanager dismissal stands (it's infrastructure bootstrapping, not orchestration). The original report's recommendation to research agentpipe instead was correct — agentpipe is the actual multi-agent orchestration competitor/comparator for Agent Forge's tmux-based approach.

**Net new insight**: Agent 4's report mentioned agentpipe in passing but didn't deeply analyze it. For Mercury's wave execution model (Supervisor → multiple specialists in parallel/sequence), agentpipe's "rooms" concept and round-robin/reactive modes are directly relevant architectural prior art.

---

### CLAUDE.md Overlay — Conflict Resolution Analysis

**VERDICT: Original report incomplete — Overstory uses OVERWRITE, not merge**

The original report recommended Overstory's CLAUDE.md overlay approach but **did not address conflict resolution**. Deepwiki verification reveals:

**Overstory's actual approach:**
- Agent-specific CLAUDE.md is written to the agent's **isolated worktree** (`.overstory/worktrees/{agentName}/.claude/CLAUDE.md`)
- The project root's `.claude/CLAUDE.md` (user/orchestrator instructions) is **never overwritten** — `writeOverlay` throws `AgentError` if attempt detected
- `isCanonicalRoot` function guards against accidental root overwrites
- **No merge strategy exists** — the worktree CLAUDE.md completely replaces any base definition for that agent's context

**For Agent Forge's 3-scope specialist system:**

| Scope | Current | CLAUDE.md Overlay Interaction |
|-------|---------|-------------------------------|
| **System** (`~/.agent-forge/specialists/`) | Global specialist definitions | Would write to session-scoped work directory; no conflict (isolated per session) |
| **User** (`~/.agent-forge/profiles/`) | User-level agent profiles | Not addressed by Overstory pattern; would need separate mechanism |
| **Project** (`.agent-forge/`) | Project-specific overrides | Would be the "base definition" injected into overlay template |

**Critical gap identified**: Overstory's approach works because each agent has a **dedicated worktree**. Agent Forge currently has no per-session working directory concept. Implementing CLAUDE.md overlay would require:
1. Creating `.agent-forge/sessions/{session-id}/` directory per session
2. Writing CLAUDE.md there before spawn
3. Setting tmux session CWD to that directory
4. On resume, CLAUDE.md is already in place

**Challenge outcome**: The original report's recommendation is valid but under-specified. Conflict resolution is handled via **isolation** (worktree per agent), not merge. For Agent Forge without worktrees, a session-scoped directory achieves the same isolation.

---

### Git Worktrees — Complexity vs Value Assessment

**VERDICT: Original report overstates value for Mercury; complexity understated**

The original report said worktrees are "warranted" for Mercury's Developer, Documentor, and Backtester agents. Deepwiki verification reveals:

**Actual implementation complexity:**
- **~426 lines of code** across 4 files:
  - `src/worktree/manager.ts`: 137 lines (createWorktree, listWorktrees, removeWorktree)
  - `src/commands/worktree.ts`: 260 lines (CLI interface, argument parsing, output formatting)
  - `src/commands/clean.ts`: 18 lines (cleanAllWorktrees)
  - `src/commands/sling.ts`: 11 lines (worktree creation + error handling)
- **Edge cases handled**:
  - Duplicate worktree prevention (throws `WorktreeError`)
  - Orphaned worktree detection (`overstory doctor` consistency check)
  - Force removal with untracked files (`git worktree remove --force` for `.claude/` hooks)
  - Unmerged branch deletion (`git branch -D`)
  - SessionStore unavailability fallback
  - Error during overlay generation → cleanup

**Merge pipeline complexity** (separate from worktree management):
- 4-tier conflict resolution: clean merge → auto-resolve → AI-resolve → reimagine
- Merger agent: ~500+ lines
- Merge queue: SQLite-backed FIFO ordering
- Verification: runs `bun test`, `bun run lint`, `bun run typecheck`

**For Agent Forge specifically:**

| Concern | Overstory | Agent Forge / Mercury |
|---------|-----------|----------------------|
| **Git repo required?** | Yes — all operations assume git repo | **Critical gap**: What if Agent Forge used outside git context? |
| **Disk cost** | Tens of MB per worktree (shared object store) | Same |
| **Merge complexity** | 4-tier AI pipeline (overkill for Mercury) | Manual or simple auto-merge sufficient |
| **Branch management** | `overstory/{agentName}/{beadId}` per agent | Would need equivalent |

**Challenge outcome**: The original report's recommendation is **partially correct but premature**:

1. **Worktrees for v1.0? NO** — Agent Forge PRD doesn't mention git worktrees at all. Adding worktree support requires:
   - Git repo detection/enforcement (breaks non-git use cases)
   - ~400+ lines of worktree management code
   - Branch lifecycle management
   - Merge pipeline (even if simplified)

2. **Alternative for Mercury v1.0**: Use **session-scoped directories** (`.agent-forge/sessions/{session-id}/`) without git worktrees. This provides:
   - CLAUDE.md overlay support
   - Per-session isolation for prompts/hooks
   - No git dependency
   - File-level locking if needed (via hooks)

3. **Worktrees as v2.x feature**: Promote to v2.0 when Agent Forge adds:
   - Multi-user concurrent execution
   - True parallel specialist runs with file conflicts
   - Automated merge pipeline

**Recommendation revised**: Defer worktrees to v2.0. For Mercury v1.0, implement session-scoped directories only.

---

### Typed Mail bead_id — Right Solution for Mercury?

**VERDICT: Original report INCORRECT — bead_id is NOT in mail.db; MCP alternative may be simpler**

The original report claimed Overstory's `bead_id` cross-DB foreign key "directly solves Mercury's dual-DB problem." Deepwiki verification reveals:

**Actual mail.db schema:**
```sql
CREATE TABLE messages (
  id         TEXT PRIMARY KEY,           -- generated as "msg-" + 12-char random
  from_agent TEXT NOT NULL,
  to_agent   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'status'
             CHECK(type IN ('status','question','result','error',
                           'worker_done','merge_ready','merged','merge_failed',
                           'escalation','health_check','dispatch','assign')),
  priority   TEXT NOT NULL DEFAULT 'normal'
             CHECK(priority IN ('low','normal','high','urgent')),
  thread_id  TEXT,
  payload    TEXT,                       -- JSON-encoded structured data
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_inbox ON messages (to_agent, read);
CREATE INDEX idx_thread ON messages (thread_id);

PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

**Critical finding**: `bead_id` is **NOT in mail.db**. It exists in:
- `sessions.db` → `sessions.bead_id`
- `metrics.db` → `sessions.bead_id`

**How bead_id is generated**: Managed by **external `bd` (beads CLI) tool** — an external issue tracker. Overstory does not generate bead_id internally; it references issues managed by `bd`.

**For Mercury's dual-DB problem:**

Mercury has:
- `agent-forge/state.db` (liveness, sessions, messages)
- `mercury.db` (intel_artifacts, issues, work tracking)

The original report suggested adopting `bead_id` as shared key. But:

1. **Atomic generation problem**: Overstory sidesteps this by using an **external** issue tracker (`bd`). Mercury would need:
   - Either: External issue tracker (overkill)
   - Or: One DB generates IDs, other DB trusts them (no atomic guarantee)

2. **Failure mode**: If `bead_id` references an artifact in `mercury.db` that was deleted/compressed:
   - Overstory has no foreign key constraints (SQLite doesn't enforce cross-DB FK)
   - Dangling references are possible; no automatic cleanup

3. **MCP alternative comparison**:

| Approach | bead_id (Overstory) | MCP Call |
|----------|---------------------|----------|
| **Implementation** | Add `artifact_ref TEXT` to messages.payload; trust external ID | HTTP/MCP call from agent-forge → mercury-local MCP server |
| **Atomicity** | None (external ID generation) | MCP server can atomically write to both DBs |
| **Failure mode** | Dangling references if artifact deleted | MCP server handles cleanup/invalidation |
| **Complexity** | Low (schema change only) | Medium (new MCP server) |
| **Coupling** | Loose (shared key only) | Tight (MCP server knows both schemas) |

**Challenge outcome**: The original report's recommendation is **partially correct but oversimplified**:

- **Adopt `payload TEXT` column**: Yes — this is universally useful for structured data
- **Adopt typed `type` enum**: Yes — CHECK constraint improves protocol clarity
- **Adopt `bead_id` pattern**: **NO** — Mercury doesn't have an external issue tracker; MCP alternative is cleaner

**Recommended solution for Mercury**:
```typescript
// In agent-forge/state.db messages table:
messages.payload = JSON.stringify({
  artifact_ids: ["art_uuid_001"],  // References mercury.db:intel_artifacts.id
  task_ref: "strat_task_001"       // References mercury.db:issues.id
});

// Supervisor polls messages table, then queries mercury.db directly:
SELECT * FROM mercury.db.intel_artifacts WHERE id IN (payload.artifact_ids);
```

No bead_id needed. No external issue tracker. Simple shared UUID references.

---

### Watchdog stalled_since — Mechanism Verified

**VERDICT: Original report CORRECT on mechanism, but "thinking vs stalled" distinction unclear**

The original report said Overstory's watchdog tracks `stalled_since` via PostToolUse hooks. Deepwiki verification reveals:

**Actual implementation:**

1. **Detection mechanism**: Polling, NOT direct hook calls
   - Watchdog daemon runs every `config.watchdog.tier0IntervalMs` (default: 30 seconds)
   - Queries `SessionStore` for all active sessions
   - Checks `lastActivity` timestamp for each session

2. **How `lastActivity` is updated**:
   - `log.ts` updates `lastActivity` on `tool-start` and `tool-end` events
   - These events are triggered by **PostToolUse hooks** (indirect hook update)
   - So: Hooks → log.ts → lastActivity → watchdog polling

3. **Stalled vs thinking distinction**:
   - `staleThresholdMs`: Agent considered "stalled" if `elapsedMs > staleThresholdMs` since lastActivity
   - `zombieThresholdMs`: Agent considered "zombie" if `elapsedMs > zombieThresholdMs`
   - **Persistent capabilities exemption**: Agents with `coordinator` or `monitor` capabilities are **exempt from time-based staleness** — they're expected to have long idle periods
   - Only tmux/process liveness checked for exempt agents

4. **Escalation levels**:
   - Level 0: Warn (log only)
   - Level 1: Nudge (tmux send-keys with continuation hint)
   - Level 2: Escalate (AI triage if Tier 1 enabled)
   - Level 3: Terminate (kill tmux, mark zombie)

**For Agent Forge's 5s reconciliation loop:**

| Dimension | Overstory Watchdog | Agent Forge Reconciliation |
|-----------|-------------------|---------------------------|
| **Interval** | 30 seconds (configurable) | 5 seconds |
| **Detection** | Polls lastActivity timestamp | Checks tmux session existence only |
| **Stalled detection** | Yes (time-based) | No |
| **Thinking vs stalled** | Exempts coordinator/monitor capabilities | Not distinguished |

**Challenge outcome**: The original report is **correct** but missing critical nuance:

1. **5s interval is adequate** — Agent Forge's 5s loop is more frequent than Overstory's 30s. The question isn't interval; it's **what to check**. Adding `lastActivity` timestamp check to the 5s loop is trivial.

2. **"Thinking vs stalled" for Mercury**:
   - **Backtester** running long calculations with no tool calls: Would trip staleness threshold incorrectly
   - **Solution**: Add `capabilities.can_go_idle: true` to specialist YAML for agents that legitimately stall
   - Alternatively: Per-specialist `stale_threshold_ms` override (e.g., Backtester: 30 minutes, Researcher: 10 minutes)

3. **Implementation path**:
   ```sql
   ALTER TABLE sessions ADD COLUMN last_activity DATETIME DEFAULT CURRENT_TIMESTAMP;
   ALTER TABLE sessions ADD COLUMN stalled_since DATETIME;
   ALTER TABLE sessions ADD COLUMN escalation_level INTEGER DEFAULT 0;
   ```
   
   Update `last_activity` via:
   - Claude Code PostToolUse hook (writes to SQLite directly)
   - Agent Forge `send` command (already updates `updated_at`)

**Recommendation confirmed**: Adopt stalled-agent detection pattern. Add per-specialist `stale_threshold_ms` override in specialist YAML.

---

### Missing Research

**The original Agent 4 report did NOT cover:**

1. **Agent capabilities/permissions enforcement**:
   - Overstory has 7 capabilities: scout, builder, reviewer, lead, merger, coordinator, supervisor
   - **PreToolUse hooks** enforce:
     - Path boundary guards (Write/Edit confined to worktree)
     - Capability-specific tool blocks (scout/reviewer can't Write)
     - Danger guards (no `git push`, `git reset --hard`)
     - Native team tool blocks (no `Task`, `TeamCreate`)
   - **For Agent Forge**: Specialist YAML already has `capabilities` field marked "future". This should be P0 for Mercury, not P1.

2. **Token budget management**:
   - Overstory tracks: inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, estimatedCostUsd per session
   - Stored in `metrics.db` via `MetricsStore`
   - **No hard budget limits** — only cost-awareness guidelines in agent definitions
   - `overstory costs --live` shows real-time token usage
   - **For Mercury**: Not critical for v1.0 (4 specialists, user-supervised), but P1 for autonomous operation

3. **Context handoff mechanism**:
   - Overstory uses **checkpoint.json** for coordinator/supervisor recovery
   - Saved to `.overstory/agents/coordinator/checkpoint.json`
   - Content: `{ agentName, beadId, sessionId, progressSummary, filesModified, branch, pendingWork, mulchDomains }`
   - Recovery: Read checkpoint + `overstory group status` + `overstory status` + `overstory mail check` + `bd ready` + `mulch prime`
   - **Handoff orchestration**: `handoffs.json` tracks session transitions (compaction, crash, manual, timeout)
   - **For Mercury**: Directly applicable to Supervisor restart recovery across system reboots (identified as P0 gap in mercury-workflow.md)

---

### Net New Findings

1. **agentpipe (not agentmanager) is the orchestration comparator**:
   - Agentpipe provides: multi-agent "rooms", round-robin/reactive/free-form modes, process lifecycle, conversation save/resume
   - **Relevance to Mercury**: Agentpipe's "rooms" concept is analogous to Mercury's wave execution (parallel specialists on same topic)
   - **Recommendation**: Research agentpipe's turn-taking and message filtering for Mercury's Supervisor → specialist communication

2. **Overstory's CLAUDE.md uses OVERWRITE, not merge**:
   - Worktree isolation prevents conflicts; no merge strategy exists
   - **For Agent Forge**: Session-scoped directories achieve same isolation without git worktrees

3. **bead_id is external to Overstory**:
   - Managed by `bd` (beads CLI) — an external issue tracker
   - **For Mercury**: Don't adopt bead_id; use simple UUID references + MCP server for atomic cross-DB operations

4. **Watchdog polling interval (30s) vs Agent Forge (5s)**:
   - 5s is adequate; the gap is **what** to check, not how often
   - Add `last_activity` timestamp check to existing loop

5. **Capability enforcement via PreToolUse hooks**:
   - Overstory deploys hooks to `.claude/settings.local.json` per worktree
   - **For Agent Forge**: Specialist YAML `capabilities` field should include:
     ```yaml
     capabilities:
       can_spawn: false
       file_scope:
         - mercury/strategies/
       allowed_tools:
         - mercury-local
       blocked_tools:
         - Write
         - Edit
     ```

6. **Checkpoint-based restart recovery**:
   - Overstory's checkpoint.json is directly applicable to Mercury's system restart problem
   - **Implementation**: Write checkpoint after each wave completion; read on `agent-forge attach --resume`
