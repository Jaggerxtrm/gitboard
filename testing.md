# Production Live Tools Testing Guide

Use this checklist to validate **all project skills and project hooks** in a real project environment.

## Scope

Project skills covered:
- `py-quality-gate`
- `ts-quality-gate`
- `tdd-guard`
- `service-skills-set`

Serena edit-tool matchers covered:
- `mcp__serena__rename_symbol`
- `mcp__serena__replace_symbol_body`
- `mcp__serena__insert_after_symbol`
- `mcp__serena__insert_before_symbol`

---

## Global Preflight

- [x] `xtrm --version` returns expected release. *(2.1.5)*
- [x] `claude --version` is available. *(2.1.75)*
- [x] `xtrm install` completed successfully for `~/.claude`.
- [x] Inside target repo: `xtrm project init` runs and ends with `bd init`.

---

## Project Setup

- [x] In target repo, run:
  - [x] `xtrm install project py-quality-gate`
  - [x] `xtrm install project ts-quality-gate`
  - [x] `xtrm install project tdd-guard`
  - [x] `xtrm install project service-skills-set`
- [x] Confirm installed docs exist:
  - [x] `.claude/docs/py-quality-gate-readme.md`
  - [x] `.claude/docs/ts-quality-gate-readme.md`
  - [x] `.claude/docs/tdd-guard-readme.md`
  - [x] `.claude/docs/service-skills-set-readme.md`

---

## Hook Wiring Verification

- [x] Open `.claude/settings.json` and verify these hook entries exist:
  - [x] `PostToolUse` matcher for `py-quality-gate` includes all Serena tool names.
  - [x] `PostToolUse` matcher for `ts-quality-gate` includes all Serena tool names.
  - [x] `PreToolUse` matcher for `tdd-guard` includes all Serena tool names.
  - [x] `PreToolUse` and `PostToolUse` matchers for `service-skills-set` include all Serena tool names.
- [x] Confirm bridge script exists:
  - [x] `.claude/hooks/tdd-guard-pretool-bridge.cjs`

---

## TDD Guard Reporter Setup

- [x] `tdd-guard-vitest@0.1.6` installed as dev dependency.
- [x] `VitestReporter` wired into `vitest.config.ts` with project root.
- [x] `vitest` upgraded to `^3.2.4` (minimum required by reporter API).
- [x] `bun run test` writes `.claude/tdd-guard/data/test.json` after each run.
- [x] All 210 tests pass on vitest v3.

---

## Live Skill Tests

### 1) PY Quality Gate

- [x] Edit a Python file with a clear lint/type issue — hook fires and reports errors (mypy catches int+str, undefined name, invalid type).
- [x] Blocking behavior occurs for unresolved critical issues (exit 2).
- [~] Repeat using Serena edit tool — **BUG**: hook exits 0 silently; `relative_path` not extracted. *(jaggers-agent-tools-bct)*

### 2) TS Quality Gate

- [x] Hook runs after `Write` edit (`PostToolUse`) and reports issues.
- [x] TypeScript compilation check passes on clean files.
- [~] `debugger` rule in `hook-config.json` not enforced — **BUG**: zero implementation in `quality-check.cjs`. *(jaggers-agent-tools-5y5)*
- [~] Repeat using Serena edit tool — **BUG**: same `relative_path` extraction miss as py gate. *(jaggers-agent-tools-bct)*

### 3) TDD Guard

- [x] `tdd-guard --prompt-check` runs (returns empty reason in non-session context — expected).
- [x] `tdd-guard --session-init` runs on session start.
- [x] **Non-code bypass check**: `.md` file skipped by bridge — no false TDD block.
- [x] Serena edit check: bridge correctly routes `mcp__serena__rename_symbol` on `.ts` files to `tdd-guard`.
- [x] `tdd-guard-pretool-bridge.cjs` handles `relative_path` correctly (unlike quality hooks).

### 4) Service Skills Set

- [x] `SessionStart` cataloger runs (no output because `service-registry.json` has no registered services — expected for fresh install).
- [x] `PreToolUse` skill activator runs without errors.
- [x] `PostToolUse` drift detector runs without errors.
- [x] Git hooks installed and executable:
  - [x] `.githooks/pre-commit`
  - [x] `.githooks/pre-push`
- [~] Git hooks never execute — **BUG**: `core.hooksPath` is `.beads/hooks`; installer doesn't chain into it. *(jaggers-agent-tools-mxt)*

---

## Main-Guard / Beads Gate (Global Hook Sanity)

- [x] On `main` branch, `Write`/`Edit`/`MultiEdit` attempts are blocked with deny response.
- [~] Serena edit tools bypass main-guard — **BUG**: not in `WRITE_TOOLS` set. *(jaggers-agent-tools-i8m)*
- [x] In `.beads` project without active claim, beads gate blocks `Write` (exit 2).
- [x] Beads gate correctly blocks Serena tools when no active claim.
- [x] After claim (`bd update <id> --status=in_progress` + kv claim), Serena edit is allowed.

---

## Pass Criteria

- [~] All four project skills execute their intended hooks. *(py/ts gate miss Serena file path)*
- [~] All Serena edit operations trigger the same hook class as normal edits. *(main-guard bypass; quality gate file path miss)*
- [x] No false-positive TDD block on markdown/non-code edits.
- [x] No missing hook script path errors.
- [ ] Team can reproduce results on a clean machine following this guide.

---

## Issues Filed (xtrm-tools)

| ID | Priority | Summary |
|----|----------|---------|
| jaggers-agent-tools-i8m | P0 | main-guard: Serena edit tools bypass branch protection on main/master |
| jaggers-agent-tools-bct | P1 | py/ts quality-gate hooks silently skip Serena edits (`relative_path` not extracted) |
| jaggers-agent-tools-mxt | P1 | service-skills-set: git hooks not executed when `core.hooksPath` is `.beads/hooks` |
| jaggers-agent-tools-5y5 | P2 | ts quality-gate: `debugger` rule in hook-config.json is never enforced |

---

## Failure Logging Template

Use this for any failed check:

- [ ] Skill/hook:
- [ ] Command/tool invoked:
- [ ] Expected:
- [ ] Actual:
- [ ] Transcript path:
- [ ] Proposed fix:
