# Agent Forge

A CLI/TUI orchestrator for AI agents using tmux as execution layer, declarative YAML protocols for multi-agent communication, and a boss/worker model for coordination.

## Status

**Pre-development** - See [docs/PRD.md](docs/PRD.md) for the full product requirements document.

## Core Concepts

- **Profiles** (Body): YAML definitions for how to start, resume, and detect status of any CLI agent
- **Specialists** (Brain): `.specialist.yaml` definitions for domain-specific knowledge, prompts, and execution config
- **Protocols**: Declarative YAML workflows for multi-agent orchestration (collaborative, adversarial, troubleshoot, handshake)
- **Sessions**: Persistent tmux-based agent sessions with SQLite state tracking

## Architecture

```
LAYER 4: UI          TUI Dashboard + Registry Browser + CLI
LAYER 3: Orchestration   Protocol Engine + Routing Engine + Message Bus
LAYER 2: Execution       Session Store + tmux Manager
LAYER 1: Identity        Agent Profiles (Body) + Specialist Defs (Brain)
```

## Tech Stack

- **Runtime**: TypeScript / Bun
- **TUI**: Ink (React for terminals)
- **State**: SQLite (better-sqlite3)
- **Execution**: tmux
- **Validation**: Zod

## Prerequisites

- tmux 3.3+
- Bun 1.0+ (or Node.js 20+)
- At least one CLI agent installed (claude, gemini, qwen, etc.)
