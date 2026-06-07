# Gitboard Runtime Deprecation Map

Status: active migration plan for `forge-6oae`.

`apps/gitboard` is still the live compatibility host. The target state is not to
break its HTTP surface, but to remove runtime ownership from the app: database
schema, materializer lifecycle, read-model SQL, source lifecycle, and durable
GitHub adapter state move to `packages/core`.

The typed source of truth for this map is
`packages/core/src/runtime/ownership.ts`.

## Ready Front

The safe first implementation front is:

- `xtrm-state-schema` (`forge-6oae.2`) — move `createXtrmDatabase` ownership to
  `@xtrm/core/state` while keeping the app wrapper.
- `runtime-host` (`forge-6oae.3`) — introduce `@xtrm/core/runtime` host
  contracts while keeping `createApp` and `startServer` compatible.

Only after those two are complete should the materializer, read-model, source
lifecycle, and GitHub adapter slices move.

## Runtime Surfaces

| Surface | Current owner | Target export | Gate |
|---|---|---|---|
| `xtrm-state-schema` | `apps/gitboard` | `@xtrm/core/state` | App `xtrm-store.ts` delegates to core and owns no schema logic |
| `runtime-host` | `apps/gitboard` | `@xtrm/core/runtime` | App server is compatibility wiring over a core host contract |
| `materializer-runtime` | `apps/gitboard` | `@xtrm/core/materializer` | App materializer index is a wrapper only |
| `console-read-models` | `apps/gitboard` | `@xtrm/core/state` | Routes are HTTP DTO adapters over core read-model services |
| `source-lifecycle` | `apps/gitboard` | `@xtrm/core/runtime` | Core owns discovery and health services; app supplies env/config |
| `github-adapter` | `apps/gitboard` | `@xtrm/core/github` | Core owns durable GitHub adapter state; app wires route/startup |

## Non-Negotiables

- Console remains UI/read/query only. It must not open SQLite or own runtime
  writes.
- Current API routes stay mounted during migration.
- Feed cursor ordering, forensic/evidence envelopes, source-health degraded
  semantics, websocket hints, and request/error/slow logs must remain stable.
- GitHub adapter state is durable runtime state, not temporary bridge cleanup.
- Production `gitboard.service` restart remains manual.
