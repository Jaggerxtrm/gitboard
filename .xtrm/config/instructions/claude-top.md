# XTRM Agent Workflow

> Full reference: [XTRM-GUIDE.md](XTRM-GUIDE.md) | Session manual: `/using-xtrm` skill
> Run `bd prime` at session start (or after `/compact`) for live beads workflow context.
> For command syntax, prefer `--help` (e.g. `bd --help`, `bv --help`, `xt --help`, `sp --help`) over copied tables.

## Session Start

1. `bd prime` — load workflow context and active claims
2. `bv --robot-triage` — ranked picks (or `bd ready` for raw queue)
3. `bd update <id> --claim` — claim before any file edit

## Execution Interaction Policy

- Proceed by default on standard implementation tasks once scope is clear.
- Do **not** ask repetitive "Proceed?" confirmations.
- Ask for confirmation only when actions are destructive, irreversible, or high-risk (e.g. `rm`, history rewrite, mass deletes, credential rotation, prod-impacting ops).
- Prefer concise clarifying questions only when requirements are genuinely ambiguous.

## Active Gates (hooks enforce these — not optional)

| Gate | Trigger | Required action |
|------|---------|-----------------|
| **Edit** | Write/Edit without active claim | `bd update <id> --claim` |
| **Commit** | `git commit` while claim is open | `bd close <id>` first, then commit |
| **Stop** | Session end with unclosed claim | `bd close <id>` |
| **Memory** | `bd close <id>` without issue ack | `bd remember "<insight>"` (or decide nothing novel), then `bd kv set "memory-acked:<id>" "saved:<key>"` (or `"nothing novel:<reason>"`), then retry `bd close <id> --reason="..."` |

## Essential commands

Tiny surface — for full syntax use `--help`.

- **Work**: `bd ready`, `bd list --status=in_progress`, `bd show <id>`, `bd update <id> --claim`, `bd close <id> --reason="…"`
- **Triage**: `bv --robot-triage` (use only `--robot-*` flags — bare `bv` opens a TUI that blocks the session)
- **Memory**: `bd remember "<insight>"`, `bd memories <kw>`, `bd recall <key>`
- **Specialists**: `sp list`, `sp ps`, `sp feed <job>`, `sp result <job>` — load `/using-specialists-v3` (or latest `/using-specialists-*`) for orchestration
- **Worktrees**: `xt claude` (new session), `xt end` (commit / push / PR / cleanup)

## Git Workflow

Strict: one branch per issue.

```bash
git checkout -b feature/<issue-id>-<slug>
bd update <id> --claim
# ... edit ...
bd close <id> --reason="..."
xt end
```

Never continue new work on a previously-shipped branch.

## Code Intelligence (mandatory before edits)

- **Serena** (`/using-serena-lsp`): symbol-aware reads and edits. Never grep-read-sed when symbolic tools are available.
- **GitNexus** MCP — required before touching any symbol:
  - `gitnexus_impact({target, direction: "upstream"})` — blast radius
  - `gitnexus_detect_changes()` — verify scope before commit
  - Stop and warn the user on HIGH/CRITICAL risk.
  - For deeper workflows: `/gitnexus-impact-analysis`, `/gitnexus-debugging`, `/gitnexus-refactoring`.

## Quality Gates (automatic on every edit, via PostToolUse hooks)

- TS/JS: ESLint + tsc
- Python: ruff + mypy

Fix failures before committing.

## Skill routing

| Need | Load |
|------|------|
| xtrm workflow / gates | `/using-xtrm` |
| Specialist orchestration | `/using-specialists-v3` (or latest available) |
| GitNexus impact / debug / refactor | `/gitnexus-impact-analysis`, `/gitnexus-debugging`, `/gitnexus-refactoring` |
| Service-scoped tasks | `/scope`, `/using-service-skills` |
| Release / session close | `/releasing`, `/xt-end`, `/session-close-report` |
