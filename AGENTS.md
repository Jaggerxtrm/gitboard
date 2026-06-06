# xtrm — Agent Guide

## Project summary

Bun monorepo for the **xtrm** agent orchestration + GitHub-activity stack.

- `apps/gitboard` (`@xtrm/gitboard`) — primary backend / materializer; serves the dashboard built with Vite.
- `apps/console` — `console` frontend (served at `/console`).
- `packages/{core, api-client, html-preview, ui}` — shared TypeScript libs.

Runtime: Bun + TypeScript; tests via Vitest. Deploys as a `gitboard.service` systemd user unit.

## Project map

- `apps/gitboard/src/` — API routes, materializer, core domain logic
- `apps/console/` — frontend UI
- `packages/core/` — shared materializer / domain primitives
- `packages/api-client/` — typed client for `/api/*`
- `.xtrm/` — agent workflow config (instructions, hooks, MCP, settings)
- `XTRM-GUIDE.md` — full xtrm workflow reference

## Essential build / test

- `bun install` — install workspace deps
- `bun run build` — full build (packages then apps)
- `bun run --filter @xtrm/gitboard test` — gitboard tests (Vitest)
- `bun run --filter @xtrm/gitboard lint` — gitboard typecheck

---

<!-- xtrm:start -->
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
<!-- xtrm:end -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **gitboard** (6589 symbols, 13452 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report blast radius (callers, affected processes, risk) before modifying any function, class, or method.
- **MUST run `gitnexus_detect_changes()` before committing** to verify scope.
- **MUST warn the user** on HIGH or CRITICAL risk before proceeding.
- Prefer `gitnexus_query({query})` over grep for unfamiliar code; `gitnexus_context({name})` for symbol-level context.

## Never Do

- NEVER edit symbols without first running `gitnexus_impact`.
- NEVER ignore HIGH or CRITICAL risk warnings.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename`.
- NEVER commit without running `gitnexus_detect_changes()`.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/gitboard/context` | Codebase overview + index freshness |
| `gitnexus://repo/gitboard/clusters` | Functional areas |
| `gitnexus://repo/gitboard/processes` | Execution flows |
| `gitnexus://repo/gitboard/process/{name}` | Step-by-step trace |

For task-specific GitNexus workflows, load the matching `/gitnexus-*` skill.
<!-- gitnexus:end -->
