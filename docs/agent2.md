# Agent 2 Research: jean + agentpipe

**Research date**: 2026-02-27
**Researched by**: Claude Sonnet 4.6 (agent2)
**Purpose**: Evaluate jean and agentpipe for applicability to Agent Forge's TUI/execution architecture decisions

---

## Executive Summary

- **jean is not what the PRD description implies.** It is a Tauri-based native desktop application (macOS-first) for managing Claude CLI sessions across git worktrees. It has no external API, no web dashboard, no embeddability, and no real-time monitoring features relevant to Agent Forge. It cannot serve as a localhost monitoring dashboard. Its HTTP server with WebSocket support is listed as a future roadmap item, not a current feature.

- **agentpipe is a meaningful technical reference, but solves a different problem.** It orchestrates multi-agent *conversations* (AI-to-AI debates) rather than delegating *tasks* from a boss agent to worker agents. Its direct process spawning via `os/exec` is a legitimate alternative to tmux, but comes with its own fragilities (orphaned processes, CLI version drift, no persistent sessions). Its JSONL streaming bridge and Prometheus metrics exposure are the most directly useful patterns for Agent Forge.

- **tmux remains the right execution layer for Agent Forge.** Its core value — process persistence that survives orchestrator crashes — is Agent Forge's explicit design requirement ("if the forge process dies, agents continue in tmux"). No alternative offers this without adding a daemon process. Agentpipe's direct spawning loses running agents when the orchestrator exits. Jean's detached-process pattern is closer but platform-specific.

- **The Ink TUI is the right choice for v0.3.0**, but Agent Forge should plan a localhost web UI as a v2.x option (not a replacement). The Mercury Terminal's requirement for real-time market data visualization (quoteboard, correlation matrix) will eventually exceed what a terminal TUI can deliver elegantly. A localhost web UI with WebSocket push would be composable and additive to the CLI/TUI stack.

- **agentpipe's JSONL bridge pattern should be adopted.** Agent Forge should emit structured JSONL events (session started, message sent, agent status changed, turn completed, session killed) to stdout and/or a file socket. This provides observability for any future web UI without coupling to one.

---

## jean (coollabsio) — Deep Analysis

### What jean actually is

Jean is a **native desktop GUI application** built with Tauri v2 (Rust backend + React 19 frontend). It is billed as "your AI dev team, parallelized" and solves the problem of managing multiple concurrent Claude CLI sessions across git worktrees.

Key operations jean automates:
- Creating and archiving git worktrees (isolated branch environments)
- Spawning detached Claude CLI processes per worktree
- Streaming Claude's NDJSON output via file-tailing, emitting events to the UI
- GitHub integration (issue/PR investigation, PR creation, commit message generation)
- Magic commands (Cmd+K menu): commit, push, open PR, code review, merge, resolve conflicts

The "agent pipeline visualization" framing in the PRD research brief is inaccurate. Jean does not visualize agent pipelines. It provides a GUI development environment for a single developer using Claude as an AI coding assistant across multiple branches simultaneously.

**Current status**: v0.1.24 (as of Feb 2026), 461 GitHub stars, macOS primary platform. Linux/Windows in progress.

### Tech Stack & Architecture

Three-tier Tauri architecture:

| Tier | Technology | Role |
|------|-----------|------|
| Presentation | React 19, TypeScript, Tailwind CSS v4, shadcn/ui v4 | Desktop window UI |
| Business Logic | TypeScript | State management (Zustand v5, TanStack Query) |
| System Operations | Rust + Tauri v2 IPC | Process spawning, file I/O, Git, CLI integration |

Frontend communication with Rust backend is exclusively through Tauri's IPC:
- `invoke()` — command-response pattern for synchronous/async operations
- `listen()`/`emit()` — event streaming pattern for real-time updates

Notable UI components: xterm.js (integrated terminal), CodeMirror 6 (editor), chart primitives (diff viewer).

### Real-time Capabilities

Jean handles Claude output streaming via a **file-tailing pattern** rather than direct pipe streaming:

1. Claude CLI is spawned as a fully detached process (survives jean closing)
2. Claude writes NDJSON (`--output-format stream-json`) to a disk file
3. `tail_claude_output` polls the file, parses each new line by type
4. Rust backend emits Tauri events to the React frontend:
   - `chat:chunk` — text content block
   - `chat:tool_use` — tool invocation by Claude
   - `chat:tool_result` — tool output
   - `chat:thinking` — extended thinking phase
   - `chat:done` — completion + token usage
   - `chat:error` / `chat:cancelled` — failure states
   - `chat:compacted` — context window compaction event

Frontend `useStreamingEvents` hook dispatches these events to `useChatStore`, which updates the React state and re-renders the `StreamingMessage` component.

This pattern is directly applicable to Agent Forge's agent output streaming — but jean does it per-worktree for a single user, not across a fleet of agents.

### API / Integration Surface

**There is no external API today.** All communication is Tauri IPC (desktop-internal only).

README roadmap item: "Add remote access support through an API" — not implemented.

The README *does* mention "Built-in HTTP server with WebSocket support, token-based auth, web browser access" as a feature, but deepwiki research confirms this is either aspirational copy or a very early/undocumented implementation. No endpoints are exposed in the current codebase per research.

**Conclusion**: jean cannot be used as a remote monitoring endpoint for Agent Forge today, and won't be for at least several release cycles.

### Data Models (sessions, pipelines, agents?)

Jean's core data types (from `src-tauri/src/` and `src/`):

**Project** — a git repository added to jean:
```
id, name, path, default_branch, parent_id (for folder org), is_folder, added_at
```

**Worktree** — an isolated git worktree for a branch:
```
id, project_id, name, path, branch, created_at, setup_output,
session_type (Worktree | Base), pr_number, pr_url,
cached_behind_count, cached_ahead_count, cached_unpushed_count
```

**Session** — a chat conversation within a worktree:
```
id, name, messages[]
```

There is no concept of "agent fleet," "pipeline," "protocol," or "boss/worker" in jean's data model. The mental model is: one developer, multiple branches, one Claude instance per branch.

### Self-hostable / Localhost Fit

**Not applicable.** Jean is a desktop application. It cannot be:
- Served as a web page
- Run headless as a daemon
- Embedded as a component in another tool
- Accessed from a different machine

The React frontend is tightly coupled to Tauri `invoke()` calls throughout — extracting it for browser use would require rewriting every backend interaction.

### Verdict: Could this replace/complement Ink TUI?

**No, and not even close.** Jean is the wrong product category entirely.

Jean is a developer productivity desktop app for managing Claude-driven coding workflows across git branches. Agent Forge is a CLI/TUI orchestrator for multi-agent task delegation. The overlap is: both use Claude CLI and care about streaming output.

**What Agent Forge can learn from jean:**
1. The **file-tailing NDJSON pattern** for reading Claude output is more robust than capturing raw tmux pane content — pane capture can lose output if scrollback overflows.
2. **Detached process pattern**: Jean spawns Claude as a process that survives the parent application dying. This is directly analogous to "if the forge process dies, agents continue in tmux" — but jean achieves it without tmux.
3. **Event taxonomy**: `chat:chunk`, `chat:tool_use`, `chat:done` is a clean event model for streaming agent output to any UI consumer.

---

## agentpipe (kevinelliott) — Deep Analysis

### What agentpipe actually is

AgentPipe is a **Go CLI/TUI application** for orchestrating multi-agent AI *conversations* — structured dialogues where multiple AI tools (Claude, Gemini, Qwen, etc.) talk to each other in a shared "room."

Key distinction from Agent Forge: agentpipe orchestrates peer-to-peer agent conversation (round-robin, reactive, free-form), not hierarchical task delegation (boss assigns work to workers). There is no boss/worker model. All agents are conversation participants.

Current state: v0.6.0+, MIT license, Go 1.24+, 15+ supported agent types including API-native (OpenRouter) and CLI-native (Claude, Gemini, Amp, Qoder, etc.).

### Pipeline Architecture

AgentPipe's "pipeline" concept is a conversation orchestrator, not a task pipeline:

**Config struct** (YAML schema):
```yaml
version: "1.0"
agents:
  - id: agent1
    type: "claude"
    name: "Alice"
    prompt: "You are a skeptical security reviewer"
    model: "claude-sonnet-4-5"
    temperature: 0.7
    max_tokens: 2000
    rate_limit: 1.0
    rate_limit_burst: 2

orchestrator:
  mode: "round-robin"     # | reactive | free-form
  max_turns: 10
  turn_timeout: 30s
  response_delay: 1s
  initial_prompt: "Let's discuss the API design"
  summary:
    enabled: true
    agent: "gemini"

logging:
  enabled: true
  chat_log_dir: "~/.agentpipe/chats"
  log_format: "text"
  show_metrics: false

bridge:
  enabled: false
  url: "https://agentpipe.ai"
  api_key: "your-key"
  timeout_ms: 10000
  retry_attempts: 3
```

The `Orchestrator` manages conversation flow. It maintains a shared `messages []Message` history that all agents receive (filtered to exclude their own prior messages). The structured three-part prompt per agent:
1. **AGENT SETUP** — agent's role/system prompt
2. **YOUR TASK** — current objective from orchestrator
3. **CONVERSATION SO FAR** — filtered message history from other agents

### Execution Mechanism (tmux? process spawning? other?)

**No tmux. Direct process spawning via `os/exec.Command`.**

Two execution mechanisms:

**CLI-Based Adapters** (most agents):
- `exec.CommandContext(ctx, "claude", args...)` — spawns CLI tool directly
- `cmd.StdoutPipe()` for streaming output line-by-line
- `cmd.CombinedOutput()` for non-streaming
- Each invocation is a fresh process — no persistent session
- Requires CLI tools installed in `$PATH`

**API-Based Adapters** (OpenRouter):
- Direct HTTP API calls bypassing CLI entirely
- Lower latency, real token counts
- No local installation required

**Critical architectural implication**: When agentpipe exits, all agent processes it spawned die with it. There is no session persistence. This is the opposite of Agent Forge's explicit design requirement (agents survive orchestrator death via tmux).

### Data Flow Between Agents

Messages flow through the `Orchestrator.messages` slice (thread-safe via `sync.RWMutex`). Before each agent turn:
1. `filterRelevantMessages()` — removes the agent's own prior messages
2. `buildPrompt()` — constructs the three-part structured prompt
3. Agent's `SendMessage()` is called with the prompt
4. Response is appended to `messages` with `ResponseMetrics` (tokens, cost, duration)

The Amp CLI adapter uses "smart filtering" — sends only messages from other agents since the last Amp response, reducing context sent by 50-90%.

### Lifecycle & Failure Handling

**Agent lifecycle:**
1. Initialize with `AgentConfig`
2. `IsAvailable()` — check CLI binary in PATH
3. `HealthCheck()` — run minimal test command (skippable with `--skip-health-check`)
4. Run in orchestrator loop until max_turns or error

**Failure handling:**
- Retry logic with exponential backoff: configurable `MaxRetries`, `RetryInitialDelay`, `RetryMaxDelay`, `RetryMultiplier`
- On exhausted retries: log error, emit `conversation.error` bridge event, continue with other agents
- `TurnTimeout` via `context.DeadlineExceeded` — catches hung agents
- `ErrorRecoveryMiddleware` — catches panics in middleware pipeline, converts to errors
- Rate limiting via token bucket (`limiter.Wait(ctx)`) per agent
- `RecordRateLimitHit` metric on rate limit events

**What is not handled:**
- Zombie processes (especially `cursor-agent` which requires explicit termination)
- Interactive prompts from CLI tools that don't accept non-interactive input
- CLI version drift breaking output parsing
- Session state recovery after agentpipe crash (no persistence layer)

**Observability surface (strong):**
- Prometheus metrics on port 9090: `/metrics`, `/health`
- 10+ metric types: `agentpipe_agent_requests_total`, `agentpipe_agent_tokens_total`, `agentpipe_agent_cost_usd_total`, `agentpipe_active_conversations`, etc.
- JSONL bridge: streaming events to `agentpipe.ai` or `--json` to stdout

**Event Streaming Bridge** — this is the most reusable pattern:
```
Event types:
  bridge.connected        → system info on connect
  conversation.started    → participants, mode, initial_prompt
  message.created         → agent_id, content, tokens, cost, duration
  conversation.completed  → status, total stats, AI summary
  conversation.error      → error_message, error_type, agent_type
  log.entry               → diagnostic logs (with --json flag)
```
Bridge is disabled by default, privacy-first, API key never logged.

### Comparison to Agent Forge's tmux model

| Dimension | Agent Forge (tmux) | agentpipe (direct spawn) |
|-----------|-------------------|--------------------------|
| Process persistence | Yes — tmux sessions survive orchestrator death | No — spawned procs die with orchestrator |
| Session recovery | `agent-forge attach` reconnects | No recovery mechanism |
| Human intervention | `t` key → drop into tmux pane | No — fully automated |
| Output capture | `tmux capture-pane` + `pipe-pane` | `StdoutPipe()` + file logging |
| Status detection | Regex on pane content | Not needed (blocks on response) |
| Multi-agent model | Boss/worker hierarchy | Peer conversation |
| Protocol definition | Declarative YAML turns | Conversation modes (round-robin etc.) |
| Structured events | Not yet | Yes (JSONL bridge + Prometheus) |

### Verdict: What to Adopt

**Do not adopt agentpipe's execution model for Agent Forge.** The core incompatibility is process persistence. Agent Forge's "if the forge process dies, agents continue in tmux" is a first-class requirement — it is what makes tmux the right execution primitive.

**Do adopt from agentpipe:**

1. **JSONL event bridge pattern** — emit structured events for each session lifecycle change. This is a cheap 1-2 day implementation that unlocks future web UI without coupling to one.

2. **Prometheus metrics endpoint** — expose `/metrics` at `localhost:9090`. Agent Forge already has a structured session store (SQLite); exposing active session count, message counts, and task durations as Prometheus metrics is straightforward.

3. **`--json` flag for JSONL stdout** — useful for CI/CD integration, scripting, and future web UI consumers.

4. **Health check pattern** — agentpipe's `HealthCheck()` per agent type maps well to `agent-forge profile test <agent>`.

5. **Message `ResponseMetrics`** — augment Agent Forge's message schema with token counts and costs (where the CLI exposes them).

---

## tmux vs Alternatives — Evaluation

### tmux Strengths for Agent Forge

1. **Process isolation and persistence**: tmux sessions are kernel-managed. When `agent-forge` crashes, Claude/Gemini/Qwen continue working. `agent-forge attach` reconnects. This is a fundamental correctness requirement.

2. **Human intervention path**: The `t` keybinding (tmux pass-through) gives a human direct keyboard access to the agent's terminal when needed — for authentication, confirmation prompts, or debugging. No alternative provides this.

3. **Universal**: All AI CLI tools work in tmux. No per-tool adapters needed.

4. **Existing tooling**: `tmux pipe-pane` for continuous log capture, `tmux send-keys` for injection, `tmux capture-pane` for status detection — these are stable, composable primitives.

5. **Status bar integration**: `tmux set-option -g status-right "..."` lets Agent Forge show session count/status in the user's existing tmux status bar without any additional infrastructure.

### tmux Weaknesses / Fragilities

1. **Regex-on-pane-content is fragile**: The `waitForReady()` function in the PRD polls `tmux capture-pane` and runs regex against the last 5 lines. This breaks if:
   - An agent changes its prompt character across versions
   - Color codes corrupt the regex match
   - The agent outputs a busy-pattern string while actually idle (false positive)
   - High-volume output causes lines to scroll out of the capture window

2. **`tmux send-keys` injection is not an API**: Sending keys to a terminal emulator is inherently lossy. If the agent is mid-output when keys arrive, injection may interleave with existing content. No backpressure, no acknowledgment.

3. **No structured output**: tmux capture-pane returns raw terminal content (with escape codes). Parsing agent output requires per-agent heuristics. Compare to agentpipe's `StdoutPipe()` which delivers raw bytes, or jean's NDJSON file-tail.

4. **Scrollback limit**: With default scrollback of 10,000 lines, a long-running agent can push early output out of the capture buffer. The log file (`tmux pipe-pane`) mitigates this but adds another failure mode.

5. **tmux version drift**: `tmux capture-pane -J` (join wrapped lines) behavior changed across versions. Scripts must handle version differences.

6. **Platform availability**: tmux is not natively available on Windows. This is acceptable for now (Agent Forge targets Linux/macOS) but limits future reach.

### agentpipe's Alternative: Pros/Cons

**Pros:**
- Structured output via `StdoutPipe()` — no regex parsing of terminal content
- Cleaner failure handling (retry + backoff + error metrics)
- Works cross-platform (no tmux dependency)
- API-based adapters avoid CLI installation entirely

**Cons:**
- No session persistence — agents die with orchestrator
- No human intervention path — no equivalent of tmux pass-through
- No interactive agent support — blocked agents (waiting for human input) hang
- Fresh process per invocation — no session continuity for agents that rely on conversational context (Claude's `--resume` flag maps to tmux session, not to a direct spawn)

### Recommendation: Keep tmux, Harden the Fragilities

**Keep tmux as the execution layer.** The persistence and human-intervention requirements are non-negotiable for Agent Forge.

**But address the fragilities:**

1. **Add structured output channel alongside tmux**: When an agent supports it, prefer NDJSON-to-file (jean's pattern) over pane content regex. Reserve regex detection only for "is agent ready?" — not for content extraction.

2. **Harden ready detection**: Use a multi-signal approach:
   - Primary: tmux pane regex (current)
   - Fallback: wall-clock timeout (current)
   - Add: dedicated sentinel file (`~/.agent-forge/ready/<session-id>`) that agents write when they enter their ready state — this decouples detection from terminal rendering.

3. **Versioned regex patterns**: Store `ready_patterns` with `tmux_version` metadata in profiles. Add `agent-forge profile test <agent>` to validate patterns against a live session.

4. **Cap output capture by log file, not pane**: Prefer reading from the log file (`session.log_file`) for full content; use `capture-pane` only for status detection. This eliminates scrollback truncation.

---

## localhost Web UI — Evaluation

### Can jean serve as Agent Forge monitoring UI?

**No.** Jean is a desktop application. It has no HTTP endpoints, no embeddable components, no external API. Using jean as a monitoring dashboard would require:
- Installing a Tauri app and a Rust toolchain
- Hacking into its internal Tauri IPC
- Forking and rewriting the entire frontend

This is not viable.

### Integration Architecture Proposal (if a web UI were built)

If Agent Forge were to offer a localhost web UI, the natural architecture would be:

```
Agent Forge (existing)
  └─ SQLite session store
  └─ tmux manager
  └─ Message bus

  +-- NEW: Event Emitter (JSONL bridge, like agentpipe)
       ├─ stdout (--json flag for headless/CI)
       └─ WebSocket server (localhost:7000)
            └─ Web UI (browser, React/Svelte)
                 ├─ Fleet panel (agent status, roles)
                 ├─ Active agent output stream
                 ├─ Message log (inter-agent)
                 ├─ Protocol state (turn visualization)
                 └─ Mercury panels (market data, quoteboard)
```

The JSONL bridge is the key insertion point. Once Agent Forge emits structured events, any UI can subscribe — the Ink TUI, a web UI, a Grafana dashboard, a custom Mercury Terminal widget.

**Event schema proposal** (extending agentpipe's bridge pattern):
```json
{ "type": "session.started",   "ts": "...", "session_id": "...", "agent": "claude", "role": "boss", "task": "..." }
{ "type": "session.status",    "ts": "...", "session_id": "...", "status": "working" }
{ "type": "message.sent",      "ts": "...", "from": "claude", "to": "gemini", "content": "..." }
{ "type": "message.received",  "ts": "...", "from": "gemini", "content": "...", "tokens": 847 }
{ "type": "protocol.turn",     "ts": "...", "protocol": "collaborative", "turn_id": "design", "status": "ok" }
{ "type": "session.ended",     "ts": "...", "session_id": "...", "reason": "completed" }
```

### Comparison: Ink TUI vs localhost Web UI for Mercury Terminal

| Dimension | Ink TUI (planned v0.3.0) | localhost Web UI (hypothetical v2.x) |
|-----------|--------------------------|--------------------------------------|
| Real-time data | tmux capture-pane polling (2-5s lag) | WebSocket push (sub-100ms) |
| Market data viz | Text-only (quoteboard as ASCII table) | Canvas/SVG charts, color-coded heatmaps |
| Multi-session view | Multiple panels in terminal | Browser tabs, tiled windows |
| Composability | Mercury wraps agent-forge process | Mercury opens localhost:7000 alongside |
| Installation | Zero (npm package, terminal) | Minimal (same npm package + browser) |
| Mouse support | None planned until v1.2.0 | Native browser interaction |
| Latency | Acceptable for agent monitoring | Required for real-time tick data |
| tmux pass-through | Yes (core feature via `t` key) | No direct equivalent |
| Keybinding-driven | Yes | Optional |
| Mercury status bar | Yes (tmux status-right integration) | N/A (separate browser window) |

**Mercury Terminal specifics:**
- Quoteboard (real-time bid/ask, last trade): requires sub-second updates — Ink TUI can do this but ASCII tables are limiting. A web UI canvas quoteboard would be significantly better.
- Correlation matrix: 10x10 matrix with color encoding — possible in terminal with ANSI colors, but web canvas is clearly superior.
- Volatility metrics: similar — web charts win on density and clarity.
- Agent output streaming: both handle this equally well.
- Multi-session parallel monitoring: Ink TUI is limited by terminal width/height. Browser tabs or tiled panes handle this better.

**Conclusion**: The Ink TUI is fully adequate for v0.3.0 and correctly prioritized. But Mercury Terminal will hit the ceiling of terminal visualization for financial data by v1.x. Planning for a web UI as a composable Layer 4 option (not a replacement) starting at v2.0.0 is the right decision.

### Recommendation

1. **Ship Ink TUI at v0.3.0 as planned.** It is the right choice for the core orchestration use case.

2. **Add JSONL bridge at v0.6.0 or v1.0.0** (alongside "Resilience & Polish"). This is a small implementation investment that makes everything else possible.

3. **Plan localhost web UI for v2.x** as an additive Layer 4 option. It should not replace the TUI — it should complement it for use cases where Mercury Terminal needs financial data visualization that exceeds terminal rendering capability.

4. **The web UI does not need to be a separate project.** It can be a small Vite-built React app bundled with the npm package, served by a lightweight built-in HTTP server when `agent-forge tui --web` is passed. The same JSONL events feed both the Ink TUI and the web UI.

---

## PRD Fragility Analysis

### Fragility 1: Ready Detection via Regex on Pane Content

**Description**: `waitForReady()` polls `tmux capture-pane` and applies regex against the last 5 terminal lines. This is fragile: terminal escape codes can corrupt matches, agent prompt strings change across CLI versions, scrollback fills with output on verbose agents, and there's no signal-vs-noise separation.

**PRD Section**: Section 4, "Wait-for-Ready" / Section 2, Profile `detection.ready_patterns`

**Proposed Fix**: Add a `detection.method` field to profiles with values `regex_pane` (current default) and `sentinel_file`. Sentinel file method: the agent startup wrapper script `touch ~/.agent-forge/ready/${SESSION_ID}` when it reaches its prompt. Agent Forge watches for this file with `chokidar`. Fall back to regex if sentinel is not written within `detection.poll_interval_ms * 10`. This eliminates the primary failure mode for agents that support wrapper scripts.

### Fragility 2: No Structured Output Channel

**Description**: Agent output is captured via `tmux capture-pane` (snapshot) or `pipe-pane` (log stream). Both deliver raw terminal content with ANSI escape codes. Parsing structured data from this is error-prone. The PRD has no provision for agents that emit structured JSON (Claude's `--output-format stream-json`, agentpipe's JSONL bridge).

**PRD Section**: Section 4, "Read Protocol" / Section 3, Log Files

**Proposed Fix**: Add `output_format: json | text` to the profile schema. When `json`, Agent Forge tails the output log and parses NDJSON, emitting typed events (`content_block`, `tool_use`, `thinking`, `done`) rather than raw text. This is exactly what jean implements and enables clean status detection without regex.

### Fragility 3: No Resilience for `tmux send-keys` Race Condition

**Description**: `sendToAgent()` calls `waitForReady()` then immediately calls `tmux.sendKeys()`. If the agent transitions from ready to busy between these two calls (race condition), the injected message may interleave with mid-output content. The PRD doesn't address this.

**PRD Section**: Section 4, "Send Protocol"

**Proposed Fix**: Add a `post-send verification` step: after `send-keys`, wait 200ms then capture pane and verify the injected message appears in the buffer. If the agent's output resumed before injection completed (detected by busy_pattern matching), retry the send. Add `max_send_retries: 3` to the profile `detection` block.

### Fragility 4: SQLite + tmux Dual-Truth Without Atomic Transactions

**Description**: The PRD states "tmux is truth for liveness, SQLite is truth for semantics." The 5-second reconciliation loop marks orphaned sessions as "zombie." But between reconciliation cycles, there's a 5-second window where SQLite shows a session as `working` while the tmux session is already dead. Messages sent in this window are silently dropped.

**PRD Section**: Section 3, "State Reconciliation"

**Proposed Fix**: Reduce reconciliation interval to 1 second for sessions in `working` state. Add `last_seen_alive_at` timestamp to the sessions table (updated every reconciliation cycle). Before any `sendToAgent()`, check `last_seen_alive_at` freshness (must be within 2s) before acquiring send lock. If stale, trigger immediate reconciliation.

### Fragility 5: No Event Bus — TUI Has No Real-time Push

**Description**: The TUI panels update by polling (every 2-5s for Fleet, tmux capture-pane for Active Agent). There is no push mechanism — the TUI cannot be notified immediately when an agent transitions from `working` to `idle`. This creates latency in the Fleet panel and can miss rapid status changes.

**PRD Section**: Section 7, "Panels" — Update mechanism column

**Proposed Fix**: Implement an in-process event emitter (Node.js `EventEmitter` or similar) in the orchestrator. Emit events on status transitions, message received, protocol turn completion. The TUI subscribes to these events and updates immediately rather than polling. This is the same pattern jean uses internally and is the foundation for the JSONL bridge.

### Fragility 6: No Handling for Interactive Agent Prompts

**Description**: Several AI CLIs display interactive confirmation prompts ("Do you want to proceed? [y/n]"). If an agent encounters one of these, Agent Forge's `waitForReady()` will never fire because the prompt is not the expected ready pattern. The session hangs until `turn_timeout`.

**PRD Section**: Section 2, Profile `detection` — missing `interaction_patterns`

**Proposed Fix**: Add `detection.interaction_patterns` to profiles — regex patterns that indicate the agent is waiting for human input (e.g., `"\\[y/N\\]"`, `"Press Enter to continue"`). When matched, Agent Forge emits a `session.needs_input` event and transitions the session to a new `waiting_for_input` state. The TUI displays a yellow indicator and the human can use the `t` tmux pass-through to respond.

---

## Direct PRD Improvement Recommendations

1. **Add `output_format: json | text` to all profiles.** Claude supports `--output-format stream-json`. Prefer structured JSON output over regex-on-terminal for any agent that supports it. This halves the implementation complexity of status detection and output capture.

2. **Add a JSONL event bridge at v0.6.0.** Emit structured events (session.started, message.sent, session.status, protocol.turn, session.ended) to stdout with `--json` flag and optionally to a WebSocket server. Model directly on agentpipe's bridge. Cost: 1-2 days implementation. Value: unlocks observability, future web UI, and CI/CD integration.

3. **Add `detection.interaction_patterns` to the profile schema.** Handle the case where an AI CLI pauses for human confirmation. Transition to `waiting_for_input` state with TUI indicator. Prevents silent hangs on agents that prompt for approval.

4. **Add Prometheus `/metrics` endpoint at v1.0.0.** Expose: `agent_forge_active_sessions`, `agent_forge_messages_total`, `agent_forge_protocol_turns_total`, `agent_forge_session_errors_total`. Model on agentpipe's 10 metric types. Required for Mercury Terminal's operational visibility.

5. **Add `detection.method: sentinel_file | regex_pane` to profiles.** The sentinel file pattern (agent writes a file when ready, Agent Forge watches it) is more reliable than terminal regex for agents that support it. Make it opt-in per profile.

6. **Add `post_send_verify: true` to the `tmux` profile block.** After `send-keys`, verify the injected content appears in the pane within 200ms. Retry up to `max_send_retries` times. This closes the race condition in the send protocol.

7. **Plan v2.0.0 localhost web UI as additive Layer 4.** The Ink TUI is correct for v0.3.0. Plan a browser-based UI for Mercury Terminal's financial data visualization needs (quoteboard, correlation matrix, volatility charts). Architecture: small Vite/React app bundled with npm package, served by built-in HTTP server when `--web` flag is passed, fed by the same JSONL event bridge.

8. **Separate "agent output content" from "agent status detection."** The PRD currently uses `capture-pane` for both status detection and content display. These should be separate code paths: status detection via sentinel or pane regex (lightweight, frequent), content display via log file tail (complete, persistent). This prevents the `capture-pane` call from blocking the status loop.

9. **Add `turn_timeout` to the protocol YAML schema.** Currently `turn_timeout` is in agentpipe's OrchestratorConfig. Agent Forge's protocol YAML (Section 5) has per-turn `wait_for: ready` but no timeout per turn. Add `timeout_ms: 60000` to each turn definition to prevent a hung agent from blocking an entire protocol execution.

10. **Add conversation persistence to agentpipe-style `--save-state` flag.** Agent Forge's session store (SQLite) already tracks messages, but there is no export format. Add `agent-forge export <session-id> --format json|md` command. Useful for post-mortem analysis of protocol runs and for feeding context back into future sessions.

---

## Sources & Files Read

### Jean (coollabsio/jean)
- https://github.com/coollabsio/jean (README via WebFetch)
- https://raw.githubusercontent.com/coollabsio/jean/main/src-tauri/src/chat/claude.rs (source via WebFetch)
- DeepWiki wiki structure: https://deepwiki.com/wiki/coollabsio/jean
- DeepWiki Q&A: What is jean exactly? (7d3569d0)
- DeepWiki Q&A: Remote HTTP API / WebSocket? (20fafe6f)
- DeepWiki Q&A: Real-time streaming / event types? (d3a90ca8)
- DeepWiki Q&A: Self-hostable / localhost fit? (0593dcb0)
- DeepWiki Q&A: Core data models? (96752c0e)
- DeepWiki Q&A: Event system / concurrent worktrees? (76838acd)
- DeepWiki Q&A: Frontend frameworks + standalone web app? (f0c9b5be)
- DeepWiki Q&A: HTTP server with WebSocket? (7974f35f)
- DeepWiki Q&A: Magic commands / context management? (ffabdd82)
- DeepWiki Q&A: Claude CLI vs tmux comparison? (f169b327)

### AgentPipe (kevinelliott/agentpipe)
- https://github.com/kevinelliott/agentpipe (README via WebFetch)
- https://raw.githubusercontent.com/kevinelliott/agentpipe/main/pkg/config/config.go (source via WebFetch)
- https://raw.githubusercontent.com/kevinelliott/agentpipe/main/internal/bridge/events.go (source via WebFetch)
- https://raw.githubusercontent.com/kevinelliott/agentpipe/main/pkg/orchestrator/orchestrator.go (source via WebFetch)
- https://raw.githubusercontent.com/kevinelliott/agentpipe/main/pkg/agent/agent.go (source via WebFetch)
- https://raw.githubusercontent.com/kevinelliott/agentpipe/main/pkg/tui/enhanced.go (source via WebFetch)
- DeepWiki wiki structure: https://deepwiki.com/wiki/kevinelliott/agentpipe
- DeepWiki Q&A: Execution mechanism / tmux? (ca1f4eaf)
- DeepWiki Q&A: Pipeline schema / YAML config? (7ab00769)
- DeepWiki Q&A: TUI layout / multi-agent display? (20bc92bc)
- DeepWiki Q&A: Agent lifecycle / failure handling? (c361edbe)
- DeepWiki Q&A: Event streaming bridge / Prometheus? (a744e346)
- DeepWiki Q&A: Agent registry schema? (582ecb72)
- DeepWiki Q&A: AgentPipe vs tmux comparison? (910e4811)
- DeepWiki Q&A: Web UI / agentpipe.ai? (c1a2e6ef)
- DeepWiki Q&A: Weaknesses of direct process spawning? (ff97a492)
- DeepWiki Q&A: Boss/worker hierarchical model support? (9b4e4929)

### Agent Forge PRD
- /home/jagger/projects/agent-forge/docs/PRD.md (full read, sections 1-10)

---

## CHALLENGE RUN

**Challenge date**: 2026-02-27
**Challenged by**: Adversarial research agent
**Purpose**: Critically challenge every major finding in the original report using deepwiki verification and WSL2-specific research

---

### Jean NDJSON Pattern — Independent Value Assessment

**VERIFIED: The NDJSON pattern is highly adoptable independent of Jean.**

Deepwiki verification of jean's NDJSON event schema confirms the original report accurately identified the event types, but **understated the pattern's independent value**:

**Verified Event Schema** (from `src-tauri/src/chat/claude.rs` and TypeScript interfaces):
- `chat:chunk` — `{ session_id, worktree_id, content }` — streaming text content
- `chat:tool_use` — `{ session_id, worktree_id, id, name, input, parent_tool_use_id? }` — tool invocation
- `chat:tool_block` — `{ session_id, worktree_id, tool_call_id }` — tool block marker
- `chat:thinking` — `{ session_id, worktree_id, content }` — extended thinking content
- `chat:tool_result` — `{ session_id, worktree_id, tool_use_id, output }` — tool execution output
- `chat:permission_denied` — `{ session_id, worktree_id, denials[] }` — tools requiring approval
- `chat:done` — `{ session_id, worktree_id }` — completion signal
- `chat:error` — `{ session_id, worktree_id, error }` — error state
- `chat:cancelled` — `{ session_id, worktree_id, undo_send }` — user cancellation
- `chat:compacted` — `{ session_id, metadata: { trigger } }` — context compaction

**Key Finding**: The Rust structs emit these events via `tail_claude_output` which polls Claude's NDJSON output file. The frontend's `useStreamingEvents` hook consumes them via Tauri's IPC `listen()` pattern.

**Conclusion**: The file-tailing NDJSON pattern is **completely decoupled from Jean's desktop UI**. Agent Forge can adopt this pattern by:
1. Spawning Claude with `--output-format stream-json`
2. Tailing the output file (not tmux pane capture)
3. Parsing NDJSON lines by type
4. Emitting typed events to an in-process EventEmitter
5. Feeding both the Ink TUI and any future web UI from the same event stream

**The original report was correct but conservative**: This pattern should be adopted at v0.6.0 (not v2.x) as it halves the complexity of status detection and output capture.

---

### Agentpipe Prometheus Metrics — Verified / Hallucination?

**VERIFIED: Prometheus metrics on :9090 are REAL, not hallucinated.**

Deepwiki verification confirms agentpipe exposes Prometheus metrics on port 9090 as claimed:

**Verified Metrics Endpoint** (from `pkg/metrics/server.go`):
- `/metrics` — Prometheus metrics in OpenMetrics format
- `/health` — Health check endpoint
- `/` — Web UI with documentation

**Verified Metric Names** (10 metrics exposed):
1. `agentpipe_agent_requests_total` — counter by agent, type, status
2. `agentpipe_agent_request_duration_seconds` — histogram for request durations
3. `agentpipe_agent_tokens_total` — counter for token usage (input/output)
4. `agentpipe_agent_cost_usd_total` — counter for estimated costs in USD
5. `agentpipe_agent_errors_total` — counter for errors by type
6. `agentpipe_active_conversations` — gauge for current active conversations
7. `agentpipe_conversation_turns_total` — counter for total turns by mode
8. `agentpipe_message_size_bytes` — histogram for message size distribution
9. `agentpipe_retry_attempts_total` — counter for retry attempts
10. `agentpipe_rate_limit_hits_total` — counter for rate limit hits

**Verified JSONL Event Bridge** (7 event types from `internal/bridge/events.go`):
1. `bridge.connected` — system info on connect
2. `conversation.started` — participants, mode, initial_prompt, command details
3. `message.created` — agent_id, content, tokens, cost, duration_ms
4. `conversation.completed` — status, total stats, AI summary
5. `conversation.error` — error_message, error_type, agent_type
6. `bridge.test` — test message with system info
7. `log.entry` — diagnostic logs (with `--json` flag)

**Conclusion**: The original report's claims about agentpipe's observability surface are **fully verified**. This is not hallucination — it's a well-documented feature added in v0.0.16.

---

### WSL2 + tmux Specific Issues

**CRITICAL GAP: The original report completely ignores WSL2-specific tmux issues.**

Deepwiki and web research reveals **four WSL2-specific issues** that directly impact Agent Forge's resilience claims:

**Issue 1: /tmp Directory Flushed on WSL Shutdown**
- **Problem**: WSL flushes `/tmp` on shutdown, deleting tmux socket files (`/tmp/tmux-<uid>/default`)
- **Impact**: `error connecting to /tmp/tmux-<uid>/default (No such file or directory)` after WSL restart
- **Agents survive tmux server death?** Yes — but only if the tmux server process itself survives. If WSL shuts down, all processes die regardless.
- **Workaround**: Change tmux socket path to persistent location:
  ```bash
  # ~/.tmux.conf
  set -g socket-path ~/.tmux/tmux
  ```

**Issue 2: Orphaned Processes When WSL2 Crashes**
- **Problem**: Processes started by systemd in WSL2 become orphaned when WSL crashes (microsoft/WSL#10983)
- **Impact**: Orphaned processes hold resources (TCP ports) visible in Windows Resource Monitor
- **Relevance to Agent Forge**: If Agent Forge spawns agents via tmux and WSL2 crashes, agents may become orphaned at the Windows hypervisor level — not recoverable via `wsl --shutdown`
- **Workaround**: Manual kill via Windows `taskkill /F /PID <pid>` before restarting WSL services

**Issue 3: Zombie Processes Not Reaped When tmux is Child of Init**
- **Problem**: In WSL2 (not WSL1), tmux spawned as direct child of init (PID 1) fails to reap zombie child processes (microsoft/WSL#4138)
- **Impact**: `[tmux: client] <defunct>` processes accumulate in `ps aux`
- **Root Cause**: WSL2's Linux kernel in VM doesn't handle init's zombie-reaping responsibility correctly in this scenario
- **Workaround**: Ensure tmux has a shell as parent (not spawned from `.bash_login` or systemd)

**Issue 4: Clipboard/PTY Issues in WSL2**
- **Problem**: Multiple GitHub issues report clipboard failures (`xclip`, `wl-paste`) and bracketed paste issues in WSL2 tmux
- **Impact**: `tmux send-keys` may interleave with bracketed paste markers on tmux 3.2+
- **Relevance**: Agent Forge's `send-keys` injection may behave differently on WSL2 vs native Linux

**WSL2 Restart vs Windows Reboot Behavior**:
| Scenario | tmux Session Survival | Agent Process Survival |
|----------|----------------------|------------------------|
| WSL2 restart (`wsl --shutdown`) | ❌ Socket lost, sessions unreachable | ❌ All processes killed |
| Windows reboot | ❌ WSL2 VM destroyed | ❌ All processes killed |
| WSL2 crash (kernel panic) | ❌ Orphaned at Windows level | ⚠️ Orphaned, require manual kill |
| tmux server crash | ✅ Agents continue in background | ✅ Survive, reattach possible |

**Conclusion**: The original report's claim "agents survive orchestrator death" is **only true for orchestrator crashes, not WSL2 restarts**. This is a critical deployment-specific limitation that should be documented in the PRD.

---

### send-keys Race Condition — Severity Assessment

**PARTIALLY VERIFIED: The race condition is real, but agent-deck's solution is more sophisticated than the original report's proposed fix.**

**Agent-Deck's Verified Solution** (from `cmd/agent-deck/session_cmd.go`):

The `sendWithRetryTarget` function implements a **multi-signal verification + retry** approach:

```go
// Core retry loop (50 retries × 300ms = ~15 seconds max)
for retry := 0; retry < opts.maxRetries; retry++ {
    time.Sleep(opts.checkDelay) // 300ms
    
    // 1. Check for "pasted-but-unsent" marker
    if rawContent, _ := target.CapturePaneFresh(); captureErr == nil {
        content := tmux.StripANSI(rawContent)
        unsentPromptDetected = hasUnsentPastedPrompt(content) // "[Pasted text"
    }
    
    // 2. Get session status
    status, _ := target.GetStatus()
    
    // 3. Decision tree:
    if unsentPromptDetected {
        _ = target.SendEnter() // Retry Enter immediately
        continue
    }
    if status == "active" {
        activeChecks++
        if activeChecks >= 2 { return nil } // Success
        continue
    }
    if status == "waiting" || status == "idle" {
        if sawActiveAfterSend {
            waitingNoMarkerChecks++
            if waitingNoMarkerChecks >= 2 { return nil } // Success
        } else {
            // Periodic Enter nudges for late prompt-state races
            if retry%3 == 2 { _ = target.SendEnter() }
        }
    }
}
```

**Key Differences from Original Report's Proposed Fix**:

| Original Report Proposal | Agent-Deck Implementation |
|--------------------------|---------------------------|
| Sentinel file (`~/.agent-forge/ready/<session-id>`) | **Pane content marker detection** (`[Pasted text`) |
| Post-send verification (single check) | **Continuous verification loop** (50 retries × 300ms) |
| Max 3 retries | **50 retries** with adaptive strategy |
| Passive wait | **Active Enter nudging** every 3rd retry when ambiguous |
| Single signal (sentinel) | **Dual signal** (pane marker + status API) |

**Empirical Evidence**:
- Agent-deck's `cmd/agent-deck/session_send_test.go` includes tests demonstrating retry behavior when unsent paste marker persists
- The `SendKeysAndEnter` function in `internal/tmux/tmux.go` uses **100ms delay** between send-keys and Enter to handle tmux 3.2+ bracketed paste sequences
- `SendKeysChunked` splits large content into 4KB chunks with 50ms delay between chunks

**Conclusion**: The original report's sentinel-file proposal is **simpler but less robust** than agent-deck's dual-signal verification. The race condition severity is **moderate** — it occurs when:
1. Large messages are pasted (triggering bracketed paste mode)
2. Agent transitions from ready→busy during send
3. tmux version is 3.2+ (bracketed paste behavior changed)

**Recommendation**: Adopt agent-deck's **pane marker detection + status verification** pattern, not the sentinel file approach. The sentinel file requires agent-side cooperation; pane detection works universally.

---

### tmux on WSL2 — Final Verdict

**KEEP TMUX, but with WSL2-specific hardening:**

The original report's recommendation to keep tmux is **correct for this deployment environment**, but requires WSL2-specific modifications:

**WSL2-Specific tmux Configuration** (add to Agent Forge's tmux profile):
```bash
# ~/.tmux.conf (WSL2-specific)
set -g socket-path ~/.tmux/tmux  # Persist socket across WSL restarts
set -g set-titles on             # Help with PTY detection
setw -g monitor-activity off     # Prevent activity flags from corrupting pane state
set -g default-command "$SHELL"  # Ensure shell is parent (not init)
```

**Agent Forge Startup Check** (add to orchestrator):
```typescript
// Detect WSL2 and apply socket path override
if (process.env.WSL_DISTRO_NAME || fs.existsSync('/proc/version')) {
  const socketPath = path.join(os.homedir(), '.tmux', 'tmux');
  if (!fs.existsSync(socketPath)) {
    fs.mkdirSync(path.dirname(socketPath), { recursive: true });
  }
  tmuxCommand = `tmux -S ${socketPath}`;
}
```

**Resilience Claim Revision**:
- Original: "if the forge process dies, agents continue in tmux"
- Revised: "if the forge process dies (but WSL2 remains running), agents continue in tmux and can be reattached"

**When tmux is NOT sufficient on WSL2**:
| Failure Mode | tmux Survival | Agent Forge Recovery |
|--------------|---------------|----------------------|
| Orchestrator crash | ✅ Yes | `agent-forge attach` |
| tmux server crash | ⚠️ Agents continue, no tmux | Manual reattach via new tmux session |
| WSL2 restart | ❌ No | Session metadata in SQLite, but processes dead |
| Windows reboot | ❌ No | Session metadata in SQLite, but processes dead |
| WSL2 kernel panic | ❌ Orphaned | Manual Windows-side process kill required |

**Conclusion**: tmux remains the right choice for Agent Forge on WSL2, but the PRD must:
1. Document WSL2 socket persistence workaround
2. Clarify that "agents survive orchestrator death" excludes WSL2 restarts
3. Add WSL2 detection + socket path override at startup
4. Consider SQLite-based session export for post-WSL-restart recovery (reconstruct session metadata, not processes)

---

### Net New Findings

**1. Jean's HTTP Server + WebSocket is NOT Implemented**
- The original report mentioned "HTTP server with WebSocket support" as a README feature
- Deepwiki confirms this is **aspirational roadmap copy, not implemented functionality**
- All communication is Tauri IPC (desktop-internal only)
- No external API exists today

**2. Agentpipe's Process Persistence is Context-Based, Not tmux-Based**
- Agentpipe uses `exec.CommandContext` for process spawning
- When orchestrator exits, context cancellation propagates to spawned processes
- Some adapters (CursorAgent) explicitly call `cmd.Process.Kill()` to prevent orphans
- **This is the opposite of tmux persistence** — agentpipe prioritizes cleanup over survival

**3. Agent-Deck's Atomic Command Chaining is Misleading**
- CHANGELOG claims "atomic tmux command chaining (;)" for race condition fix
- Actual implementation uses **two separate `exec.Command` calls** with 100ms delay
- The "atomic" claim refers to logical atomicity (send + Enter as one operation), not subprocess atomicity
- Retry logic (50 iterations) is the real robustness mechanism, not atomicity

**4. WSL2 Has a Fundamental Process Persistence Limitation**
- No solution (tmux, systemd, direct spawn) survives WSL2 shutdown/crash
- This is a **hypervisor-level limitation**, not a tooling issue
- Agent Forge's resilience claim must be scoped to "orchestrator crashes, not WSL2 restarts"

**5. Jean's Event Schema Includes Permission Handling**
- `chat:permission_denied` event with `denials[]` array for tools requiring approval
- This is a **net-new event type** not mentioned in the original report
- Relevant for Agent Forge agents that use tools with `--dangerously-skip-permissions` disabled

**6. Agentpipe's JSONL Bridge Includes Command Metadata**
- `conversation.started` event includes full command, args, mode, TUI enabled flag
- This enables **exact session reconstruction** from event logs
- Agent Forge should adopt this for post-mortem analysis and session replay

**7. Bracketed Paste Mode is the Root Cause of send-keys Issues**
- tmux 3.2+ changed bracketed paste behavior
- Agent-deck's 100ms delay between send-keys and Enter is specifically for this
- The race condition is **version-specific**, not universal
