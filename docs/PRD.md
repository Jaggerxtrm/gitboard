# Agent Forge — Product Requirements Document

**Date**: 2026-02-27
**Status**: Approved
**Version**: 1.2.0

## 1. Identity & Core Concept

**Name**: Agent Forge
**One-liner**: A CLI/TUI orchestrator for AI agents using tmux as execution layer, declarative protocols for communication, and a boss/worker model for coordination.

**Product type**: Standalone CLI/TUI tool, distributed via npm, built with TypeScript/Bun.

**Replaces**: Agent Deck (session management), evolves delegating + orchestrating-agents skills into protocol definitions.

### Mental Model

```
+---------------------------------------------------+
|                  AGENT FORGE                        |
|                                                     |
|  LAYER 4: UI (optional)                             |
|  +- TUI Dashboard  (Ink)                            |
|  +- CLI commands   (headless)                       |
|  +- Registry Browser (specialists/protocols/etc.)   |
|  +- tmux status-bar (always-on indicator)           |
|                                                     |
|  LAYER 3: Orchestration                             |
|  +- Protocol Engine  (workflow turn definitions)    |
|  +- Routing Engine   (pattern -> agent/protocol)    |
|  +- Message Bus      (pi events + SQLite)            |
|                                                     |
|  LAYER 2: Execution                                 |
|  +- Session Store    (who is running, state)        |
|  +- Pi Pool          (RpcClient per agent, JSON RPC)|
|  +- af_claude, af_gemini, af_qwen, af_glm          |
|                                                     |
|  LAYER 1: Identity & Knowledge                      |
|  +- Agent Profiles   (Body: how to start/resume)    |
|  +- Specialist Defs  (Brain: .specialist.yaml)      |
|  +- Agent Registry   (profile + specialist loader)  |
+---------------------------------------------------+
```

### Design Principles

1. **Headless-first**: Every operation works via CLI. The TUI is a bonus.
2. **tmux as daemon host**: Forge runs as a daemon inside a tmux session; pi instances are child processes. If the terminal closes, the daemon continues.
3. **Declarative protocols**: Workflows (collaborative, adversarial, etc.) are defined in YAML, not hardcoded.
4. **Agent-agnostic**: A profile YAML defines which pi provider to use for any agent.
5. **Resilience**: If the forge process crashes, pi sessions are checkpointed in SQLite (`piSessionFile`). `forge attach` relaunches pi and recovers sessions via `switch_session`.
6. **Brain + Body**: Profiles define the Body (which provider/model), Specialists define the Brain (what an agent knows). Both are YAML, both are composable.
7. **Universal deployment**: Configuration, not detection. A single `tmux.socket_path` setting (default: `~/.tmux/agent-forge`) works identically on WSL2, containers, and Linux servers — no OS branch logic.

---

## 2. Agent Registry & Profiles

Every agent is defined by a profile. Built-in profiles for Claude, Gemini, Qwen, CCS-GLM. Users can add custom profiles.

### Profile Schema

```yaml
# profiles/claude.yaml
id: claude
name: "Claude Code"
role: boss                  # boss | worker | hybrid
provider: anthropic         # pi provider identifier
model: claude-sonnet-4-6    # opzionale — usa default del provider se assente
```

```yaml
# profiles/gemini.yaml
id: gemini
name: "Gemini CLI"
role: worker
provider: google-gemini-cli
model: gemini-2.5-pro       # opzionale
```

```yaml
# profiles/qwen.yaml
id: qwen
name: "Qwen CLI"
role: worker
provider: openai            # openai-compatible via DashScope
model: qwen-coder-plus-latest
```

```yaml
# profiles/ccs-glm.yaml
id: ccs-glm
name: "CCS GLM-4"
role: worker
provider: openai            # openai-compatible via GLM endpoint
model: glm-4
```

Le sezioni `commands.*`, `detection.*`, e `tmux.*` sono eliminate. Il comportamento (spawn, resume, polling, timeout) è gestito interamente da pi (`RpcClient`). La "readiness" è implicita: pi è sempre pronto a ricevere prompt dopo `start()`.

### Profile Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier used in CLI commands |
| `name` | Human-readable display name |
| `role` | `boss` (orchestrator), `worker` (executes tasks), `hybrid` (both) |
| `provider` | Pi provider identifier (e.g. `anthropic`, `google-gemini-cli`, `openai`) |
| `model` | Model ID opzionale — usa il default del provider se assente |

I campi `commands.*`, `detection.*`, `env`, `output_format`, e `tmux.*` sono rimossi: la gestione del lifecycle dell'agente (spawn, resume, status, timeout, abort) è delegata interamente a `RpcClient` di pi.

### Custom Profiles

```bash
agent-forge profile add --name "codex" --start "codex" --prompt-flag "-p"
# Generates profiles/codex.yaml with template and detection defaults

agent-forge profile test gemini  # Verify agent works
agent-forge profile list         # List all profiles
agent-forge profile show gemini  # Show profile details
```

---

## 3. Session Management & State

### Session Lifecycle

```
created -> booting -> ready -> working -> idle -> (working -> idle)* -> completed
                                                                     -> error
                                                                     -> killed
                                   zombie <- (tmux session died unexpectedly)
                                  stalled <- (no last_activity progress > threshold)
                         waiting_for_input <- (interaction_pattern detected in pane)
```

### Session Store (SQLite)

```sql
CREATE TABLE sessions (
  id               TEXT PRIMARY KEY,      -- uuid
  agent_id         TEXT NOT NULL,         -- "claude", "gemini", etc.
  specialist_id    TEXT,                  -- "mercury-db-health" (null if no specialist)
  role             TEXT NOT NULL,         -- "boss", "worker"
  tmux_session     TEXT NOT NULL,         -- "af_claude_abc123"
  status           TEXT NOT NULL,         -- lifecycle state
  task             TEXT,                  -- what was this agent asked to do
  parent_id        TEXT,                  -- who spawned this agent (null for boss)
  started_at       DATETIME,
  updated_at       DATETIME,
  ended_at         DATETIME,
  last_activity    DATETIME,             -- updated by PostToolUse hook; used for stall detection
  stalled_since    DATETIME,             -- set when progress stops; cleared on activity
  escalation_level INTEGER DEFAULT 0,   -- 0=ok 1=nudged 2=needs-attention 3=terminate
  exit_reason      TEXT,                 -- "completed", "killed", "error", "zombie"
  log_file         TEXT                  -- path to output log
);

CREATE TABLE messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_session  TEXT NOT NULL,
  to_session    TEXT NOT NULL,
  type          TEXT NOT NULL CHECK(type IN (
                  -- Semantic: human-readable exchanges
                  'task', 'result', 'status', 'follow_up',
                  -- Protocol: trigger specific orchestrator behaviors
                  'worker_done', 'spawn_request', 'escalation', 'health_check'
                )),
  content       TEXT NOT NULL,
  payload       TEXT,                  -- JSON structured data (artifact refs, AF_STATUS, exit codes)
  priority      TEXT NOT NULL DEFAULT 'normal'
                  CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  thread_id     TEXT,                  -- groups related messages (e.g., a full protocol run)
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  read          BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_inbox    ON messages (to_session, read);
CREATE INDEX idx_thread   ON messages (thread_id);
CREATE INDEX idx_priority ON messages (priority, created_at);
```

### State Reconciliation

1. **tmux is truth for liveness** — if the tmux session doesn't exist, the agent is dead.
2. **SQLite is truth for semantics** — assigned task, messages, parent/child relationships.
3. **Reconciliation loop** (every 5s):
   ```
   Phase 1 — Liveness check:
   for each session with status not in (completed, killed, error, zombie):
     if tmux session does not exist:
       mark zombie, send escalation message to parent

   Phase 2 — Progress check (working sessions only):
   for each session with status = working:
     threshold = specialist.stale_threshold_ms ?? 600_000  (default: 10 min)
     if now - last_activity > threshold:
       if stalled_since is null:
         set stalled_since = now, escalation_level = 0
       escalation_level += 1
       if escalation_level == 1: tmux send-keys "" (gentle nudge)
       if escalation_level >= 2: set status = stalled, notify parent session
     else:
       clear stalled_since, escalation_level = 0

   Phase 3 — Interaction check:
   for each session with status = working:
     if pane content matches any interaction_pattern:
       set status = waiting_for_input, notify user
   ```
   Note: `last_activity` is updated by the Claude Code `PostToolUse` hook deployed per-session.
   Agents without hook support (Gemini, Qwen) fall back to `updated_at` heuristic.

### Persistence & Resume

```bash
# Detach TUI, agents continue in tmux
agent-forge detach

# Reconnect — reads state from SQLite, verifies tmux sessions
agent-forge attach

# List sessions (even from another terminal)
agent-forge sessions
# ID         AGENT    STATUS    TASK                        AGE
# abc123     claude   working   "review auth module"        12m
# def456     gemini   idle      "design database schema"    8m
# ghi789     qwen     completed "validate commit security"  3m
```

### Resilienza: Daemon-in-Tmux Pattern

Forge gira come daemon dentro una sessione tmux dedicata. I processi pi sono child processes del daemon:

```
tmux session "af_daemon"
└── agent-forge process (Bun)
    ├── RpcClient [gemini]    pid 1234  ← child process
    ├── RpcClient [qwen]      pid 1235  ← child process
    └── RpcClient [claude]    pid 1236  ← child process
```

- Se l'utente fa `tmux detach`, forge e tutti i pi continuano
- Se forge crasha, i pi muoiono — forge li rilancia al restart leggendo `piSessionFile` da SQLite
- Al restart: `pi.start()` + `pi.send({ type: 'switch_session', sessionPath: checkpoint.piSessionFile })`

### Log Files

Every session writes output to a log file (audit trail):
```
~/.agent-forge/logs/
+-- abc123-claude.log      # full terminal capture via pipe-pane
+-- def456-gemini.log
+-- ghi789-qwen.log
```

Catturati via `tmux pipe-pane` come audit trail. Non sono più il canale di lettura primario — l'output strutturato arriva via pi events e `get_last_assistant_text`.

---

## 4. Communication Protocol

Inter-agent communication avviene tramite pi RPC (JSON stdin/stdout) e SQLite per coordinamento persistente.

### Channel Architecture

| Channel | Mechanism | Purpose | Persistence |
|---------|-----------|---------|-------------|
| **Send** | `pi.prompt()` (JSON RPC) | Invia prompt all'agente via stdin | No (real-time) |
| **Read** | `pi.send({ type: 'get_last_assistant_text' })` | Legge l'ultimo output dell'agente | No (snapshot) |
| **Events** | `pi.onEvent()` stream | Status in real-time (agent_start, tool_execution, agent_end) | No (streaming) |
| **Log** | SQLite + pipe-pane JSONL | Registra tutti gli scambi | Sì (persistente) |

### Send Protocol

Pi è sempre pronto a ricevere prompt dopo `start()` — nessun polling di readiness necessario.

```typescript
async function sendToAgent(session: Session, message: string): Promise<void> {
  const pi = piPool.get(session.id);

  // 1. Invia prompt (non-blocking — gli eventi arrivano in streaming via onEvent())
  await pi.prompt(message);

  // 2. Aggiorna stato sessione
  await db.updateSession(session.id, { status: 'working' });

  // 3. Log del messaggio
  await store.addMessage({
    from: currentSession.id,
    to: session.id,
    type: 'task',
    content: message,
  });

  // Gli eventi pi aggiornano last_activity in tempo reale via onEvent()
}
```

`waitForReady()` con polling + regex è eliminato. La "readiness" è implicita: un processo pi long-running è sempre pronto. Il watchdog registra il timestamp dell'ultimo evento ricevuto — se `now - lastEventTime > stall_threshold` l'agente è stalled.

### AF_STATUS Block Protocol

Inspired by ralph-claude-code's `RALPH_STATUS` pattern. Worker agents emit a structured block at task completion.

Agents emit at the **end** of their response:

```
---AF_STATUS---
STATUS: COMPLETE | IN_PROGRESS | BLOCKED
EXIT_SIGNAL: true | false
PROGRESS_SUMMARY: <one-line summary of what was accomplished>
ARTIFACTS: <comma-separated outputs produced, or "none">
BLOCKED_REASON: <if BLOCKED, reason>
---AF_STATUS_END---
```

Con pi, il segnale primario di completamento è l'evento `agent_end`. L'orchestratore legge l'output via `get_last_assistant_text` (non da file di log). AF_STATUS rimane rilevante per **compatibilità con sistemi senza pi** (es. unitAI che legge da stdout CLI).

> **Contratto condiviso:** Il formato AF_STATUS è identico in tutti i sistemi dell'ecosistema (unitAI, Agent Forge, Mercury). **Non va modificato unilateralmente**: qualsiasi cambiamento richiede consenso di tutti i sistemi. La logica di parsing sarà parte del pacchetto condiviso `@jaggerxtrm/specialist-loader`. Agent Forge legge AF_STATUS via `get_last_assistant_text`; unitAI lo legge da stdout del CLI — il formato è lo stesso, solo la sorgente cambia.

Parsing order con pi:
1. Attendi evento `agent_end` — segnale nativo di completamento
2. Leggi output via `pi.send({ type: 'get_last_assistant_text' })`
3. Parsa AF_STATUS block se presente (compatibilità cross-sistema)

**Injection**: `specialist-loader` appende automaticamente le istruzioni AF_STATUS a `prompt.system` al momento dello spawn. Nessuna azione manuale richiesta.

### Read Protocol

```typescript
async function readFromAgent(session: Session): Promise<string> {
  const pi = piPool.get(session.id);
  const { data } = await pi.send({ type: 'get_last_assistant_text' });
  return data.text;
}
```

Per audit trail completo, `pipe-pane` continua a scrivere su file log — ma non è più usato come canale di lettura primario.

---

## 5. Protocol Engine

Declarative YAML protocols define multi-turn orchestration workflows. This is where the existing `delegating/config.yaml` and `orchestrating-agents/references/workflows.md` migrate to.

### Protocol YAML Format

```yaml
# protocols/collaborative.yaml
name: collaborative
description: "Multi-turn design session"
version: 1
default_agents:
  a: gemini
  b: qwen

parameters:
  - name: task
    type: string
    required: true
  - name: context
    type: string
    required: false

turns:
  - id: design
    agent: ${a}
    action: start_with_prompt
    prompt_template: |
      Design a solution for: ${task}
      Requirements: ${context}
    wait_for: ready
    timeout_ms: 120000        # per-turn timeout; triggers on_error if exceeded
    max_attempts: 2           # retry limit before failing the turn
    on_blocked: skip          # if PreToolUse hook blocks: skip | abort | retry
    on_error: abort           # if turn fails: abort protocol | skip turn | retry
    done_criteria: |          # verifiable completion condition (checked against AF_STATUS)
      STATUS: COMPLETE
      output_var 'design' is non-empty
    capture_output: true
    output_var: design

  - id: critique
    agent: ${b}
    action: start_with_prompt
    prompt_template: |
      Review this design critically. Find edge cases and issues:
      ${design}
    wait_for: ready
    capture_output: true
    output_var: critique

  - id: refine
    agent: ${a}
    action: resume
    prompt_template: |
      Address these critiques and provide the refined design:
      ${critique}
    wait_for: ready
    capture_output: true
    output_var: final_design

result:
  template: |
    ## Collaborative Design Results

    ### Initial Design
    ${design}

    ### Critique
    ${critique}

    ### Refined Design
    ${final_design}
```

```yaml
# protocols/adversarial.yaml
name: adversarial
description: "Red-team security audit with attack/defense rounds"
version: 1
default_agents:
  attacker: gemini
  defender: qwen

parameters:
  - name: target
    type: string
    required: true
  - name: focus
    type: choice
    choices: [security, performance, correctness]
    default: security

turns:
  - id: initial_review
    agent: ${defender}
    action: start_with_prompt
    prompt_template: |
      Perform a ${focus} review of this code. Identify strengths and potential issues:
      ${target}
    capture_output: true
    output_var: initial_review

  - id: red_team
    agent: ${attacker}
    action: start_with_prompt
    prompt_template: |
      Act as a red team reviewer. Find 3 ways to break or exploit this:
      ${target}

      The initial review found:
      ${initial_review}
    capture_output: true
    output_var: attacks

  - id: defense
    agent: ${defender}
    action: resume
    prompt_template: |
      Defend against these attacks or provide patches:
      ${attacks}
    capture_output: true
    output_var: defense

result:
  template: |
    ## Adversarial Review Results

    ### Initial Review
    ${initial_review}

    ### Attack Vectors
    ${attacks}

    ### Defense & Patches
    ${defense}
```

```yaml
# protocols/troubleshoot.yaml
name: troubleshoot
description: "Root cause analysis with hypothesis testing"
version: 1
default_agents:
  a: gemini
  b: qwen

parameters:
  - name: symptoms
    type: string
    required: true
  - name: code
    type: string
    required: false

turns:
  - id: hypothesize
    agent: ${a}
    action: start_with_prompt
    prompt_template: |
      Analyze these symptoms and provide 3 hypotheses with verification steps:
      ${symptoms}
    capture_output: true
    output_var: hypotheses

  - id: verify
    agent: ${b}
    action: start_with_prompt
    prompt_template: |
      Verify Hypothesis #1 using the provided code:
      ${hypotheses}
      Code: ${code}
    capture_output: true
    output_var: verification

  - id: root_cause
    agent: ${a}
    action: resume
    prompt_template: |
      Based on verification results, provide final root cause and remediation:
      ${verification}
    capture_output: true
    output_var: root_cause

  - id: validate_fix
    agent: ${b}
    action: resume
    prompt_template: |
      Validate the proposed fix is correct and complete:
      ${root_cause}
    capture_output: true
    output_var: validation

result:
  template: |
    ## Troubleshoot Results

    ### Hypotheses
    ${hypotheses}

    ### Verification
    ${verification}

    ### Root Cause & Remediation
    ${root_cause}

    ### Fix Validation
    ${validation}
```

```yaml
# protocols/handshake.yaml
name: handshake
description: "Quick one-turn second opinion"
version: 1
default_agents:
  a: gemini
  b: qwen

parameters:
  - name: task
    type: string
    required: true

turns:
  - id: propose
    agent: ${a}
    action: start_with_prompt
    prompt_template: |
      ${task}
    capture_output: true
    output_var: proposal

  - id: validate
    agent: ${b}
    action: start_with_prompt
    prompt_template: |
      Review and validate this. Provide a concise verdict (APPROVED / NEEDS CHANGES):
      ${proposal}
    capture_output: true
    output_var: verdict

result:
  template: |
    ## Handshake Results

    ### Proposal
    ${proposal}

    ### Verdict
    ${verdict}
```

### Turn Execution (Pi-based)

Il Protocol Engine esegue ogni turn via pi RPC. `wait_for: ready` nei YAML di protocollo si traduce in `waitForIdle()`:

```typescript
// Per ogni turn del protocollo:
const rendered_prompt = renderTemplate(turn.prompt_template, context);

await pi.prompt(rendered_prompt);
await pi.waitForIdle(turn.timeout_ms ?? 120_000);

const { data } = await pi.send({ type: 'get_last_assistant_text' });
context[turn.output_var] = data.text;  // disponibile ai turn successivi
```

Vantaggi rispetto al vecchio pattern tmux:
- Nessun polling di pane content — `waitForIdle()` attende `agent_end` event nativo
- Timeout preciso per-turn (non per sessione)
- Cancellazione immediata via `pi.send({ type: 'abort' })` in caso di `on_error: abort`

### Routing Engine

Migrated from `delegating/config.yaml`:

```yaml
# config/routing.yaml
rules:
  - patterns: ["typo|spelling", "test|unit.*test", "format|lint"]
    action: spawn
    agent: ccs-glm
    cost: low

  - patterns: ["think|analyze|reason", "explain|describe"]
    action: spawn
    agent: gemini
    cost: medium

  - patterns: ["review.*(code|security)", "security.*(audit|review)"]
    action: protocol
    protocol: adversarial
    agents: { attacker: gemini, defender: qwen }
    cost: high

  - patterns: ["implement.*feature", "build.*feature"]
    action: protocol
    protocol: collaborative
    agents: { a: gemini, b: qwen }
    cost: high

  - patterns: ["debug|crash|error", "root.*cause"]
    action: protocol
    protocol: troubleshoot
    agents: { a: gemini, b: qwen }
    cost: high

default:
  action: spawn
  agent: ccs-glm

exclusions:
  - "architecture.*decision"
  - "security.*critical"
```

---

## 6. CLI Interface

### Command Structure

```
agent-forge
+-- init                    # Initialize project (.agent-forge/, profiles/)
+-- start [--boss <agent>]  # Start boss session (default: claude)
+-- spawn <agent> [prompt]  # Start worker agent with optional task
|   +-- --specialist <name> # Load specialist brain (system prompt, config)
+-- send <agent> <message>  # Send message to agent (wait-for-ready)
+-- read <agent> [--tail N] # Read agent output (pane or log)
+-- status [agent]          # Status of all/one
+-- sessions                # List sessions with details
+-- kill <agent|session-id> # Kill agent
+-- kill-all                # Kill all agents
+-- attach                  # Reconnect to existing sessions
+-- detach                  # Disconnect TUI, agents continue
+-- logs <agent> [--follow] # Stream log file
|
+-- run <protocol> [opts]   # Execute orchestration protocol
|   +-- --agents a=gemini,b=qwen
|   +-- --task "description"
|   +-- --context "file or text"
|
+-- profile                 # Profile management
|   +-- list
|   +-- add
|   +-- test <agent>
|   +-- show <agent>
|
+-- protocol                # Protocol management
|   +-- list
|   +-- show <name>
|   +-- validate <file>
|
+-- specialist              # Specialist management
|   +-- list [--scope sys|user|project]  # List available specialists
|   +-- show <name>         # Show specialist details (frontmatter + prompt preview)
|   +-- create [--from-skill <name>]     # Create new specialist (interactive or from skill)
|   +-- validate <file>     # Validate .specialist.yaml schema
|   +-- check-health        # Run staleness detection on all specialists
|
+-- registry                # Unified view of all resources
|   +-- list                # List all profiles, protocols, specialists, skills
|   +-- search <query>      # Search across all resources by name/description
|
+-- tui                     # Launch TUI dashboard
|
+-- config                  # Global configuration
    +-- show
    +-- set <key> <value>
```

### Usage Examples

```bash
# Basic: start boss, delegate tasks
agent-forge start                              # start Claude as boss
agent-forge spawn gemini "review auth module"  # spawn Gemini worker
agent-forge status                             # check state
agent-forge read gemini --tail 20              # read last 20 lines output
agent-forge send gemini "also check for XSS"  # follow-up

# Orchestrated: execute declarative protocol
agent-forge run collaborative \
  --agents a=gemini,b=qwen \
  --task "Design rate limiting for API" \
  --context "$(cat src/api/routes.ts)"

# Resume
agent-forge sessions                           # see active sessions
agent-forge attach                             # open TUI with existing sessions

# Profile management
agent-forge profile test gemini                # verify gemini works
agent-forge profile add --name cursor \
  --start "cursor-agent" \
  --prompt-flag "--ask"
```

### Specialist-Driven Examples

```bash
# Spawn with specialist brain — agent gets domain-specific system prompt
agent-forge spawn gemini --specialist mercury-db-health "Check connection pools"

# List available specialists grouped by scope
agent-forge specialist list
# SYSTEM (built-in)
#   code-reviewer       "General-purpose code review specialist"
# USER (~/.agent-forge/specialists/)
#   doc-writer          "Technical documentation specialist"
# PROJECT (.agent-forge/specialists/)
#   mercury-db-health   "Monitors Mercury PostgreSQL health"
#   mercury-ingestion   "Monitors ingestion pipeline health"

# Run protocol with specialist-equipped agents
agent-forge run adversarial \
  --agents attacker=gemini,defender=qwen \
  --specialist:attacker=security-auditor \
  --specialist:defender=mercury-api-guard \
  --task "Review payment endpoint" \
  --context "$(cat src/api/payment.ts)"

# Check specialist staleness (files_to_watch changed since last update)
agent-forge specialist check-health
# mercury-db-health: OK (updated 3d ago)
# mercury-ingestion: STALE (database/models.py changed 2d after specialist update)
```

### Integration with Claude (the boss)

Claude can use agent-forge via Bash tool from within its session:

```bash
# Claude executes via Bash:
agent-forge spawn gemini "Review this code for security: $(cat src/auth.ts)"
# Wait...
agent-forge read gemini
# Reads the result and integrates it into its reasoning
```

This directly replaces the `gemini -p "..."` pattern from current skills, adding persistence, status tracking, and logging.

---

## 7. TUI Dashboard

The TUI is a "view" on the state — not the main process. Launched with `agent-forge tui`.

### Layout

```
+- agent-forge -------------------------------------------------+
| +- Fleet ----------------+ +- Active Agent ----------------+ |
| |                        | |                                | |
| |  * claude   working 4m | |  [claude] session: af_claude_x | |
| |  o gemini   idle    2m | |                                | |
| |  . qwen     ready   0m | |  > I'll delegate the security | |
| |    glm      --      -- | |    review to gemini and the   | |
| |                        | |    quality check to qwen...   | |
| |  [up/down] navigate    | |                                | |
| |  [enter] focus         | |  Last output (tail):          | |
| |  [s] spawn             | |  Created review protocol...   | |
| |  [k] kill              | |  Spawning gemini worker...    | |
| |  [m] send message      | |                                | |
| +------------------------+ +--------------------------------+ |
| +- Messages --------------+ +- Protocol ------------------+ |
| | 14:23 claude->gemini    | | collaborative (running)      | |
| |   "Review auth module"  | | +- Turn 1 OK  gemini design  | |
| | 14:25 gemini->claude    | | +- Turn 2 ... qwen critique  | |
| |   "Found 3 issues..."   | | +- Turn 3 ___ gemini refine  | |
| | 14:26 claude->qwen      | |                               | |
| |   "Validate fixes..."   | | Elapsed: 4m 23s               | |
| +-------------------------+ +-------------------------------+ |
| [F1]Help [F2]Fleet [F3]Send [F4]Protocol [F5]Logs [F6]Registry [q]Quit |
+------------------------------------------------------------------------+
```

### Registry Panel (F6)

```
+- Registry [F6] ─────────────────────────────────────────+
| SPECIALISTS                    | DETAILS                 |
|   system (2)                   | mercury-db-health v1.2  |
|     code-reviewer              | "Monitors Mercury       |
|     security-auditor           |  PostgreSQL health..."  |
|   user (1)                     |                         |
|     doc-writer                 | Profile: gemini         |
|   project (3)                  | Model: gemini-2.0-flash |
|   > mercury-db-health          | Stale: NO (3d ago)      |
|     mercury-ingestion          | Watches: models.py      |
|     mercury-api-guard          |                         |
| PROTOCOLS (4)                  | [s] spawn with this     |
|   collaborative                | [e] edit yaml           |
|   adversarial                  | [v] view full yaml      |
|   troubleshoot                 | [c] check health        |
|   handshake                    |                         |
| PROFILES (4)                   |                         |
|   claude, gemini, qwen, glm   |                         |
| SKILLS (read-only, detected)   |                         |
|   delegating, orchestrating... |                         |
+-────────────────────────────────────────────────────────+
```

The Registry panel discovers and displays all resources from three scopes:
- **System**: Built-in, shipped with agent-forge
- **User**: `~/.agent-forge/{specialists,protocols,profiles}/`
- **Project**: `.agent-forge/{specialists,protocols,profiles}/`
- **Skills** (read-only): Detected from `~/.claude/skills/` and `.claude/skills/`

Each resource shows its frontmatter metadata (name, version, description, category).

### Panels

| Panel | Content | Update mechanism |
|-------|---------|------------------|
| **Fleet** | Agent list with status, duration, role, specialist | SQLite poll ogni 2-5s (aggiornato da pi events) |
| **Active Agent** | Output tail of selected agent | pi `message_update` events (streaming delta) |
| **Messages** | Inter-agent message log | SQLite messages table |
| **Protocol** | Running protocol state (completed/in-progress turns) | Orchestrator state |
| **Registry** | All specialists, protocols, profiles, skills with details | File scan on open + manual refresh |

### Keybindings

| Key | Action |
|-----|--------|
| `Up/Down` | Navigate fleet |
| `Enter` | Focus agent (full-screen output) |
| `s` | Spawn new worker (interactive prompt) |
| `k` | Kill selected agent (with confirmation) |
| `m` | Send message to selected agent |
| `r` | Run protocol (workflow + agent selection) |
| `l` | Open log file in `$PAGER` |
| `t` | Toggle: switch to direct tmux pane (Ctrl+B to return) |
| `F5` | Full-screen log view |
| `F6` | Toggle Registry panel (browse specialists/protocols/profiles/skills) |
| `q` | Quit TUI (agents continue in background) |

### tmux Pass-Through

Pressing `t` on a selected agent hides the TUI and drops you into the agent's tmux pane for direct interaction. A predefined key combination returns to the TUI. This bridges monitoring and direct interaction.

### Technology

Ink (React for terminals) for the TUI framework. Components built with `ink-box`, `ink-table`, and custom hooks for session state and agent output streaming.

---

## 8. Project Structure

```
agent-forge/
+-- package.json
+-- bunfig.toml
+-- tsconfig.json
+-- README.md
+-- LICENSE
|
+-- src/
|   +-- index.ts                    # CLI entry point
|   +-- cli/
|   |   +-- commands/               # Commander.js command definitions
|   |   |   +-- start.ts
|   |   |   +-- spawn.ts
|   |   |   +-- send.ts
|   |   |   +-- read.ts
|   |   |   +-- status.ts
|   |   |   +-- run.ts              # Protocol execution
|   |   |   +-- profile.ts
|   |   |   +-- protocol.ts
|   |   |   +-- tui.ts
|   |   |   +-- sessions.ts
|   |   +-- parser.ts
|   |
|   +-- core/
|   |   +-- orchestrator.ts         # Main orchestration logic
|   |   +-- session-store.ts        # SQLite session management
|   |   +-- message-bus.ts          # Inter-agent messaging
|   |   +-- registry.ts             # Agent profile registry
|   |   +-- protocol-engine.ts      # YAML protocol executor
|   |   +-- specialist-loader.ts    # .specialist.yaml discovery, validation, rendering
|   |   +-- watchdog.ts             # Reconciliation loop: liveness + progress + interaction (v0.6.0)
|   |   +-- event-bridge.ts         # JSONL event emitter for observability (v0.6.0)
|   |   +-- hook-deployer.ts        # Mode B: deploy Claude Code hooks to session dirs (v1.3.0)
|   |
|   +-- pi/
|   |   +-- rpc-pool.ts             # gestisce N istanze RpcClient (una per agente)
|   |   +-- event-router.ts         # routing AgentEvent → SQLite (last_activity, status)
|   |   +-- layout.ts               # Layout presets tmux (per daemon host)
|   |
|   +-- tui/
|   |   +-- app.tsx                 # Ink root component
|   |   +-- components/
|   |   |   +-- fleet-panel.tsx
|   |   |   +-- agent-view.tsx
|   |   |   +-- messages-panel.tsx
|   |   |   +-- protocol-panel.tsx
|   |   |   +-- registry-panel.tsx  # Browse specialists/protocols/profiles/skills
|   |   |   +-- status-bar.tsx
|   |   +-- hooks/
|   |       +-- use-sessions.ts
|   |       +-- use-agent-output.ts
|   |       +-- use-protocol-state.ts
|   |
|   +-- types/
|       +-- profile.ts
|       +-- session.ts
|       +-- protocol.ts
|       +-- message.ts
|       +-- specialist.ts
|
+-- profiles/                       # Built-in agent profiles
|   +-- claude.yaml
|   +-- gemini.yaml
|   +-- qwen.yaml
|   +-- ccs-glm.yaml
|
+-- protocols/                      # Built-in orchestration protocols
|   +-- collaborative.yaml
|   +-- adversarial.yaml
|   +-- troubleshoot.yaml
|   +-- handshake.yaml
|
+-- specialists/                    # Built-in specialist definitions
|   +-- code-reviewer.specialist.yaml
|   +-- security-auditor.specialist.yaml
|
+-- tests/
|   +-- core/
|   +-- tmux/
|   +-- cli/
|   +-- fixtures/
|
+-- docs/
    +-- getting-started.md
    +-- profiles.md
    +-- protocols.md
    +-- architecture.md
```

### Distribution

```bash
# Install via npm (Node-compatible bundle, Bun not required on user machines)
npm install -g agent-forge

# Install via bun (native, faster startup)
bun install -g agent-forge

# Build (bun build --target=node produces Node-compatible bundle for npm publish)
bun build --target=node src/index.ts --outfile dist/agent-forge.js

# Prerequisite
# Linux: apt install tmux / dnf install tmux
# macOS: brew install tmux
```

### Configuration Files

```
~/.agent-forge/                 # Global (user scope)
+-- config.yaml                 # Global config
+-- profiles/                   # User custom profiles
+-- protocols/                  # User custom protocols
+-- specialists/                # User custom specialists (*.specialist.yaml)
+-- state.db                    # SQLite
+-- logs/
    +-- <session-id>-<agent>.log

.agent-forge/                   # Per-project overrides (project scope)
+-- config.yaml
+-- profiles/
+-- protocols/
+-- specialists/                # Project-specific specialists (*.specialist.yaml)
```

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `commander` | CLI framework |
| `ink` + `ink-*` | TUI components |
| `bun:sqlite` | SQLite (native Bun driver, zero native compilation) |
| `yaml` | Profile/protocol parsing |
| `zod` | Schema validation |
| `chalk` | Terminal colors (CLI output) |
| `chokidar` | File watching (log tailing) |
| `vitest` | Test framework (Bun-compatible) |

---

## 9. Versioning & Roadmap

### Release Plan

```
v0.1.0 -- Foundation (MVP)
  Core: orchestrator, session store, tmux manager
  CLI:  start, spawn, send, read, status, kill, sessions
  Profiles: claude, gemini built-in
  Protocols: none (direct spawn only)
  TUI: none

v0.2.0 -- Protocols
  Protocol engine: YAML parser + executor
  Built-in: handshake, collaborative
  CLI: run, protocol list/show/validate
  Profiles: +qwen, +ccs-glm

v0.3.0 -- TUI
  Dashboard: fleet panel, agent view, messages, keybindings
  tmux pass-through (t key)
  Status bar tmux integration

v0.4.0 -- Specialist System
  Specialist loader: .specialist.yaml discovery, Zod validation, template rendering
  CLI: specialist list/show/create/validate/check-health
  spawn --specialist flag
  3-scope discovery: system, user (~/.agent-forge/), project (.agent-forge/)
  Built-in specialists: code-reviewer, security-auditor

v0.5.0 -- Advanced Protocols + Registry
  Built-in protocols: +adversarial, +troubleshoot
  Protocol variables, conditional turns
  Routing engine (pattern -> agent/protocol auto-selection)
  Registry CLI: unified view of all resources

v0.6.0 -- Resilience & Polish
  Zombie detection: reconciliation loop Phase 1 (tmux liveness)
  Stalled-agent detection: Phase 2 (last_activity + PostToolUse hook integration)
  waiting_for_input detection: Phase 3 (interaction_patterns in pane)
  Progressive escalation: Level 1 nudge → Level 2 stalled state → parent notification
  Circuit breaker: three-state (CLOSED/HALF_OPEN/OPEN) per protocol turn, git-diff based progress
  AF_STATUS block: structured completion signal, auto-injected by specialist-loader
  JSONL event bridge: structured session/message/protocol events (--json output flag)
  Universal tmux socket path: configurable, defaults to ~/.tmux/agent-forge
  Checkpoint file: .agent-forge/sessions/{id}/checkpoint.json for restart recovery
  attach/detach lifecycle
  Log management (rotation, cleanup)
  Profile test command

v1.0.0 -- Production Release
  Full documentation
  CI/CD pipeline
  npm publish
  Stability, edge case handling
  Migration guide from delegating/orchestrating-agents skills
```

### Future Versions

```
v1.1.0 -- Custom Profiles
  profile add CLI
  Community profile sharing

v1.2.0 -- Advanced TUI
  Mouse support
  Split-pane layouts (presets)
  Protocol visualization (flow diagram)

v1.3.0 -- Hooks & Events
  Hook taxonomy (8 official types + PostToolUseFailure):
    SessionStart, UserPromptSubmit, PreToolUse, PostToolUse,
    Stop, PreCompact, SessionEnd, Notification, PostToolUseFailure
  Mode A (passive): Agent Forge reacts to Claude Code hook events → updates SQLite state
  Mode B (active): Agent Forge deploys hook scripts into .claude/settings.json
                   of each spawned session's directory (project-scoped, not user-scoped)
  Hook configuration schema with matcher, timeout, blocking semantics
  Pre/post-spawn hooks: fire before/after tmux session creation
  Protocol completion hooks: fire on turn success/failure/timeout
  on_blocked / on_error protocol turn fields (promoted from v0.6.0 prep)

v1.3.x -- SQLite-First Communication (annotato per v1.3.0+)
  Principio architetturale: tmux = execution layer, SQLite = communication layer
  Obiettivo: gli agenti non comunicano mai leggendo il terminale dell'altro.
  Tutta la comunicazione strutturata passa per SQLite.
  Mezzo: Local Communication MCP server (wrappa state.db come typed tools):
    send_message({ to, type, content, payload?, priority? })
    read_inbox({ session_id, unread_only?, type_filter? })
    update_status({ session_id, status, last_activity? })
    report_completion({ session_id, af_status, artifacts? })
    get_task({ session_id })
  Hook nativi di ogni CLI (Claude Code hook → update last_activity, Stop hook → write worker_done)
  capture-pane demosso a tool di debug/backup; pipe-pane resta come audit trail
  Prerequisito: studio degli hook di ciascun CLI agent
    (Claude Code: 8 tipi documentati; Gemini/Qwen/GLM: da investigare)

v1.4.0 -- Proactive Specialists
  Heartbeat system (scheduled specialist execution)
  Staleness auto-detection + updater agent
  Specialist-to-specialist communication (Inbox pattern)
  Continuous monitoring mode

v1.5.0 -- Autonomous Operations
  Container mode: official Docker deployment with named volumes for state.db, logs, socket
  Git-native change management:
    - Cloned repo inside container, isolated from production
    - Agents work on branches; propose changes via pull requests (gh pr create)
    - wait_for: pr_merged | pr_closed turn type (human approval via PR review)
    - Git permission Rules: agents can push branches, cannot merge to main, cannot force-push
    - Git worktrees (moved from v2.0.0): parallel agents on same repo without conflicts
  Event-driven triggers: on_external_event forge hook with HTTP/webhook receiver
    (e.g., error rate > 5% → spawn incident protocol; CI failure → spawn troubleshoot)
  Incidents table: detection, notification, and tracking for ALL problems — not just code fixes
    CREATE TABLE incidents (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      status       TEXT CHECK(status IN (
                     'open',             -- detected, not yet investigated
                     'investigating',    -- agent is actively working on it
                     'proposed',         -- PR opened (pr_url populated)
                     'needs_manual',     -- no code fix; requires human action
                     'auto_resolved',    -- resolved without intervention
                     'closed'            -- resolved and confirmed
                   )),
      severity     TEXT CHECK(severity IN ('info','warning','critical')),
      protocol_run TEXT,             -- which protocol run is handling this
      thread_id    TEXT,             -- links to messages.thread_id
      pr_url       TEXT,             -- nullable: only set if a code fix PR was opened
      recurrence   INTEGER DEFAULT 0, -- how many times this pattern has appeared
      created_at   DATETIME,
      resolved_at  DATETIME
    );
    Note: most incidents never produce a PR. The PR is one resolution path,
    not the default. Notifications, manual actions, and auto-resolutions are
    equally valid outcomes.
  Microservices mode: specialist-per-service pattern with shared incident bus

v2.0.0 -- ForgeManager & Ecosystem
  ForgeManager: browse/install community protocols, specialists, and profiles
  Protocol composition (chain protocols into meta-workflows)
  Specialist marketplace (community-shared domain configs)
  Multi-project support
  Skill-to-specialist migration CLI
  Git worktree support (agent isolation for file-writing workers)
```

### Competitive Differentiation

| Feature | Agent Deck | Overstory | Agent Forge |
|---------|------------|-----------|-------------|
| **Runtime** | Go | Bun/TS | Bun/TS |
| **Focus** | Session management | Swarm orchestration | Protocol-driven orchestration |
| **Agent model** | Flat (all equal) | Hierarchical (capabilities) | Boss/worker (simple hierarchy) |
| **Communication** | tmux send-keys | SQLite mail | tmux pipe + file log |
| **Protocols** | None | None (ad-hoc) | Declarative YAML |
| **TUI** | Bubble Tea (rich) | ANSI dashboard | Ink (React-based) |
| **Headless** | Yes (CLI) | Yes (CLI) | Yes (CLI-first) |
| **Skill integration** | None | CLAUDE.md overlay | Protocol definitions from skills |
| **Domain knowledge** | None | CLAUDE.md overlay | .specialist.yaml (Brain layer) |
| **USP** | MCP management, forking | Hierarchy, worktrees | Declarative protocols + specialists |

**Unique selling points**:
1. Agent Forge is the only tool that makes orchestration workflows **declarative and reusable** — you write YAML, not code.
2. The **Specialist System** (Brain + Body) separates domain knowledge from execution infrastructure, making agents truly domain-expert and their knowledge portable across runtimes (TS, Python, Docker).

---

## 10. Specialist System Integration

The Specialist System provides the "Brain" layer — domain-specific knowledge, prompts, execution config, and validation rules — while Agent Forge provides the "Body" — tmux sessions, communication, orchestration.

### Relationship: Brain + Body

```
Profile (Body)                    Specialist (Brain)
profiles/gemini.yaml              specialists/mercury-db-health.specialist.yaml
+-- how to start                  +-- what it knows (system prompt)
+-- how to resume                 +-- how to reason (task template)
+-- how to detect status          +-- what model to use (execution)
+-- env vars                      +-- what to validate (output schema)
                                  +-- when it's stale (files_to_watch)
```

An agent session can have:
- **Profile only**: Generic agent, no domain specialization (current behavior)
- **Profile + Specialist**: Domain-expert agent with pre-loaded knowledge
- **Specialist only**: Inferred profile from `specialist.execution.preferred_profile`

### Specialist YAML Schema (.specialist.yaml)

Compatible with the existing Python Pydantic implementation (darth_feedor). Agent Forge implements a TypeScript loader (Zod) that reads the same format.

```yaml
# .agent-forge/specialists/mercury-db-health.specialist.yaml
specialist:
  metadata:
    name: mercury-db-health
    version: 1.2.0
    description: "Monitors Mercury PostgreSQL health, query performance, connection pools"
    category: monitoring/database
    created: 2026-02-08T00:00:00Z
    updated: 2026-02-24T00:00:00Z
    author: jagger

  execution:
    mode: auto                      # tool | skill | auto (default: auto)
    preferred_profile: gemini       # Which Agent Forge profile to use
    model: gemini-2.0-flash         # Model override (informational for non-API agents)
    temperature: 0.2
    response_format: json
    fallback_model: qwen-plus

  prompt:
    system: |
      You are the Mercury Database Health Specialist. You monitor PostgreSQL
      health for the Mercury trading platform. You know the schema intimately
      and can diagnose connection pool issues, slow queries, and replication lag.
    task_template: |
      **TASK:** $query
      **CONTEXT:** Check the following systems:
      - Connection pools (pgbouncer)
      - Slow query log (>500ms)
      - Replication lag
      - Disk usage on data tablespace
      **OUTPUT:** JSON with health_status, issues[], recommendations[]
    normalize_template: |
      Fix word count violations in this output:
      $violations
      $generated_output
    output_schema:
      type: object
      required: [health_status, issues, recommendations]

  validation:
    files_to_watch:
      - mercury/database/models.py
      - mercury/database/migrations/
    references:
      - type: ssot_memory
        path: .serena/memories/ssot_mercury_database_2026-02-05.md
    stale_threshold_days: 14

  capabilities:                     # Active: enforced by PreToolUse hook at session spawn
    file_scope:                     # Filesystem access boundaries
      - mercury/database/           # read/write allowed
      - .agent-forge/sessions/      # read-only
    blocked_tools:                  # Tools this specialist must not use
      - Bash                        # read-only specialist, no shell execution
    can_spawn: false                # Cannot spawn sub-agents (worker, not boss)
    tools:
      - name: docker_inspect
        purpose: "Check container runtime status"
      - name: context7
        purpose: "Look up PostgreSQL documentation"
```

### Spawn Flow with Specialist

```
agent-forge spawn gemini --specialist mercury-db-health "Check connection pools"
                |                        |                        |
                v                        v                        v
        Load profile             Load specialist           User's task
        gemini.yaml         mercury-db-health.yaml
                |                        |                        |
                v                        v                        v
        provider: google-gemini-cli   prompt.system          prompt.task_template
                                      + AF_STATUS suffix     $query = user task
                |                        |
                +--------+---------------+
                         |
                         v
              Crea sessionDir: .agent-forge/sessions/{uuid}/
              Scrive agents.md (convenzione nativa di pi):
                .agent-forge/sessions/{uuid}/agents.md
                (contiene: system prompt dello specialist + istruzioni AF_STATUS)

              Spawn RpcClient:
                new RpcClient({ provider: 'google-gemini-cli', cwd: sessionDir })
                → pi carica agents.md automaticamente dalla cwd

              Invia task:
                await pi.prompt(renderTaskTemplate(specialist, userTask))
```

`agents.md` è la convenzione nativa di pi per il context injection — equivalente a `CLAUDE.md` ma funziona con tutti i provider (non solo Claude). Persiste per tutta la sessione pi senza re-iniezione.

### Specialist Discovery (3-scope + cross-scanning)

```
Priority (highest first):
1. Project:  .agent-forge/specialists/*.specialist.yaml
             .claude/specialists/*.specialist.yaml        ← cross-scanning
2. User:     ~/.agent-forge/specialists/*.specialist.yaml
             ~/.claude/specialists/*.specialist.yaml      ← cross-scanning
3. System:   <agent-forge-install>/specialists/*.specialist.yaml

Merge rule: Project overrides User overrides System (by metadata.name)
```

**Cross-scanning:** Agent Forge scansiona anche `.claude/specialists/` (e `~/.claude/specialists/` a livello utente) se presenti. Questo garantisce che uno specialist creato per unitAI (che scansiona `.claude/specialists/`) funzioni anche in Agent Forge senza duplicazione del file. Viceversa, uno specialist in `.agent-forge/specialists/` viene trovato anche da unitAI.

**Policy "never reject unknown fields":** Il loader YAML accetta tutti i campi del superset schema senza errore, anche quelli non usati da Agent Forge (es. `prompt.normalize_template` di Mercury, `communication.*` di unitAI). Questo garantisce che uno specialist scritto per un sistema qualsiasi funzioni in tutti gli altri. Zod è l'implementazione autoritativa: se una divergenza emerge tra Zod e Pydantic, è Pydantic ad adattarsi.

### Staleness Detection

L'algoritmo è identico in tutti i sistemi dell'ecosistema (Agent Forge, unitAI, Mercury):

1. Controlla se i file in `validation.files_to_watch` hanno `mtime > metadata.updated`
2. Controlla se giorni da ultimo update > `validation.stale_threshold_days`
3. Stato risultante: **OK** / **STALE** (file cambiati) / **AGED** (threshold superata)

```typescript
async function checkHealth(): Promise<HealthReport[]> {
  const specialists = await loader.loadAll();
  const reports: HealthReport[] = [];

  for (const spec of specialists) {
    const stale = spec.validation.files_to_watch.some(file => {
      const fileModified = fs.statSync(file).mtime;
      const specUpdated = new Date(spec.metadata.updated);
      return fileModified > specUpdated;
    });

    const aged = daysSince(spec.metadata.updated) > spec.validation.stale_threshold_days;

    reports.push({
      name: spec.metadata.name,
      status: stale ? "STALE" : aged ? "AGED" : "OK",
      reason: stale ? "Watched files changed" : aged ? "Threshold exceeded" : null,
    });
  }
  return reports;
}
```

### Circuit Breaker (3 stati)

Agent Forge implementa un circuit breaker a **3 stati** per ogni backend/specialist. Il modello è condiviso con unitAI e Mercury (interfaccia identica; Agent Forge aggiunge l'estensione git-diff):

| Stato | Comportamento | Transizione |
|-------|---------------|-------------|
| **CLOSED** | Operazione normale. Traccia fallimenti consecutivi. | → OPEN dopo N fallimenti consecutivi (default: 3) |
| **OPEN** | Tutte le richieste falliscono immediatamente. Usa fallback. | → HALF_OPEN dopo cooldown (default: 60s) |
| **HALF_OPEN** | Permette una richiesta di prova. | Successo → CLOSED; Fallimento → OPEN |

**Estensione Agent Forge (git-diff progress):** se N cicli consecutivi non producono file modificati, artifact nuovi, o commit Git, il circuit si apre. Questo previene loop infiniti su agenti bloccati. Questa estensione è Forge-specifica e **non va portata in unitAI o Mercury**.

### Rules, Skills, and Specialists — Three-Layer Knowledge

Three distinct knowledge layers, from most general to most specific:

| Layer | Type | Format | Loaded | Purpose |
|-------|------|--------|--------|---------|
| **Rules** | Always-on constraints | `.rules.md` | Every session | Behavioral guardrails ("Never commit credentials", "Always use parameterized queries") |
| **Skills** | On-demand procedures | `SKILL.md` | When invoked | How to perform a specific workflow |
| **Specialists** | Domain expert config | `.specialist.yaml` | When spawned | Full Brain layer: system prompt, task template, validation |

Rules are prepended to every session's CLAUDE.md automatically. Skills are invoked explicitly. Specialists are loaded at spawn time. A rule cannot be overridden by a skill or specialist — it is the invariant layer.

### Skill-to-Specialist Promotion

Skills are procedural (how to do something). Specialists are domain-specific (what to know about something). A skill can be promoted to a specialist when it has domain-specific knowledge worth persisting.

```bash
agent-forge specialist create --from-skill delegating
# Reads skills/delegating/SKILL.md frontmatter
# Extracts: name, description
# Generates: .agent-forge/specialists/delegating.specialist.yaml
# User fills in: execution config, prompt templates, validation rules
```

### Future: Shared Package `@jaggerxtrm/specialist-loader`

Una volta che Agent Forge e unitAI stabilizzano le loro implementazioni del specialist loader, la logica condivisa sarà estratta nel pacchetto npm `@jaggerxtrm/specialist-loader`. Contenuto pianificato:

- Zod schema definitions (superset)
- Discovery logic (3-scope, cross-scanning `.claude/` + `.agent-forge/`)
- Template engine (`$variable` substitution)
- AF_STATUS parser (identico in tutti i sistemi)
- Output validator (JSON Schema)
- Staleness detector (`files_to_watch` + threshold)
- Specialist lifecycle hook emitter

Entrambi Agent Forge e unitAI dipenderanno da questo pacchetto. Timeline: dopo la stabilizzazione di Agent Forge v0.4.0 e unitAI v2.0. Poiché entrambi usano Bun/TS, l'estrazione è diretta senza problemi di compatibilità runtime.

### Execution Mode

Il campo `execution.mode` determina come lo specialist viene usato a runtime:

| Valore | Comportamento |
|--------|---------------|
| `skill` | Il `prompt.system` dello specialist viene scritto in `agents.md` prima dello spawn. Nessuna chiamata backend aggiuntiva. Lo specialist agisce come domain knowledge persistente. |
| `tool` | Lo specialist è invocato come operazione discreta (CLI call o MCP call). Attende la risposta, valida l'output. |
| `auto` | Il sistema decide: se sessione interattiva (pi RPC) → skill mode; se invocazione programmatica (MCP) → tool mode. **Raccomandato come default.** |

Agent Forge già implementa implicitamente il *skill mode* quando scrive il system prompt dello specialist in `agents.md` al momento dello spawn. Il campo `execution.mode: skill` lo documenta esplicitamente.

### Compatibility with Python Implementation

The existing Python `SpecialistLoader` (Pydantic) and the new TypeScript loader (Zod) read the same `.specialist.yaml` format. This means:

- Specialists created for Mercury Docker services (Python) work in Agent Forge (TS)
- Specialists created via Agent Forge CLI work in Docker containers (Python)
- The `.specialist.yaml` format is the shared contract — language-agnostic
- **Zod è l'implementazione autoritativa**: in caso di divergenza Zod/Pydantic, Pydantic si adatta

### Ruolo di MCP nell'Architettura

MCP è l'interfaccia con cui il **boss** (Claude o un orchestratore esterno) delega lavoro agli specialist. **Non è un canale di comunicazione inter-agente.**

| Contesto | Ruolo di MCP |
|----------|--------------|
| unitAI | Boss invoca `use_specialist` via MCP → specialist risponde |
| Agent Forge | Boss usa Bash tool per invocare `agent-forge spawn --specialist` |
| Mercury | Supervisor spawna la strategy suite tramite Agent Forge (non MCP) |

Il Specialist System è **indipendente da MCP**: funziona identicamente come MCP tool (unitAI), CLI command (Agent Forge), import Python (darth_feedor), o context injection (skill mode). Il campo `execution.mode: auto` permette allo stesso specialist di funzionare come tool call o skill injection a seconda del contesto.

Per orchestrazione agent-to-agent, i pattern preferiti sono: CLI subprocesses (`agent-forge spawn`), file-based communication, e SQLite mail — non MCP. MCP aggiunge overhead senza dare valore rispetto a metodi più diretti per la comunicazione inter-agente.

### Future: Continuous Specialist (Heartbeat)

In future versions, specialists can be "persistent" — running on a schedule (like CAO Flows):

```yaml
specialist:
  # ... metadata, prompt, etc.
  heartbeat:
    enabled: true
    interval: 15m
    on_wake:
      - check_inbox          # Read messages from other agents
      - check_watched_files  # Detect code changes
      - run_health_check     # Execute task_template with default query
    on_issue:
      - notify_manager       # Send message to boss agent
      - create_proposal      # Draft a fix proposal
```

This transforms specialists from passive (invoked on demand) to proactive (self-monitoring), aligning with the "office of agents" vision.

---

## 11. Specialist Lifecycle Hooks & Cost Tracking

Ogni invocazione di specialist passa attraverso 4 hook points che tracciano il ciclo completo dalla richiesta alla risposta. Il sistema fornisce observability completa, cost tracking, e audit trail.

### 11.1 Hook Points

| Hook | Fires When | Key Payload Fields |
|------|------------|--------------------|
| `pre_render` | Specialist caricato da cache, variabili template risolte | specialist_name, version, variables (keys only), backend_resolved, circuit_breaker_state |
| `post_render` | Prompt completamente renderizzato, pronto per esecuzione | prompt_hash (SHA-256), prompt_length_chars, estimated_tokens, af_status_appended |
| `pre_execute` | Prompt inviato al backend pi/RPC | backend, model, temperature, max_tokens, timeout_ms, permission_level |
| `post_execute` | Risposta ricevuta e validata | status (AF_STATUS), duration_ms, tokens_in, tokens_out, cost_usd, error? |

Tutti e 4 gli hook di una singola invocazione condividono lo stesso `invocation_id` (UUID) per correlazione. Gli hook handlers sono **fire-and-forget** — non bloccano la pipeline di esecuzione.

### 11.2 SQLite Schema — specialist_events

```sql
CREATE TABLE specialist_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  invocation_id   TEXT NOT NULL,
  hook            TEXT NOT NULL CHECK(hook IN (
    'pre_render','post_render','pre_execute','post_execute')),
  timestamp       DATETIME NOT NULL,
  specialist_name TEXT NOT NULL,
  specialist_version TEXT,
  session_id      TEXT,          -- links to sessions table
  thread_id       TEXT,          -- links to messages.thread_id
  payload         TEXT NOT NULL,  -- Full event JSON
  -- Denormalized for fast queries (evitano il parsing del JSON payload):
  backend         TEXT,
  duration_ms     INTEGER,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  cost_usd        REAL,
  status          TEXT,
  error_type      TEXT
);

CREATE INDEX idx_events_invocation ON specialist_events(invocation_id);
CREATE INDEX idx_events_specialist ON specialist_events(specialist_name, timestamp);
CREATE INDEX idx_events_session    ON specialist_events(session_id);
```

Mirror JSONL: ogni evento viene anche appeso a `.agent-forge/trace.jsonl` per debugging con `jq`/`tail -f`.

### 11.3 Cost Tracking — Pricing Table

Ogni evento `post_execute` calcola un `cost_estimate` basato su token counts e pricing table configurabile:

```typescript
const MODEL_PRICING = {
  'glm-4':           { input: 0.05,  output: 0.10  },  // $/MTok
  'gemini-2.5-lite': { input: 0.075, output: 0.15  },
  'haiku':           { input: 0.40,  output: 2.00  },
  'gemini-pro':      { input: 1.25,  output: 5.00  },
  'sonnet':          { input: 3.00,  output: 15.00 },
  'opus':            { input: 15.00, output: 75.00 },
};
```

Query di esempio — costo per specialist nelle ultime 24h:

```sql
SELECT specialist_name,
       SUM(cost_usd)      AS total_cost,
       COUNT(*)           AS invocations,
       AVG(duration_ms)   AS avg_latency_ms
FROM specialist_events
WHERE hook = 'post_execute'
  AND timestamp > datetime('now', '-24 hours')
GROUP BY specialist_name
ORDER BY total_cost DESC;
```

La pricing table è allineata con la cost hierarchy di Mercury Terminal (GLM $0.05 → Opus $15/MTok). I dati `specialist_events` sono la fonte condivisa per il cost-aware model selection dell'ecosistema.

---

## 12. Research & Inspiration

### Agent Deck (asheshgoplani/agent-deck)
- Go + Bubble Tea TUI
- 3-tier status detection: hooks -> control pipe -> content analysis
- tmux session isolation with `agentdeck_*` prefix
- SQLite persistence (WAL mode)
- Session forking for Claude (inherit conversation history)
- `session send` with `waitForAgentReady`
- tmux status-left notification bar

**Adopted**: tmux execution model, status detection via pane content, wait-for-ready pattern, session persistence.
**Not adopted**: MCP management, Go/Bubble Tea, flat agent model.

### Overstory (jayminwest/overstory)
- TypeScript/Bun, hierarchical agent orchestration
- Git worktrees for agent isolation
- SQLite mail system with typed messages (semantic + protocol)
- Watchdog daemon for health monitoring
- Capabilities-based agent hierarchy (coordinator -> supervisor -> lead -> worker)
- `sling` command for agent spawning with CLAUDE.md overlay

**Adopted (v1.0)**: SQLite for state, reconciliation concept, TypeScript/Bun runtime, CLAUDE.md overlay via session-scoped directory, typed messages table (CHECK constraint, payload JSON, priority, thread_id), stalled-agent detection (stalled_since + escalation_level).
**Deferred to v2.0**: Git worktrees per agent (useful for file-writing workers in parallel; complexity cost deferred).
**Not adopted**: Full capability hierarchy (boss/worker is sufficient for core use case), watchdog daemon (replaced by reconciliation loop Phases 1-3).

### Existing Skills (delegating + orchestrating-agents)
- Pattern-based task routing (delegating/config.yaml)
- Multi-turn protocols: collaborative (3t), adversarial (3t), troubleshoot (4t), handshake (1t)
- CLI command templates: gemini -p, qwen, ccs glm -p
- tmux+PTY workaround for CCS execution

**Migrated**: All routing patterns, protocol turn definitions, CLI command templates become agent-forge profiles and protocols.

### Specialist System (darth_feedor POC + vision docs)
- YAML-based configuration-as-code for AI task prompts
- Pydantic validation, auto-discovery (`*.specialist.yaml`), template rendering
- Production-tested in `ext-summarizer` container (24-36x iteration improvement)
- Volume-mounted hot-reload without Docker rebuilds
- Vision: "Office of Agents" with Brain (specialist YAML) + Body (CAO/tmux infrastructure)
- CAO integration: Handoff (sync), Assign (async), Inbox system, Watchdog, Flows
- Proactive heartbeat agents, inter-agent social protocol, staleness detection

**Adopted**: .specialist.yaml format, Zod re-implementation of Pydantic schema, 3-scope discovery, staleness detection, Brain+Body architecture, skill-to-specialist promotion.
**Deferred**: Heartbeat/Flow system (future version), vector memory, full CAO integration.
**Not adopted**: Python as primary runtime (TS instead), CAO REST API (direct tmux instead).

### CLI Agent Orchestrator / CAO (awslabs)
- Python + FastAPI REST orchestrator for tmux-isolated agents
- Handoff (sync) and Assign (async) patterns
- Inbox system with Watchdog-based IDLE detection
- Flow system with cron scheduling + conditional scripts
- MCP integration via FastMCP

**Adopted**: Handoff/Assign concepts (as spawn + protocol patterns), Inbox concept (as message bus), IDLE detection via pane content.
**Not adopted**: REST API layer (overkill for local tool), FastMCP integration (Agent Forge is CLI-first).
