import { createConsoleReadModelContracts } from "./read-models.ts";

export type BridgeRetirementAction = "retain" | "retire";
export type BridgeSurfaceStatus = "temporary-bridge" | "durable-external-adapter";

export interface BridgeSurface {
  id: string;
  status: BridgeSurfaceStatus;
  action: BridgeRetirementAction;
  contracts: readonly string[];
  tables: readonly string[];
  routes: readonly string[];
  rationale: string;
}

export interface BridgeRetirementManifest {
  requiredContracts: readonly string[];
  bridgeSurfaces: readonly BridgeSurface[];
  durableSurfaces: readonly BridgeSurface[];
}

export interface BridgeRetirementReadinessInput {
  daemonServedContracts: readonly string[];
}

export interface BridgeRetirementReadiness {
  ready: boolean;
  action: BridgeRetirementAction;
  missingContracts: readonly string[];
  manifest: BridgeRetirementManifest;
}

export function createBridgeRetirementManifest(): BridgeRetirementManifest {
  const requiredContracts = createConsoleReadModelContracts().map((contract) => contract.id);
  return {
    requiredContracts,
    bridgeSurfaces: [
      {
        id: "beads-substrate-projection",
        status: "temporary-bridge",
        action: "retain",
        contracts: ["substrate.issue-graph", "graph.console-joins", "source-health.freshness"],
        tables: ["substrate_projects", "substrate_issues", "substrate_dependencies", "substrate_issue_edges", "substrate_job_link"],
        routes: ["/api/substrate", "/api/console/graph", "/api/feed"],
        rationale: "Retain until native issue, dependency, graph join, and source-health reads are daemon-served.",
      },
      {
        id: "specialists-observability-projection",
        status: "temporary-bridge",
        action: "retain",
        contracts: ["specialists.activity-evidence", "feed.rollups", "graph.console-joins", "source-health.freshness"],
        tables: ["specialist_jobs", "xtrm_forensic_events", "xtrm_evidence_refs", "materialization_state"],
        routes: ["/api/specialists", "/api/feed", "/api/console/graph", "/api/internal/logs"],
        rationale: "Retain while specialist activity, evidence drilldowns, feed rollups, and websocket hints depend on bridge materialization.",
      },
      {
        id: "source-health-bridge-state",
        status: "temporary-bridge",
        action: "retain",
        contracts: ["source-health.freshness"],
        tables: ["sources", "materialization_state"],
        routes: ["/api/sources", "/api/substrate/projects/:projectId/connection", "/api/specialists/jobs/in-flight"],
        rationale: "Retain degraded-but-readable source health until daemon freshness state is queryable.",
      },
    ],
    durableSurfaces: [
      {
        id: "github-adapter-state",
        status: "durable-external-adapter",
        action: "retain",
        contracts: [],
        tables: ["github_repo_poll_state", "github_repo_prs", "github_repo_events"],
        routes: ["/api/github"],
        rationale: "GitHub poller/store is durable external adapter state, not Beads/Specialists bridge cleanup.",
      },
    ],
  };
}

export function evaluateBridgeRetirementReadiness(input: BridgeRetirementReadinessInput): BridgeRetirementReadiness {
  const manifest = createBridgeRetirementManifest();
  const served = new Set(input.daemonServedContracts);
  const missingContracts = manifest.requiredContracts.filter((contract) => !served.has(contract));
  return {
    ready: missingContracts.length === 0,
    action: missingContracts.length === 0 ? "retire" : "retain",
    missingContracts,
    manifest,
  };
}
