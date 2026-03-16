# Agent Rules & Guidelines

## BEFORE ANYTHING ELSE

1. Run `bd dolt pull` to sync the issue tracker from remote.
2. Skip `bd onboard` — `.beads/` already exists in this repo.
3. Read `CLAUDE.md` for project-specific constraints (Bun runtime, Hono, Zustand, etc.).

---

## Rule 1: Issue Tracking with bd (beads)

**Use bd for ALL task tracking. NEVER use TodoWrite, markdown TODOs, or other tools.**

### Core commands

```bash
# Find work
bd ready                          # Show unblocked issues ready to work
bd list --status=open             # All open issues
bd show <id>                      # Detailed view with dependencies

# Create
bd create --title="Summary" --description="Why this exists and what to do" --type=task --priority=2

# types: bug|feature|task|epic|chore
# Priority: 0=critical, 1=high, 2=medium (default), 3=low, 4=backlog

# Claim and progress
bd update <id> --status=in_progress
bd update <id> --notes="progress note"

# Complete
bd close <id>
bd close <id> --reason="explanation"
bd close <id1> <id2> <id3>        # close multiple at once

# Dependencies
bd dep add <issue> <depends-on>   # issue is blocked by depends-on
bd blocked                        # show all blocked issues

# Sync
bd dolt pull                      # pull from remote
bd dolt push                      # push to remote
```

### Workflow
1. `bd dolt pull` — sync first
2. `bd ready` — find available work
3. `bd update <id> --status=in_progress` — claim before touching code
4. Implement → test → commit
5. `bd close <id>` — mark done
6. `bd dolt pull` again before final commit

**Create the beads issue BEFORE writing code.**

---

## Rule 2: Permissions

All Bash commands allowed. `rm` requires user approval.

---

## Rule 3: Git Workflow

```bash
# Feature branch from main
git checkout -b feat/short-description

# Commit
git commit -m "feat(scope): description"

# Merge to main locally when done (ephemeral branch — no upstream push)
git checkout main && git merge --no-ff feat/short-description
git branch -d feat/short-description
```

Never force-push main. Never skip hooks (`--no-verify`).

---

## Rule 4: Code Search with Serena LSP + GitNexus

### Serena (primary — surgical code reads and edits)

```
get_symbols_overview   — map a file structure before reading
find_symbol            — read a specific function/class body
search_for_pattern     — flexible regex across files
replace_symbol_body    — edit a symbol atomically
insert_after_symbol    — add code after a symbol
```

Never read full files over ~300 lines. Use `get_symbols_overview` first.

For large JSX rewrites, `replace_symbol_body` can leave orphaned code on complex components.
Use Python string replace or a full file write for safety:

```python
python3 -c "
c = open('src/file.tsx').read()
c = c.replace(old, new, 1)
open('src/file.tsx', 'w').write(c)
"
```

### GitNexus (knowledge graph — architecture and impact analysis)

```
mcp__gitnexus__impact         — blast radius before changing X
mcp__gitnexus__query          — query the knowledge graph
mcp__gitnexus__context        — get context for a symbol or file
mcp__gitnexus__detect_changes — what changed recently
mcp__gitnexus__cypher         — raw Cypher query on the graph
```

Use GitNexus before large refactors or when unsure what a change will break.

---

## Rule 5: TDD — Tests First

Write failing tests before implementing:

```bash
bunx vitest run tests/dashboard/components/github/MyComponent.test.tsx  # confirm fail
bun run test   # implement until green
bun run lint   # type check
```

**SSR + Zustand gotcha:** `useSyncExternalStore` in SSR mode does not reflect state
set in `beforeEach`. Use pure logic unit tests for store-dependent behaviour —
test the filter/sort/format functions directly, not the rendered output.

---

## Rule 6: Docker Lifecycle

```bash
make rebuild    # full rebuild (no cache) + restart
make up         # start (cached build)
make logs       # follow logs
make down       # stop + remove
```

After any dashboard or API change, `make rebuild` to verify in the container.

---

## Rule 7: Secrets

Never print secret values. Use placeholders: `TOKEN=<redacted>`.

---

## Rule 8: Parallel Work

Each parallel agent uses its own git worktree:

```bash
git worktree add ../agent-forge-ISSUE-ID -b feat/ISSUE-ID main
```

---

## Rule 9: Monitoring

Exponential backoff when polling: 5s → 10s → 20s → 40s → 60s cap.
Run monitors as background processes when possible.

---

## Session Close Protocol

Before saying "done":

```
[ ] git status              — check what changed
[ ] git add <files>         — stage code changes
[ ] bd dolt pull            — sync beads before commit
[ ] git commit -m "..."     — commit
[ ] bd close <ids>          — close completed issues
```

---

## Key Project Constraints

- **Runtime:** Bun only — no Node APIs, no better-sqlite3
- **HTTP:** Hono only — no Express/Fastify
- **Icons:** @primer/octicons-react only — no emoji, no custom SVGs
- **CSS:** var(--*) custom properties only — no hardcoded hex values
- **State:** Zustand — no Redux, no Context API
- **Virtualizer:** @tanstack/react-virtual — use measureElement for dynamic row heights
- **Testing:** Vitest — environment node for backend, happy-dom for dashboard

---

**Full reference:** CLAUDE.md · ROADMAP.md · CHANGELOG.md · docs/omniforge-architecture.md

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **gitboard** (350 symbols, 759 relationships, 23 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST specify `repo: "gitboard"` in all gitnexus calls.** Without it, queries return empty results when multiple repos are indexed.
- **MUST run impact analysis before editing any symbol.** Run `gitnexus_impact({target: "symbolName", direction: "upstream", repo: "gitboard"})` and report blast radius.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept", repo: "gitboard"})` to find execution flows.
- When you need full context on a symbol, use `gitnexus_context({name: "symbolName", repo: "gitboard"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/gitboard/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/gitboard/context` | Codebase overview, check index freshness |
| `gitnexus://repo/gitboard/clusters` | All functional areas |
| `gitnexus://repo/gitboard/processes` | All execution flows |
| `gitnexus://repo/gitboard/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->

## Specialists

Call `specialist_init` at the start of every session to bootstrap context and
see available specialists. Use `use_specialist` or `start_specialist` to
delegate heavy tasks (code review, bug hunting, deep reasoning) to the right
specialist without user intervention.
iew, bug hunting, deep reasoning) to the right
specialist without user intervention.
ervention.
