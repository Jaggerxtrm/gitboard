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
