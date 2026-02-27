# Agent 1 Research: ralph-claude-code + get-shit-done

**Date**: 2026-02-27
**Researcher**: Agent 1 (Claude Sonnet 4.6, autonomous)
**Purpose**: Architectural research for Agent Forge PRD, addressing Mercury Terminal P0 questions

---

## Executive Summary

- **ralph-claude-code** implements a production-proven, three-state circuit breaker (CLOSED/HALF_OPEN/OPEN) with configurable no-progress and same-error thresholds. Progress is measured by git file changes per loop — not by agent self-reporting. The structured `---RALPH_STATUS---` output block is the key insight: agents must emit a machine-parseable completion signal, not just stop typing.
- **get-shit-done** demonstrates that "task completion is not goal achievement." Its dual-layer verification model — executor self-check plus independent verifier goal-backward analysis — is the strongest pattern for preventing infinite loops and zombie workers in Agent Forge.
- Both systems use a **thin orchestrator + fresh context subagent** model. The orchestrator stays at 10–15% context and parses structured returns from workers; workers get full 200k context windows. This directly addresses Agent Forge's context rot risk as agent chains grow deeper.
- Agent Forge's current Protocol Engine (Section 5) has no done-condition schema for protocol turns. A turn's `wait_for: ready` only detects shell prompt presence — it does not verify whether the agent's task is complete or the output is substantive. This is the most critical fragility.
- Agent Forge's roadmap defers circuit breakers and rate limiting to v1.3.0 (hooks). Based on ralph's production experience, these should be built into v0.6.0 alongside zombie detection — not as a plugin hook. Rate limiting and anti-loop protection are not enhancements; they are prerequisite reliability features.

---

## ralph-claude-code — Deep Analysis

**Repository**: https://github.com/frankbria/ralph-claude-code
**Version**: v0.11.5 (active development, 566 tests, 100% pass rate)
**Stars**: 7,300+ | **Forks**: 513+

### Architecture Overview

Ralph is an autonomous development loop runner that wraps Claude Code CLI in a `while true` bash loop. It is not a tmux orchestrator or a multi-agent system — it is a single-agent persistence layer that prevents Claude from stopping prematurely. The key insight is that Claude Code's default behavior is to stop and return control to the user; Ralph's job is to keep it going until work is provably done.

Architecture components:
- `ralph_loop.sh` — main orchestrator, the `while true` loop
- `lib/circuit_breaker.sh` — three-state safety valve (CLOSED/HALF_OPEN/OPEN)
- `lib/response_analyzer.sh` — parses Claude's text output for completion signals
- `lib/date_utils.sh` — hourly window calculation for rate limiting
- `.ralph/PROMPT.md` — injected at each loop iteration; contains task list and output format requirements
- `.ralph/fix_plan.md` — markdown checkbox task list; all `[x]` = loop exits

State files (JSON, persisted to disk):
- `.circuit_breaker_state` — current CB state, counters, timestamps
- `.circuit_breaker_history` — append-only transition log
- `.exit_signals` — rolling window of signal arrays (test_only_loops, done_signals, completion_indicators)
- `.call_count` / `.last_reset` — hourly API call tracking
- `status.json` — live runtime status (for `ralph --monitor`)
- `.response_analysis` — last parsed Claude output analysis
- `progress.json` — live execution progress display
- `.last_output_length` — byte count for output decline detection

### Loop Continuation Mechanism

The `main()` function in `ralph_loop.sh` runs a `while true` loop with four pre-execution checks per iteration:

**Check 1: Circuit Breaker**
```bash
if should_halt_execution; then
    log_error "Circuit breaker OPEN — halting"
    break
fi
```

**Check 2: Rate Limit**
```bash
if ! can_make_call; then
    wait_for_reset  # blocks until next hour boundary
fi
```

**Check 3: Graceful Exit**
```bash
exit_reason=$(should_exit_gracefully)
if [[ -n "$exit_reason" ]]; then
    log_success "Exiting: $exit_reason"
    break
fi
```

**Check 4: 5-Hour API Limit** (post-execution, on exit code 2)
```bash
if [[ $claude_exit_code -eq 2 ]]; then
    # Detected 5-hour Claude API usage limit
    prompt_user_to_wait_or_exit
fi
```

If none trigger, Ralph executes `claude < PROMPT.md`, captures output, runs `analyze_response`, runs `record_loop_result`, updates state files, sleeps, and repeats.

The loop has no maximum iteration count by default — it is intended to run indefinitely until an exit condition fires.

### Done/Stop Conditions

Done conditions are layered in priority order within `should_exit_gracefully()`:

| Priority | Condition | Threshold | Reason String |
|----------|-----------|-----------|---------------|
| 1 (highest) | Permission denied detected | `CB_PERMISSION_DENIAL_THRESHOLD` = 2 | `permission_denied` |
| 2 | Test-only loops (no implementation work) | `MAX_CONSECUTIVE_TEST_LOOPS` = 3 | `test_saturation` |
| 3 | Consecutive "done" signals from Claude | `MAX_CONSECUTIVE_DONE_SIGNALS` = 2 | `completion_signals` |
| 4 | High-confidence completion indicators | 2 consecutive | `project_complete` |
| 5 | Safety circuit breaker (EXIT_SIGNAL loop) | 5 consecutive | circuit breaker opens |
| 6 | All fix_plan.md items `[x]` | 100% complete | `plan_complete` |

The most reliable and highest-confidence exit is `plan_complete` (all checkbox tasks done). All other conditions are heuristic and can produce false positives.

**Explicit Termination Schema — RALPH_STATUS block:**

Claude is instructed (via PROMPT.md injection) to output this block at the end of every response:

```
---RALPH_STATUS---
STATUS: IN_PROGRESS | COMPLETE | BLOCKED
TASKS_COMPLETED_THIS_LOOP: <number>
FILES_MODIFIED: <number>
TESTS_STATUS: PASSING | FAILING | NOT_RUN
WORK_TYPE: IMPLEMENTATION | TESTING | DOCUMENTATION | REFACTORING
EXIT_SIGNAL: false | true
RECOMMENDATION: <one line summary>
---END_RALPH_STATUS---
```

`EXIT_SIGNAL: true` is only valid when ALL five conditions are met:
1. All fix_plan.md items marked `[x]`
2. All tests passing
3. No errors in last execution
4. All specs implemented
5. Nothing meaningful remains

When `EXIT_SIGNAL: true` or `STATUS: COMPLETE` is detected, `confidence_score` is set to 100 (highest priority). Claude's explicit signal takes precedence over all heuristic pattern matching.

### Hook Integration

Ralph does **not** use Claude Code's hook system (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`). Integration is entirely at the CLI level: Ralph wraps the `claude` command and processes its text output. The only "hooks" are shell functions called at specific points in the loop.

This is architecturally significant: Ralph operates outside Claude's internal event system, treating Claude as a black box that consumes a prompt and emits text. This is simpler but means Ralph cannot intercept tool calls or inject logic mid-execution.

### Circuit Breaker / Anti-loop Patterns

Ralph's circuit breaker is the most mature pattern in the codebase. Implementation is in `lib/circuit_breaker.sh`, based on Michael Nygard's Release It! pattern.

**Three States:**
- `CLOSED` — normal operation
- `HALF_OPEN` — monitoring (suspicious, 2 loops without progress)
- `OPEN` — halted, requires manual reset or cooldown

**Configurable Thresholds:**

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `CB_NO_PROGRESS_THRESHOLD` | 3 | Loops before opening on stagnation |
| `CB_SAME_ERROR_THRESHOLD` | 5 | Consecutive identical errors before opening |
| `CB_OUTPUT_DECLINE_THRESHOLD` | 70% | Output length drop triggers HALF_OPEN |
| `CB_PERMISSION_DENIAL_THRESHOLD` | 2 | Permission failures (immediate concern) |
| `CB_COOLDOWN_MINUTES` | 30 | Wait time before HALF_OPEN after OPEN |
| `CB_AUTO_RESET` | false | If true, bypass cooldown on startup |

**Progress Detection:**
Progress is measured by `git diff --name-only` — if any files changed, progress occurred. If `files_changed == 0` for `CB_NO_PROGRESS_THRESHOLD` consecutive loops, the circuit transitions from CLOSED to HALF_OPEN, then OPEN. This is objective and not dependent on the agent's self-reporting.

**State JSON schema** (`.circuit_breaker_state`):
```json
{
  "state": "CLOSED|HALF_OPEN|OPEN",
  "last_change": "<ISO8601>",
  "consecutive_no_progress": 0,
  "consecutive_same_error": 0,
  "last_progress_loop": 0,
  "total_opens": 0,
  "reason": "<human-readable>",
  "current_loop": 0
}
```

**Two-Stage Error Filtering** (prevents false positives):
- Stage 1: Filter out `"is_error": false` patterns (JSON field names containing "error")
- Stage 2: Match actual error patterns: `^Error:`, `^ERROR:`, `Exception`, `Fatal`, `FATAL`

**Multi-line Error Matching** in `detect_stuck_loop()`:
Checks if all detected error lines in current output also appear in all recent history files — prevents false positives when multiple distinct errors occur together.

**Recovery:**
- If `CB_AUTO_RESET=true`: circuit auto-resets to CLOSED on startup regardless of cooldown
- Otherwise: transitions to HALF_OPEN after `CB_COOLDOWN_MINUTES`, then CLOSED if progress resumes
- Manual reset command available for user intervention

### Key Code Snippets

**RALPH_STATUS parsing (response_analyzer.sh):**
```bash
if grep -q -- "---RALPH_STATUS---" "$output_file"; then
    local status=$(grep "STATUS:" "$output_file" | cut -d: -f2 | xargs)
    local exit_sig=$(grep "EXIT_SIGNAL:" "$output_file" | cut -d: -f2 | xargs)
    # EXIT_SIGNAL: true OR STATUS: COMPLETE → confidence_score = 100
fi
```

**Progress detection (circuit_breaker.sh):**
```bash
record_loop_result() {
    local files_changed=$1
    local has_errors=$2
    if [[ $files_changed -gt 0 ]]; then
        consecutive_no_progress=0
        # reset to CLOSED
    else
        ((consecutive_no_progress++))
        if [[ $consecutive_no_progress -ge $CB_NO_PROGRESS_THRESHOLD ]]; then
            # transition to OPEN
        elif [[ $consecutive_no_progress -ge 2 ]]; then
            # transition to HALF_OPEN
        fi
    fi
}
```

**Fix plan completion check:**
```bash
# Plan complete when all [x] and no remaining [ ]
if grep -q "\- \[ \]" "$fix_plan" 2>/dev/null; then
    return  # incomplete tasks remain
else
    echo "plan_complete"
fi
```

**Rate limiting:**
```bash
can_make_call() {
    local current_hour=$(date +%Y%m%d%H)
    local last_reset=$(cat .last_reset 2>/dev/null || echo "")
    if [[ "$current_hour" != "$last_reset" ]]; then
        echo 0 > .call_count
        echo "$current_hour" > .last_reset
    fi
    local count=$(cat .call_count 2>/dev/null || echo 0)
    [[ $count -lt $MAX_CALLS_PER_HOUR ]]
}
```

### Verdict: What to Adopt

1. **RALPH_STATUS output contract** — Adopt this pattern immediately for Agent Forge protocol turns. Every worker agent's task prompt must instruct it to emit a structured, machine-parseable completion block. `wait_for: ready` (shell prompt detection) is insufficient; it only proves the agent returned to a prompt, not that it completed the task.

2. **Three-state circuit breaker** — Adopt the CLOSED/HALF_OPEN/OPEN state machine with configurable thresholds. The git-diff-based progress detection is the correct primitive for code-writing agents. For Agent Forge workers that don't write code, the analog is: "did the agent produce substantive output different from the previous turn?"

3. **Dual rate limits** — Model the distinction: (a) self-imposed rate limit for burst control, (b) provider-imposed limits detected from output parsing. Both need handling paths.

4. **Rolling window for exit signals** — The `.exit_signals` rolling array (last 5 entries) prevents false positives from single-loop anomalies. Signals must appear consistently before triggering exit.

5. **Structured state files** — Persist circuit breaker state to disk so it survives process restarts. Agent Forge's current SQLite schema should add a `circuit_breaker_state` column or table.

---

## get-shit-done — Deep Analysis

**Repository**: https://github.com/gsd-build/get-shit-done
**Stars**: 21,400+ | **Commits**: 926+
**License**: MIT | **Runtime**: Claude Code, OpenCode, Gemini CLI, Codex

### Architecture Overview

GSD is a meta-prompting and context engineering system. It is not a process runner — it is a collection of AI agent definitions (markdown files instructing Claude Code subagents) and a CLI utility (`gsd-tools.cjs`) for state management. The system addresses "context rot" by decomposing every project into waves of atomic plans, each executed by a fresh subagent with a clean 200k token context window.

Core workflow: `discuss → plan → execute → verify`

Key agents:
- `gsd-planner` — decomposes PRD phases into atomic PLAN.md files with dependency graphs
- `gsd-plan-checker` — validates plans against requirements before execution
- `gsd-executor` — executes tasks in a plan, writes SUMMARY.md, commits atomically
- `gsd-verifier` — performs goal-backward verification independent of executor claims
- `gsd-phase-researcher` — domain research before planning
- `gsd-debugger` — targeted debugging for verification failures

State files:
- `STATE.md` — living project state (position, metrics, decisions, blockers, session continuity)
- `PLAN.md` — per-plan task definitions (YAML frontmatter + XML body)
- `SUMMARY.md` — executor's completion report (not trusted by verifier)
- `VERIFICATION.md` — verifier's independent assessment
- `ROADMAP.md` — phases, milestones, requirements
- `PROJECT.md` — project definition and decision log

CLI utility (`gsd-tools.cjs`) provides deterministic state operations:
- `state advance-plan`, `state record-metric`, `state add-decision`
- `state add-blocker`, `state resolve-blocker`, `state record-session`
- These are CLI commands, not event callbacks — state transitions are explicit

### PRD→Task Decomposition Model

GSD decomposes a PRD through a multi-stage pipeline:

1. `/gsd:new-project` — questions → `PROJECT.md` + `REQUIREMENTS.md` + `ROADMAP.md`
2. `/gsd:discuss-phase <phase>` — shapes implementation decisions → `CONTEXT.md`
3. `/gsd:plan-phase <phase>` — spawns `gsd-planner` → `PLAN.md` files
4. `gsd-plan-checker` validates plans → revision loop if issues found
5. `/gsd:execute-phase <phase>` — spawns `gsd-executor` per plan → `SUMMARY.md`
6. `/gsd:verify-work <phase>` — spawns `gsd-verifier` → `VERIFICATION.md`

The `gsd-planner` uses a **needs/creates + wave assignment** algorithm:
- For each task: identify `needs` (prerequisites) and `creates` (outputs)
- Tasks with empty `depends_on` → Wave 1
- Subsequent waves: `max(waves of dependencies) + 1`
- Plans targeting ~50% context window usage, 2–3 tasks max per plan
- Vertical slices preferred over horizontal layers (feature-complete plans run parallel)

### Done Criteria Schema

GSD has the most explicit done-criteria schema of any system reviewed. Every task in PLAN.md has four mandatory fields:

**Per-task XML structure:**
```xml
<task type="auto">
  <name>Action-oriented task name</name>
  <files>src/auth/login.ts, src/auth/types.ts</files>
  <action>
    Specific implementation details — what to do, how, what to avoid
  </action>
  <verify>npm test -- --testPathPattern=auth</verify>
  <done>Valid credentials return cookie, invalid credentials return 401</done>
</task>
```

The `<done>` field is the machine-readable acceptance criterion. It is:
- Observable (external behavior, not internal state)
- Specific (contains actual expected values/outcomes)
- Verifiable (can be tested, not subjective)

Checkpoint tasks (requiring human input) use a different schema:
```xml
<task type="checkpoint:decision">
  <decision>Which caching strategy to use?</decision>
  <context>Why this decision matters for performance</context>
  <options>
    <option name="Redis">pros: speed; cons: infrastructure cost</option>
    <option name="in-memory">pros: simple; cons: no persistence</option>
  </options>
  <resume-signal>USER_CHOICE: [option]</resume-signal>
</task>
```

**Plan-level done criteria (PLAN.md frontmatter):**
```yaml
must_haves:
  truths:
    - "Users can log in with valid credentials"
    - "Invalid credentials are rejected with 401"
  artifacts:
    - src/auth/login.ts
    - src/auth/middleware.ts
  key_links:
    - "login.ts imports from middleware.ts"
    - "routes.ts registers auth middleware"
```

`must_haves` are goal-backward: state the goal, derive observable truths, required artifacts, and required wiring (key_links).

### Task Dependency Graph

Dependency model in PLAN.md frontmatter:
```yaml
phase: 01-auth
plan: "03"
type: execute
wave: 2
depends_on: ["01-01", "01-02"]
files_modified:
  - src/auth/routes.ts
  - src/api/index.ts
autonomous: true
```

Key rules:
- `depends_on` lists plan IDs that must complete before this plan executes
- `files_modified` determines parallelism: plans modifying the same file cannot run in parallel (even if in the same wave)
- `autonomous: false` means the plan contains a checkpoint task requiring human input
- Wave assignment is computed automatically, stored in frontmatter before execution

The `gsd-plan-checker` validates:
- No circular dependencies
- No references to non-existent plans
- Task completeness (every auto-task has Files, Action, Verify, Done fields)
- Requirement coverage (every roadmap requirement addressed)

### Supervisor/Worker Model

GSD uses a **thin orchestrator + fresh subagent** pattern:

```
Orchestrator (10-15% context)
  |-- parses args, validates state
  |-- spawns Task(gsd-planner) → blocks until ## PLANNING COMPLETE
  |-- spawns Task(gsd-plan-checker) → blocks until ## CHECK COMPLETE
  |-- for each wave:
  |     for each independent plan in wave:
  |       spawns Task(gsd-executor) in parallel → blocks until ## PLAN COMPLETE
  |-- spawns Task(gsd-verifier) → blocks until ## Verification Complete
  |-- parses structured return header only (not full output)
```

Each subagent receives only file paths in its prompt (never file contents). The subagent reads its own files into its fresh 200k context. This prevents the orchestrator's context from ballooning.

**Structured returns** (how workers signal completion to orchestrator):
- `## PLANNING COMPLETE` — planner finished
- `## PLAN COMPLETE` — executor finished, includes task hashes and duration
- `## CHECKPOINT REACHED` — executor paused at human decision point
- `## VERIFICATION PASSED` / `## Verification Complete` — verifier finished

**Orchestrator spot-checks** (after executor claims completion):
1. `SUMMARY.md` exists in the expected location
2. Git log contains commits related to the plan
3. No `## Self-Check: FAILED` marker in any summary file

**The verifier is independent:** It explicitly does not trust `SUMMARY.md` claims. It re-examines the codebase directly using goal-backward analysis. This is the "second opinion" that prevents false completions.

### Failure & Retry Handling

**Executor deviation rules (in priority order):**

| Rule | Trigger | Action |
|------|---------|--------|
| Rule 1 | Bug preventing correct operation | Auto-fix |
| Rule 2 | Missing critical functionality (security, validation) | Auto-add |
| Rule 3 | Blocking issue (missing dep, broken import) | Auto-fix |
| Rule 4 | Architectural decision (new table, framework change) | Stop, return checkpoint |

**Attempt limit:** Executor tracks auto-fix attempts per task. After 3 failed fix attempts, it documents remaining issues in SUMMARY.md and moves on. This prevents infinite fix loops within a single plan execution.

**Orchestrator failure handling:**
- Spot-check fails → report which plan failed, offer: retry or skip
- Claude Code runtime bug (`classifyHandoffIfNeeded is not defined`) → if spot-checks pass, treat as success
- User chooses continue with failure → dependent plans may cascade-fail

**Partial completion and resumption:**
- Re-running `/gsd:execute-phase` discovers existing `SUMMARY.md` files and skips completed plans
- `STATE.md` tracks last completed plan, current wave, pending checkpoints
- Per-task atomic git commits enable rollback to last good state

**Verification failure handling:**
- `gsd-verifier` produces `VERIFICATION.md` with `status: gaps_found`
- Gaps are structured in YAML frontmatter for downstream planning
- `gsd-debugger` spawned for targeted gap closure
- Re-verification focuses only on previously failed items (`Step 0` checks prior verification)

### Key Code Snippets

**PLAN.md frontmatter (complete example):**
```yaml
---
phase: 01-auth
plan: "02"
type: execute
wave: 1
depends_on: []
files_modified:
  - src/auth/models.ts
  - src/db/schema.ts
autonomous: true
requirements: ["REQ-001", "REQ-002"]
must_haves:
  truths:
    - "User model exists with required fields"
    - "Database schema includes users table"
  artifacts:
    - src/auth/models.ts
    - src/db/schema.ts
  key_links:
    - "models.ts imports from db/schema.ts"
---
```

**Verifier three-level artifact check:**
```
For each required artifact:
  Level 1 — Existence: does the file exist?
  Level 2 — Substantiveness: contains real implementation
             (not: TODO comments, empty functions, placeholder returns)
  Level 3 — Wiring: properly imported, registered, connected
             (not: orphaned file never imported anywhere)
```

**STATE.md status valid transitions:**
```
Ready to plan
  → Planning (during plan-phase)
  → Ready to execute (after plan-phase complete)
  → In progress (during execute-phase)
  → Phase complete — ready for verification
  → Milestone complete (if last phase)
```

**VERIFICATION.md frontmatter (result schema):**
```yaml
---
phase: 01-auth
verified: "2026-02-27T14:23:00Z"
status: passed | gaps_found | human_needed
score: "5/6"
gaps:
  - truth: "Invalid credentials return 401"
    status: FAILED
    reason: "Route returns 200 with empty body"
    affected_artifacts: ["src/auth/routes.ts"]
    missing: ["Proper error handling middleware"]
human_verification:
  - "Test login flow in browser with valid/invalid credentials"
---
```

### Verdict: What to Adopt

1. **`<done>` field per protocol turn** — The most directly applicable pattern. Agent Forge protocol turns currently have no acceptance criteria. Every turn needs a `done_criteria` field specifying observable, machine-verifiable completion conditions.

2. **Goal-backward verification** — "Task completion != goal achievement" is the key insight for preventing zombie workers. After a worker returns, a second verification pass (or the boss agent's next turn) should verify observable outcomes, not just that the agent returned to a prompt.

3. **Thin orchestrator + fresh context subagents** — As Agent Forge protocol chains grow, the boss agent will suffer context rot. Adopt the pattern: orchestrator keeps 10-15% context, passes only file paths (not content) to workers, parses structured return headers.

4. **Atomic commits per task** — Enables clean rollback and definitive progress tracking. If a worker's git diff is empty, it made no progress regardless of what it claims.

5. **Attempt limit per task** — Cap auto-fix attempts at 3. After that, document remaining issues and escalate rather than looping. This is the GSD equivalent of ralph's circuit breaker.

6. **Two-layer completion check** — Executor self-check + independent verifier. The verifier must not trust the executor's summary. In Agent Forge terms: the boss should not trust the worker's self-report without an independent verification step.

---

## PRD Fragility Analysis

### Fragility 1: Protocol Turn Completion Has No Done Condition

**PRD Section**: Section 5 — Protocol Engine

**Description**: The current protocol YAML schema uses `wait_for: ready` to determine turn completion. This detects shell prompt return only — it proves the agent's terminal returned to an idle state, not that the agent completed its assigned task substantively. An agent can return a trivial "I'll look into that" response and the protocol engine will mark the turn complete and advance.

Example from PRD (collaborative.yaml):
```yaml
- id: design
  agent: ${a}
  action: start_with_prompt
  prompt_template: |
    Design a solution for: ${task}
  wait_for: ready          # <-- only checks shell prompt
  capture_output: true
  output_var: design
```

There is no field for: "what does a complete design look like?", "minimum output length?", "required sections?", "does it reference the task requirements?"

**Risk**: Workers return shallow outputs. Protocol advances. Subsequent turns operate on incomplete context. Final result is degraded.

**Proposed Fix**: Add `done_criteria` to the protocol turn schema:
```yaml
- id: design
  agent: ${a}
  action: start_with_prompt
  prompt_template: |
    Design a solution for: ${task}
    Output requirements: ${context}

    When done, output:
    ---TURN_STATUS---
    STATUS: COMPLETE | PARTIAL | BLOCKED
    EXIT_SIGNAL: true | false
    ---END_TURN_STATUS---
  wait_for: ready
  done_criteria:
    require_exit_signal: true      # agent must emit EXIT_SIGNAL: true
    min_output_length: 200         # minimum chars to count as substantive
    required_patterns:             # regex patterns that must appear in output
      - "(?i)solution|approach|design"
    timeout_ms: 120000             # hard deadline
  capture_output: true
  output_var: design
```

---

### Fragility 2: No Circuit Breaker — Protocols Can Loop Indefinitely

**PRD Section**: Section 5 (Protocol Engine), Section 9 (Roadmap — deferred to v1.3.0)

**Description**: The current protocol engine has no mechanism to detect when a protocol is making no progress. A multi-turn protocol with `action: resume` can loop through the same exchange indefinitely if the agents are stuck in agreement-seeking behavior or if one agent repeatedly fails.

The adversarial protocol (attacker/defender) is particularly at risk: if both agents converge to the same position, turns 2 and 3 may produce identical content. No current mechanism detects this.

Roadmap entry: "v1.3.0 — Hooks & Events: Plugin system for lifecycle hooks, Pre/post-spawn hooks, Protocol completion hooks" — but circuit breaker behavior should not wait for a plugin system.

**Risk**: Runaway protocol execution consumes API tokens without progress. In Mercury Terminal's context (scheduled agent runs), this becomes a recurring cost leak.

**Proposed Fix**: Add circuit breaker state to the protocol execution context:

```typescript
interface ProtocolExecutionState {
  protocolId: string;
  currentTurn: number;
  lastOutputHash: string;       // hash of last turn's output
  noProgressCount: number;      // turns where output hash unchanged
  circuitState: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
  circuitOpenedAt?: Date;
}

// In protocol-engine.ts executeTurn():
const outputHash = hash(turnOutput);
if (outputHash === state.lastOutputHash) {
  state.noProgressCount++;
  if (state.noProgressCount >= CB_NO_PROGRESS_THRESHOLD) {
    state.circuitState = 'OPEN';
    throw new ProtocolCircuitOpenError(protocolId, currentTurn);
  }
} else {
  state.noProgressCount = 0;
  state.lastOutputHash = outputHash;
  state.circuitState = 'CLOSED';
}
```

---

### Fragility 3: Zombie Detection Without Completion Guarantee

**PRD Section**: Section 3 — Session Management & State

**Description**: The current reconciliation loop correctly detects zombie sessions (tmux session died unexpectedly). However, it only monitors for agent death — not for agent completion. An agent that loops indefinitely inside a live tmux session will never be marked zombie, but it is also never completing its task.

The current `session.status` lifecycle is:
```
created → booting → ready → working → idle → completed
                                           → error
                                           → killed
                          zombie ← (tmux session died)
```

There is no state for "working but not making progress" or "working longer than expected." A Mercury Terminal worker that exceeds its expected completion window is indistinguishable from one making normal progress.

**Proposed Fix**: Add two new session states and a timeout mechanism:

```sql
-- Add to sessions table:
ALTER TABLE sessions ADD COLUMN expected_duration_ms INTEGER;
ALTER TABLE sessions ADD COLUMN last_progress_at DATETIME;
ALTER TABLE sessions ADD COLUMN no_progress_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN circuit_state TEXT DEFAULT 'CLOSED';
```

New states:
```
working → stalled     (working but no progress for N reconciliation cycles)
stalled → working     (progress resumes)
stalled → zombie      (tmux session dies while stalled)
stalled → killed      (boss explicitly kills stalled worker)
```

Reconciliation loop enhancement (every 5s):
```typescript
for each session with status = 'working':
  // Existing zombie check
  if tmux session does not exist:
    mark as 'zombie'; continue

  // New: progress check
  const logDelta = measureLogGrowth(session.log_file);
  if logDelta === 0:
    session.no_progress_count++
    if session.no_progress_count >= NO_PROGRESS_THRESHOLD:
      mark as 'stalled'
      notify boss with reason: 'no_output_progress'
  else:
    session.no_progress_count = 0
    session.last_progress_at = now()
    if session.status === 'stalled':
      mark back to 'working'
```

---

### Fragility 4: Worker Task Prompts Have No Structured Output Contract

**PRD Section**: Section 4 — Communication Protocol, Section 5 — Protocol Engine

**Description**: The current `spawn` command and protocol turn `prompt_template` fields contain free-form text. Workers are given tasks with natural language instructions. The boss agent reads their output with `agent-forge read gemini`. There is no structured output format for workers to signal completion, partial work, blockers, or errors.

From the PRD:
```bash
# Claude executes via Bash:
agent-forge spawn gemini "Review this code for security: $(cat src/auth.ts)"
# Wait...
agent-forge read gemini
# Reads the result and integrates it into its reasoning
```

The "Wait..." comment hides the actual problem: how does Claude know the worker is done? Via `wait_for: ready` (shell prompt). How does Claude know the output is substantive? It doesn't — it just reads whatever is there.

**Proposed Fix**: Introduce a standard output protocol for all spawned workers. Workers should be instructed (via their task prompt, automatically injected by Agent Forge) to emit:

```
---AGENT_FORGE_STATUS---
STATUS: COMPLETE | PARTIAL | BLOCKED | ERROR
TASK_SUMMARY: <one-line description of what was done>
EXIT_SIGNAL: true | false
FILES_MODIFIED: <comma-separated list or "none">
BLOCKERS: <description or "none">
---END_AGENT_FORGE_STATUS---
```

This block should be automatically injected into every `prompt_template` via a template variable, and `readFromAgent()` should parse it before returning output to the boss.

---

### Fragility 5: Rate Limiting Is Absent from Protocol Execution

**PRD Section**: Section 5 (Protocol Engine), Section 9 (Roadmap — not addressed)

**Description**: The current protocol engine executes turns sequentially without any rate limiting. The roadmap does not mention rate limiting until v1.3.0 (hooks), where it is listed as a potential hook integration — but it is not explicitly planned.

In Mercury Terminal's production context, rate limiting is a P0 concern: spawning multiple worker agents for a multi-turn protocol can rapidly consume API quota, and the 5-hour usage limit can be hit mid-protocol with no graceful handling.

**Proposed Fix**: Add rate limiting at the protocol execution level, separate from (and in addition to) any per-agent rate limiting:

```typescript
interface RateLimiter {
  maxCallsPerHour: number;         // configurable, default 100
  currentHourCount: number;
  hourBoundary: Date;

  canSpawn(): boolean;
  incrementCount(): void;
  waitForReset(): Promise<void>;   // blocks until next hour
}

// In protocol-engine.ts before each turn:
if (!rateLimiter.canSpawn()) {
  await rateLimiter.waitForReset();
}
```

Also needed: provider-level limit detection. If a spawn fails with exit code 2 or output matching `"5 hour limit"` / `"usage limit reached"`:
1. Mark the protocol as `paused`
2. Persist protocol state to SQLite
3. Notify the user with estimated resume time
4. Offer: wait (auto-resume) or cancel

---

### Fragility 6: Specialist Prompts Have No Completion Verification

**PRD Section**: Section 10 — Specialist System

**Description**: The specialist system defines `output_schema` for validation but the current PRD does not describe how or when this schema validation runs. If a specialist agent produces output that does not conform to its schema (e.g., missing `health_status` field), the system has no described mechanism to detect this, retry, or escalate.

**Proposed Fix**: Add schema validation to the spawn flow:
```typescript
// After readFromAgent() when specialist is attached:
const output = await readFromAgent(sessionId);
const parsed = JSON.parse(output);
const result = z.object(specialist.prompt.output_schema).safeParse(parsed);
if (!result.success) {
  // retry with clarifying prompt, or escalate to boss
}
```

---

## Direct PRD Improvement Recommendations

### 1. Add `done_criteria` Field to Protocol Turn Schema (Section 5)

The protocol turn schema must include explicit, machine-verifiable completion conditions. Every turn should specify:
- `require_exit_signal: true | false` — whether agent must emit a structured status block
- `min_output_length: N` — minimum chars for substantive output
- `required_patterns: [regex...]` — content that must appear in output
- `timeout_ms: N` — hard deadline after which turn is marked failed

Adopt the RALPH_STATUS block pattern as the standard output contract for all Agent Forge worker agents.

### 2. Add `circuit_breaker` to Protocol YAML Schema (Section 5)

```yaml
circuit_breaker:
  no_progress_threshold: 2        # turns with same output hash → OPEN
  timeout_per_turn_ms: 120000     # per-turn hard timeout
  max_total_turns: 20             # absolute cap including retries
  on_open: fail | pause | notify  # behavior when circuit opens
```

This should be implemented in `protocol-engine.ts`, not deferred to a plugin hook system.

### 3. Add `stalled` Session State to Session Lifecycle (Section 3)

Extend the lifecycle from:
```
working → idle → completed
         → zombie
```
to:
```
working → idle → completed
         → stalled (no output progress for N reconciliation cycles)
         → zombie (tmux died)
stalled → working (progress resumes)
stalled → killed (boss or user kills)
```

Add `last_progress_at`, `no_progress_count`, and `expected_duration_ms` to the sessions table.

### 4. Add Standard Worker Output Protocol (Section 4)

Introduce `AF_STATUS` block format. Auto-inject into all worker task prompts. Parse in `readFromAgent()`. Surface in TUI Protocol Panel. Store in messages table.

Minimal schema:
```
---AF_STATUS---
STATUS: COMPLETE | PARTIAL | BLOCKED | ERROR
EXIT_SIGNAL: true | false
TASK_SUMMARY: <one line>
---END_AF_STATUS---
```

### 5. Move Rate Limiting to v0.6.0, Not v1.3.0 (Section 9)

Rate limiting is a prerequisite for production reliability, not an enhancement. Recommend:
- v0.6.0: Add rate limiting to `spawn` command and protocol engine
- v0.6.0: Add 5-hour provider limit detection and graceful protocol pause/resume
- v1.3.0: Hooks can wrap rate limiting with custom logic (pre-spawn hooks)

### 6. Add Protocol Execution State to SQLite (Section 3)

The current sessions table tracks individual agent sessions. Add a protocol execution table:

```sql
CREATE TABLE protocol_executions (
  id               TEXT PRIMARY KEY,
  protocol_name    TEXT NOT NULL,
  status           TEXT NOT NULL,   -- running|paused|completed|failed
  current_turn     INTEGER DEFAULT 0,
  circuit_state    TEXT DEFAULT 'CLOSED',
  no_progress_count INTEGER DEFAULT 0,
  last_turn_hash   TEXT,            -- hash of last turn output
  started_at       DATETIME,
  updated_at       DATETIME,
  ended_at         DATETIME,
  failure_reason   TEXT
);
```

This enables: protocol resume after crash, circuit breaker state persistence, rate limit pause/resume, TUI protocol panel state rendering.

### 7. Adopt Goal-Backward Verification for Task Completion (Section 5)

For long-running or high-stakes protocol runs, add an optional verification turn:

```yaml
verify:
  enabled: true
  agent: ${a}                        # typically the boss or a neutral agent
  prompt_template: |
    Verify the following task was completed substantively:
    Task: ${task}
    Output: ${final_design}
    Check: does this output actually address the task requirements?
    Respond: VERIFIED or INCOMPLETE with reasons.
  pass_condition: "(?i)VERIFIED"
  on_fail: retry_last_turn | escalate | fail
```

### 8. Add Attempt Limit Per Protocol Turn (Section 5)

```yaml
- id: design
  agent: ${a}
  max_attempts: 3              # retry up to 3 times if done_criteria not met
  retry_prompt: |
    Your previous response did not meet the completion criteria.
    Please try again: ${original_prompt}
  on_max_attempts: fail | skip | escalate
```

### 9. Document Mercury Terminal Integration Points (Section 11 or new Section)

Add a section documenting how Mercury Terminal consumes Agent Forge, specifically:
- How workers signal task completion back to Mercury (AF_STATUS block parsing)
- How circuit breaker state maps to Mercury's service health
- How rate limiting interacts with Mercury's scheduling
- How zombie/stalled workers trigger Mercury alerts

### 10. Add `output_contract` to Specialist Schema (Section 10)

```yaml
specialist:
  output_contract:
    format: json | markdown | text
    schema:
      type: object
      required: [health_status, issues, recommendations]
    validation_mode: strict | lenient
    on_schema_failure: retry | escalate | accept_partial
    max_retries: 2
```

---

## Patterns to Adopt

### Pattern 1: Structured Output Contract (from ralph-claude-code)

**What it is**: Every agent task prompt ends with a required status block template. The agent must fill it in before considering its work done.

**Implementation for Agent Forge**:
- Add a `output_contract_template` field to the profile schema (or specialist schema)
- Auto-append it to every task prompt sent via `sendToAgent()`
- Parse it in `readFromAgent()` before returning to caller
- Store parsed fields in the messages table

**The key rule (from ralph)**: "Claude's explicit EXIT_SIGNAL takes precedence over all heuristic pattern matching." Structured explicit signals beat regex-based heuristics every time.

**Threshold for exit**: Require EXIT_SIGNAL in at least 2 consecutive responses before marking turn complete. Single-loop signals can be false positives.

---

### Pattern 2: Three-State Circuit Breaker (from ralph-claude-code)

**What it is**: CLOSED → HALF_OPEN → OPEN state machine with objective progress measurement (git diff, output hash, or log growth). Not dependent on agent self-reporting.

**Implementation for Agent Forge**:
- At protocol level: hash each turn's output. Repeated hash = no progress.
- At session level: measure log file growth rate in reconciliation loop.
- Configurable thresholds stored in `~/.agent-forge/config.yaml`:
  ```yaml
  circuit_breaker:
    no_progress_threshold: 3
    same_output_threshold: 2
    cooldown_minutes: 30
    auto_reset: false
  ```
- Persist state in SQLite `protocol_executions.circuit_state`

**Recovery modes**:
- `auto_reset: true` — circuit resets on next protocol run (fire-and-forget workflows)
- `auto_reset: false` — requires explicit `agent-forge circuit-reset <protocol-id>`

---

### Pattern 3: Thin Orchestrator + Fresh Context (from get-shit-done)

**What it is**: The orchestrator (boss agent) keeps context minimal (10-15%). Subagents (workers) each get full fresh context windows. Workers receive file paths, not file contents. Orchestrator parses structured return headers only.

**Implementation for Agent Forge**:
- Boss agent prompts should never inline large file contents; pass paths with `--context $(path_to_file)` and let the worker read it
- Protocol output variables (`output_var: design`) should store references or truncated summaries for subsequent turns, not full outputs
- Add a `context_budget` field to protocol YAML:
  ```yaml
  context_budget:
    orchestrator_max_pct: 15       # warn if boss context exceeds this
    truncate_turn_output_after: 4000  # chars to preserve in output_var
  ```

---

### Pattern 4: Wave-Based Task Ordering (from get-shit-done)

**What it is**: Tasks are organized into dependency waves. Wave N tasks can run in parallel if they don't share file modifications. Wave N+1 tasks can only start after all Wave N tasks complete.

**Application to Agent Forge**: For complex protocol runs with multiple agents, the protocol YAML could declare wave-based turn groupings:

```yaml
turns:
  - id: research
    wave: 1
    agent: ${a}
    # ...
  - id: research_b
    wave: 1
    agent: ${b}
    # runs in parallel with research
    # ...
  - id: synthesis
    wave: 2
    depends_on: [research, research_b]
    agent: ${a}
    # runs after both wave 1 turns complete
```

This is currently unsupported but aligns with the v0.5.0 "Advanced Protocols" milestone.

---

### Pattern 5: Two-Layer Completion Verification (from get-shit-done)

**What it is**: Executor self-check (does SUMMARY.md exist? are commits present?) plus independent verifier (goal-backward analysis). The verifier explicitly does not trust the executor's self-report.

**Application to Agent Forge**: After a protocol completes, the boss agent should not simply trust that the worker's last message was substantive. Add an optional `verify` phase to protocols:

```yaml
result:
  verify:
    agent: ${a}                    # can reuse boss agent
    prompt_template: |
      Verify the task was completed:
      Original task: ${task}
      Worker output: ${final_output}
      Is this output complete and substantive? Answer VERIFIED or INCOMPLETE.
    pass_condition: "(?i)VERIFIED"
```

**The key insight from GSD**: Spot-checks are better than full re-reads. Check for structured markers, key files, and git commits rather than re-analyzing full agent output.

---

### Pattern 6: Atomic Commits Per Task (from get-shit-done)

**What it is**: After each task completes (within a plan), the executor makes a git commit. This creates a clean checkpoint trail and enables rollback to the last known-good state.

**Application to Agent Forge**: Recommend this as a best practice for worker agents that modify files. The structured output contract (Pattern 1) should include a `FILES_MODIFIED` field and workers should be instructed to commit after each task. This makes the git diff a reliable progress signal (as ralph also uses).

---

## Sources & Files Read

### ralph-claude-code
- `https://github.com/frankbria/ralph-claude-code` — main README
- `https://raw.githubusercontent.com/frankbria/ralph-claude-code/main/ralph_loop.sh` — main loop, exit conditions, circuit breaker integration
- `https://raw.githubusercontent.com/frankbria/ralph-claude-code/main/lib/circuit_breaker.sh` — three-state CB implementation
- `https://raw.githubusercontent.com/frankbria/ralph-claude-code/main/lib/response_analyzer.sh` — RALPH_STATUS parsing, completion detection
- `https://raw.githubusercontent.com/frankbria/ralph-claude-code/main/templates/PROMPT.md` — Claude instruction template with STATUS block format
- DeepWiki queries:
  - Loop continuation mechanism
  - Stop/done conditions and EXIT_SIGNAL
  - Hook integration
  - Circuit breaker implementation
  - Stalled agent detection
  - RALPH_STATUS block format
  - Rate limiting implementation
  - State files and data flow
  - fix_plan.md format

### get-shit-done
- `https://github.com/gsd-build/get-shit-done` — main README
- `https://raw.githubusercontent.com/gsd-build/get-shit-done/main/agents/gsd-executor.md` — executor agent definition
- `https://raw.githubusercontent.com/gsd-build/get-shit-done/main/agents/gsd-verifier.md` — verifier agent definition
- `https://raw.githubusercontent.com/gsd-build/get-shit-done/main/agents/gsd-planner.md` — planner agent definition
- DeepWiki queries:
  - PRD→task decomposition and PLAN.md format
  - Done criteria schema and VERIFICATION.md format
  - Task dependency graph and wave model
  - Supervisor/worker model
  - Hook and event system
  - Task failure, retry, and partial completion
  - STATE.md format and valid transitions
  - Context engineering and thin orchestrator pattern

### Agent Forge
- `/home/jagger/projects/agent-forge/docs/PRD.md` — full PRD v1.1.0
- `/home/jagger/projects/agent-forge/docs/integrations.md` — integration notes
- `/home/jagger/projects/agent-forge/docs/improvements.md` — improvements doc (empty)

---

## CHALLENGE RUN

### RALPH_STATUS Portability — **Refuted**

**Original claim**: "Directly adoptable" for Agent Forge protocol turns.

**Challenge findings**:

1. **Parsing is fragile, not robust**. The original report claims Ralph uses regex pattern matching, but deepwiki verification reveals the actual implementation uses simple `grep` + `cut` field extraction:
   ```bash
   local status=$(grep "STATUS:" "$output_file" | cut -d: -f2 | xargs)
   local exit_sig=$(grep "EXIT_SIGNAL:" "$output_file" | cut -d: -f2 | xargs)
   ```
   This is **not** regex-based parsing — it's delimiter-based field extraction. This breaks if:
   - Claude outputs `STATUS : COMPLETE` (space before colon)
   - Multiple `STATUS:` lines appear (e.g., in nested reasoning)
   - The status block appears mid-stream rather than at the end

2. **No scrollback truncation handling**. Ralph captures output to a file (`$output_file`), not via `tmux capture-pane`. Agent Forge's tmux-based architecture introduces a problem Ralph never solves: **pane scrollback truncation**. If a tmux pane has 10,000 lines of scrollback and the RALPH_STATUS block scrolls off, `tmux capture-pane` will not capture it. Ralph has no equivalent failure mode because it captures Claude's full stdout to a file.

3. **Fallback mechanism exists but is weaker than claimed**. When RALPH_STATUS is missing, Ralph falls back to:
   - Keyword scanning for "done", "complete", "finished" (+10 points each)
   - Git diff file changes (+20 points)
   - Output length decline detection (+10 points if >50% drop)
   - Threshold of 40 points triggers exit signal

   This means a single "done" keyword + file changes can trigger exit — **not** the "2 consecutive responses" threshold the original report claimed.

4. **Mid-stream RALPH_STATUS handling is undefined**. Ralph's `analyze_response()` runs once per loop iteration after Claude exits. If Claude outputs RALPH_STATUS mid-response (e.g., before additional reasoning), Ralph will still parse it — but there's no mechanism to ensure the block appears **at the end**. The original report's claim that "EXIT_SIGNAL: true is only valid when ALL five conditions are met" is enforced by **prompt engineering only**, not by code validation.

**Verdict**: RALPH_STATUS is **not directly adoptable** for tmux-based agents without significant modification. Agent Forge would need to:
- Ensure workers write status blocks to a file (not just stdout)
- Or inject the status block template at the **end** of prompts, not the beginning
- Implement scrollback-aware capture (e.g., `tmux capture-pane -S -50000` with explicit status block search)

---

### Circuit Breaker Timeline — **Overreach (Partially Justified)**

**Original claim**: Circuit breaker should move from v1.3.0 to v0.6.0; git-diff progress measurement is the "correct primitive."

**Challenge findings**:

1. **Git-diff progress measurement is fundamentally incompatible with non-file agents**. Deepwiki confirms Ralph's circuit breaker **only** detects file changes:
   ```bash
   files_changed=$(git diff --name-only | wc -l)
   if [[ $files_changed -gt 0 ]]; then
       consecutive_no_progress=0  # reset
   ```
   This means:
   - A research agent writing to SQLite: **no progress detected**
   - A data analysis agent producing network API calls: **no progress detected**
   - A documentation agent updating a wiki: **no progress detected** (unless wiki is git-tracked)

   The original report acknowledges this ("For Agent Forge workers that don't write code, the analog is...") but dismisses it. This is a **critical gap**, not a minor adaptation.

2. **Default thresholds are aggressive for multi-turn protocols**. Ralph's defaults:
   - `CB_NO_PROGRESS_THRESHOLD`: 3 loops
   - `CB_SAME_ERROR_THRESHOLD`: 5 loops
   - `CB_OUTPUT_DECLINE_THRESHOLD`: 70%

   For a single-agent loop, 3 iterations of no file changes is reasonable. For a **protocol** with 10 turns where turns 4-6 are research-only (no file writes), the circuit would open prematurely. The original report does not address per-turn vs per-protocol circuit breaker scoping.

3. **v0.6.0 scope creep is real**. The original v0.6.0 scope (zombie detection, attach/detach, log management, profile test) is already aggressive. Adding circuit breaker logic requires:
   - New SQLite tables (`protocol_executions`)
   - State persistence across process restarts
   - Per-turn output hashing
   - User-facing commands (`circuit-reset`)

   This is not a "prerequisite reliability feature" — it's a **major architectural addition** that could delay v0.6.0 by weeks.

4. **The report's hash-based proposal is incomplete**. The suggested fix:
   ```typescript
   const outputHash = hash(turnOutput);
   if (outputHash === state.lastOutputHash) { ... }
   ```
   This fails for:
   - Timestamps in output (every turn has unique hash)
   - Non-deterministic LLM outputs (same content, different wording)
   - Agents that always produce unique output even when stuck (e.g., "Let me think about this..." variations)

**Verdict**: Circuit breaker **should not** move to v0.6.0 as a full implementation. Instead:
- v0.6.0: Add **basic zombie detection** (tmux session death) + **log growth monitoring** (simpler than git-diff)
- v0.7.0: Add **per-protocol circuit breaker** with configurable thresholds
- v1.3.0: Hooks can extend with custom progress detectors (database changes, API calls)

The original report's urgency is justified, but the timeline recommendation is **overreach**.

---

### GSD Verifier Economic Viability — **Refuted**

**Original claim**: "Dual-layer verification model — executor self-check plus independent verifier goal-backward analysis."

**Challenge findings**:

1. **GSD does NOT use a verifier for every task**. Deepwiki confirms:
   > "GSD uses a dedicated `gsd-verifier` agent for post-execution verification of **phases and quick tasks**, rather than for every individual task within a phase."

   The verifier runs **once per phase**, not once per task. For a phase with 10 tasks, this is 1 verifier run, not 10. The original report's claim of "2x LLM costs per turn" is **incorrect** — it's 1x per phase, not per task.

2. **The three verification levels ARE implemented in code, not just interpretation**. Deepwiki confirms the exact implementation:
   - **Level 1 (Existence)**: `gsd-tools verify artifacts` checks `exists` field via file path
   - **Level 2 (Substantiveness)**: Checks minimum line counts + required patterns; reports "Only N lines" or "Missing pattern"
   - **Level 3 (Wiring)**: Uses `grep` to search for imports/usage; classifies as `WIRED`, `ORPHANED`, or `PARTIAL`

   However, this is **manual grep-based verification**, not automated schema validation. The verifier agent reads files and runs grep commands — it's not a structural AST analysis.

3. **Verifier is optional and model-configurable**. Deepwiki reveals:
   > "The use of the `gsd-verifier` agent can be toggled via the `workflow.verifier` setting in `.planning/config.json`."

   And model selection varies by profile:
   - `balanced` profile: uses `sonnet`
   - `budget` profile: uses `haiku`

   This means GSD explicitly acknowledges verifier is **not always necessary** — contradicting the original report's framing of it as essential.

4. **Verifier does not trust SUMMARY.md — but also doesn't re-execute tests**. The verifier's goal-backward analysis is:
   1. Determine what must be true for the goal
   2. Identify what must exist
   3. Verify wiring via grep

   But it does **not** re-run the `<verify>` command from tasks. If a task has `<verify>npm test</verify>`, the verifier doesn't execute it — it only checks file existence and content. This is **weaker** verification than the original report implies.

**Verdict**: The verifier pattern is **economically viable** (1x per phase, not per task), but **weaker** than claimed:
- It's grep-based, not AST-based
- It's optional, not mandatory
- It doesn't re-execute verification commands

For Agent Forge, a more appropriate pattern would be:
- **Per-turn self-check**: Worker emits structured status block (like RALPH_STATUS)
- **Per-protocol verifier**: Run once at protocol completion, not per turn
- **Configurable**: Allow users to skip verification for low-stakes protocols

---

### Missing Research & Gaps

**What the original agent missed**:

1. **ralph_loop.sh was not read in full**. The original report describes the loop flow but misses critical details:
   - **tmux monitor mode**: Ralph has a `--monitor` flag that sets up a tmux session displaying the loop and a monitor side-by-side. This is directly relevant to Agent Forge's tmux architecture but was not analyzed.
   - **Claude timeout**: Ralph has a `CLAUDE_TIMEOUT_MINUTES` configuration that kills Claude if it runs too long. Agent Forge's PRD has no equivalent timeout mechanism.
   - **create_files.sh**: Ralph includes a project scaffolding script that embeds ralph_loop.sh into new projects. This is a "template injection" pattern that Agent Forge could adopt for specialist prompts.

2. **Rate limiting details are incomplete**. The original report mentions "hourly call tracking" but misses:
   - Ralph's rate limit is **per-hour, not per-protocol**. If a protocol starts at 11:55 and hits the limit at 12:05, it waits until 13:00 (next hour boundary), not 60 minutes.
   - The 5-hour limit handling **prompts the user** with a 30-second timeout. If no response, Ralph exits. This is **not** a graceful auto-pause/resume as the original report suggests.
   - Ralph has **no provider-specific rate limit detection** beyond keyword matching for "5 hour limit" and "usage limit reached". It doesn't parse Claude's actual error codes.

3. **GSD parallel execution is wave-based, not task-based**. The original report mentions "parallel task execution" but misses:
   - GSD's parallelism is at the **plan level**, not the task level. Plans in the same wave run in parallel; tasks within a plan run sequentially.
   - Parallelism is **configurable** via `.planning/config.json` with `parallelization.enabled`. It can be disabled.
   - File-based conflict detection: "Plans modifying the same file cannot run in parallel (even if in the same wave)." This is a **file lock** pattern, not dependency-graph-based.

4. **Original report's "thin orchestrator" claim is overstated**. GSD's orchestrator:
   - Spawns subagents with **file paths only**, not contents (correct)
   - But also **blocks** on each subagent completion before spawning the next (for sequential plans)
   - Does **not** run in a tmux session — it's a Node.js CLI that spawns Claude Code as a subprocess

   Agent Forge's tmux-based architecture is fundamentally different: agents run in persistent tmux sessions, not as one-off subprocesses. The "fresh context" benefit of GSD doesn't directly apply.

5. **No analysis of state file durability**. Ralph persists state to JSON files (`.circuit_breaker_state`, `.exit_signals`, etc.), but:
   - What happens if the file is corrupted?
   - What happens if Ralph crashes mid-write?
   - Is there atomic write (write-to-temp + rename)?

   The original report recommends SQLite for Agent Forge but doesn't analyze Ralph's failure modes.

---

### PRD Fragilities Re-Prioritized

| Original Rank | Fragility | Re-Ranked Priority | Justification |
|---------------|-----------|-------------------|---------------|
| 1 | No Done Condition for Protocol Turns | **CRITICAL** (unchanged) | Still the most critical gap. Without done criteria, protocols can't distinguish "agent returned to prompt" from "agent completed task." |
| 2 | No Circuit Breaker | **IMPORTANT** (downgraded) | Important for production reliability, but not a v0.6.0 blocker. Basic zombie detection (tmux death) is more urgent. Full circuit breaker requires more design work (per-turn vs per-protocol, non-file progress detection). |
| 3 | Zombie Detection Without Completion Guarantee | **CRITICAL** (upgraded) | Original report treats this as separate from Fragility 1, but they're the same problem: no done condition. A zombie that loops indefinitely is indistinguishable from one making progress without output verification. |
| 4 | No Structured Output Contract | **CRITICAL** (upgraded) | Directly enables Fragility 1's fix. Without structured output, done criteria can't be verified. This is a prerequisite for Fragility 1's resolution. |
| 5 | Rate Limiting Absent | **IMPORTANT** (unchanged) | Production concern, but not a blocker for initial development. Can be added post-v0.6.0. |
| 6 | Specialist Schema Validation | **MINOR** (downgraded) | Schema validation is a "nice-to-have" for v1.0. Most specialists will be markdown prompts, not JSON schemas. Validation can be lenient (log warnings, don't block). |

**New Fragility Added**:

| 7 | tmux Scrollback Truncation | **IMPORTANT** | Agent Forge's tmux-based architecture introduces a failure mode Ralph doesn't have: if an agent outputs more than the scrollback buffer (default 10,000 lines), early output (including status blocks) is lost. `tmux capture-pane` has no "capture entire session history" option. This requires either: (a) status blocks written to files, or (b) explicit scrollback buffer configuration (`tmux new-session -o history-limit=100000`). |

---

### Net New Findings

1. **Ralph's tmux monitor mode is directly relevant to Agent Forge**. Ralph's `--monitor` flag creates a tmux session with two panes: one for the loop output, one for a monitoring dashboard. This is architecturally similar to Agent Forge's boss/worker model and could be adapted for TUI integration.

2. **GSD's verifier uses grep, not AST analysis**. The "three-level verification" is:
   - File exists? (fs.stat)
   - File has content? (line count + regex patterns)
   - File is imported? (grep for import statements)

   This is **shallow** verification, not deep semantic analysis. Agent Forge could implement similar checks more efficiently as built-in commands, not agent-based verification.

3. **Ralph's rate limit user prompt has a 30-second timeout**. If the user doesn't respond within 30 seconds, Ralph exits. This is a **graceful degradation** pattern Agent Forge should adopt: never block indefinitely on user input.

4. **GSD's wave-based parallelism uses file-based conflict detection**. Plans in the same wave can run in parallel **unless** they modify the same file. This is a simple, effective pattern Agent Forge could adopt for parallel protocol turns.

5. **Ralph's circuit breaker has a `CB_AUTO_RESET` option**. If enabled, the circuit resets to CLOSED on startup regardless of cooldown. This is a "fire-and-forget" mode for unattended workflows. Agent Forge should expose this as a configuration option for Mercury Terminal integration.

6. **GSD's executor has a 3-attempt auto-fix limit per task**. After 3 failed fix attempts, it documents remaining issues and moves on. This is a **per-task** circuit breaker, separate from the phase-level verifier. Agent Forge should adopt this pattern for individual protocol turns.

7. **Ralph's PROMPT.md is injected at each loop iteration**. The template includes explicit instructions for the RALPH_STATUS block format. This is a "prompt injection" pattern that ensures consistent output. Agent Forge should auto-inject status block templates into all worker prompts, not rely on specialists to include them.
