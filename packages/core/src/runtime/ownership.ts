export type RuntimeOwner = "apps/gitboard" | "packages/core" | "apps/console" | "external";
export type RuntimeSurfaceKind = "schema" | "host" | "materializer" | "read-model" | "source-lifecycle" | "adapter" | "shell";
export type RuntimeMigrationRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RuntimeMigrationState = "current-app-runtime" | "core-target-defined" | "core-owned" | "compatibility-shell" | "deprecated";

export interface RuntimeSurface {
  id: string;
  kind: RuntimeSurfaceKind;
  state: RuntimeMigrationState;
  currentOwner: RuntimeOwner;
  targetOwner: RuntimeOwner;
  currentPaths: readonly string[];
  targetExport: string;
  knownHighRiskSymbols: readonly string[];
  preserves: readonly string[];
  deprecationGate: string;
  nextBead: string;
  dependsOn: readonly string[];
}

export interface GitboardRuntimeOwnershipMap {
  appShellTarget: RuntimeSurface;
  surfaces: readonly RuntimeSurface[];
}

export interface RuntimeDeprecationReadiness {
  ready: boolean;
  missingSurfaceIds: readonly string[];
  appShellTarget: RuntimeSurface;
}

export function createGitboardRuntimeOwnershipMap(): GitboardRuntimeOwnershipMap {
  const appShellTarget: RuntimeSurface = {
    id: "gitboard-compatibility-shell",
    kind: "shell",
    state: "core-target-defined",
    currentOwner: "apps/gitboard",
    targetOwner: "apps/gitboard",
    currentPaths: ["apps/gitboard/src/index.ts", "apps/gitboard/src/api/server.ts", "apps/gitboard/src/dashboard"],
    targetExport: "@xtrm/core/runtime",
    knownHighRiskSymbols: ["createApp"],
    preserves: ["mounted HTTP routes", "static dashboard serving", "websocket upgrade handling", "local staging startup"],
    deprecationGate: "All runtime surfaces are core-owned and app files only mount routes/static assets or re-export compatibility wrappers.",
    nextBead: "forge-6oae.8",
    dependsOn: ["runtime-host", "materializer-runtime", "console-read-models", "source-lifecycle", "github-adapter"],
  };

  return {
    appShellTarget,
    surfaces: [
      {
        id: "xtrm-state-schema",
        kind: "schema",
        state: "core-target-defined",
        currentOwner: "apps/gitboard",
        targetOwner: "packages/core",
        currentPaths: ["apps/gitboard/src/core/xtrm-store.ts"],
        targetExport: "@xtrm/core/state",
        knownHighRiskSymbols: ["createXtrmDatabase"],
        preserves: ["table names", "additive migration idempotency", "materialization cursors", "forensic/evidence tables", "source health tables"],
        deprecationGate: "apps/gitboard/src/core/xtrm-store.ts delegates to the core state initializer and carries no schema ownership.",
        nextBead: "forge-6oae.2",
        dependsOn: [],
      },
      {
        id: "runtime-host",
        kind: "host",
        state: "core-target-defined",
        currentOwner: "apps/gitboard",
        targetOwner: "packages/core",
        currentPaths: ["apps/gitboard/src/api/server.ts", "apps/gitboard/src/index.ts"],
        targetExport: "@xtrm/core/runtime",
        knownHighRiskSymbols: ["createApp", "startServer"],
        preserves: ["route mounting", "channel registry", "request timing logs", "internal logs", "health endpoint"],
        deprecationGate: "createApp/startServer become compatibility wiring over a core runtime host contract.",
        nextBead: "forge-6oae.3",
        dependsOn: [],
      },
      {
        id: "materializer-runtime",
        kind: "materializer",
        state: "core-target-defined",
        currentOwner: "apps/gitboard",
        targetOwner: "packages/core",
        currentPaths: ["apps/gitboard/src/core/materializer/index.ts", "apps/gitboard/src/server/beads/trigger-watcher.ts", "apps/gitboard/src/server/observability/watcher.ts"],
        targetExport: "@xtrm/core/materializer",
        knownHighRiskSymbols: ["Materializer"],
        preserves: ["cursor advancement", "transaction rollback", "materializer.run completed/failed events", "publish hints", "source queue coalescing"],
        deprecationGate: "Materializer implementation is exported by core and app materializer index is a wrapper only.",
        nextBead: "forge-6oae.4",
        dependsOn: ["xtrm-state-schema", "runtime-host"],
      },
      {
        id: "console-read-models",
        kind: "read-model",
        state: "core-target-defined",
        currentOwner: "apps/gitboard",
        targetOwner: "packages/core",
        currentPaths: ["apps/gitboard/src/api/routes/substrate.ts", "apps/gitboard/src/api/routes/specialists.ts", "apps/gitboard/src/api/routes/feed.ts", "apps/gitboard/src/api/routes/graph.ts", "apps/gitboard/src/core/graph-dao.ts"],
        targetExport: "@xtrm/core/state",
        knownHighRiskSymbols: ["createSubstrateRouter", "createSpecialistsRouter", "createFeedRouter", "createGraphRouter", "createGraphDao"],
        preserves: ["current DTOs", "feed cursor ordering", "forensic/evidence drilldowns", "degraded source-health semantics", "Console read/query only boundary"],
        deprecationGate: "Routes are HTTP adapters over core read-model services and API parity tests remain green.",
        nextBead: "forge-6oae.5",
        dependsOn: ["xtrm-state-schema", "runtime-host"],
      },
      {
        id: "source-lifecycle",
        kind: "source-lifecycle",
        state: "core-target-defined",
        currentOwner: "apps/gitboard",
        targetOwner: "packages/core",
        currentPaths: ["apps/gitboard/src/core/project-scanner.ts", "apps/gitboard/src/core/unified-scanner.ts", "apps/gitboard/src/core/beads-change-watcher.ts", "apps/gitboard/src/server/beads/trigger-watcher.ts", "apps/gitboard/src/server/observability/watcher.ts", "apps/gitboard/src/api/routes/sources.ts"],
        targetExport: "@xtrm/core/runtime",
        knownHighRiskSymbols: ["UnifiedScanner", "ProjectScanner", "BeadsChangeWatcher"],
        preserves: ["discovery roots", "source health statuses", "path redaction", "degraded-but-readable behavior", "observable attach/skip logs"],
        deprecationGate: "Core owns discovery/health services and app supplies only env/config.",
        nextBead: "forge-6oae.6",
        dependsOn: ["runtime-host"],
      },
      {
        id: "github-adapter",
        kind: "adapter",
        state: "core-target-defined",
        currentOwner: "apps/gitboard",
        targetOwner: "packages/core",
        currentPaths: ["apps/gitboard/src/core/github-store.ts", "apps/gitboard/src/core/github-poller.ts", "apps/gitboard/src/core/github-discover.ts", "apps/gitboard/src/core/github-readme.ts", "apps/gitboard/src/api/routes/github.ts"],
        targetExport: "@xtrm/core/github",
        knownHighRiskSymbols: ["GithubPoller"],
        preserves: ["durable GitHub tables", "poller skip behavior", "route DTOs", "channel publish behavior"],
        deprecationGate: "Core owns durable GitHub adapter state and app route/startup code only wires it.",
        nextBead: "forge-6oae.7",
        dependsOn: ["xtrm-state-schema", "runtime-host"],
      },
    ],
  };
}

export function getReadyRuntimeMigrationSurfaceIds(completedSurfaceIds: readonly string[] = []): string[] {
  const completed = new Set(completedSurfaceIds);
  return createGitboardRuntimeOwnershipMap().surfaces
    .filter((surface) => !completed.has(surface.id))
    .filter((surface) => surface.dependsOn.every((dependency) => completed.has(dependency)))
    .map((surface) => surface.id);
}

export function evaluateGitboardDeprecationReadiness(coreOwnedSurfaceIds: readonly string[]): RuntimeDeprecationReadiness {
  const ownership = createGitboardRuntimeOwnershipMap();
  const coreOwned = new Set(coreOwnedSurfaceIds);
  const missingSurfaceIds = ownership.surfaces
    .filter((surface) => surface.targetOwner === "packages/core")
    .filter((surface) => !coreOwned.has(surface.id))
    .map((surface) => surface.id);

  return {
    ready: missingSurfaceIds.length === 0,
    missingSurfaceIds,
    appShellTarget: ownership.appShellTarget,
  };
}
