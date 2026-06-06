# XTRM Agent Workflow

> Full reference: [XTRM-GUIDE.md](XTRM-GUIDE.md)
> Run `bd prime` at session start (or after a context reset) for live beads workflow context.
> For command syntax, prefer `--help` (e.g. `bd --help`, `bv --help`, `xt --help`, `sp --help`).

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
- **Worktrees**: `xt claude` / `xt pi` (new session), `xt end` (commit / push / PR / cleanup)

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

## Quality Gates (automatic on every edit, via PostToolUse extension)

- TS/JS: ESLint + tsc
- Python: ruff + mypy

Fix failures before committing.

## Skill / workflow routing

| Need | Use |
|------|-----|
| xtrm / beads workflow | `/using-xtrm`, `bd --help`, `xt --help` |
| Specialist orchestration | latest `/using-specialists-*`, prefer `/using-specialists-v3`; `sp --help` |
| Service-scoped tasks | `/scope`, `/using-service-skills` |
| Planning / tests / docs | `/planning`, `/test-planning`, `/sync-docs` |

## Runtime notes

- Pi: use the process extension for long-running commands.
- Generic agents: do not assume Claude-only tools; use whatever code-navigation tools the runtime provides.
