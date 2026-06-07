import { describe, expect, it } from "vitest";
import { createBridgeRetirementManifest, createConsoleReadModelContracts, evaluateBridgeRetirementReadiness } from "../src/state/index.ts";

describe("bridge retirement gate", () => {
  it("retains bridge surfaces until every Console read model is daemon-served", () => {
    const readiness = evaluateBridgeRetirementReadiness({
      daemonServedContracts: ["substrate.issue-graph", "specialists.activity-evidence"],
    });

    expect(readiness).toMatchObject({
      ready: false,
      action: "retain",
    });
    expect(readiness.missingContracts).toEqual(["feed.rollups", "graph.console-joins", "source-health.freshness"]);
    expect(readiness.manifest.bridgeSurfaces.map((surface) => surface.action)).toEqual(["retain", "retain", "retain"]);
  });

  it("allows temporary bridge retirement only after all required contracts are served", () => {
    const daemonServedContracts = createConsoleReadModelContracts().map((contract) => contract.id);
    const readiness = evaluateBridgeRetirementReadiness({ daemonServedContracts });

    expect(readiness.ready).toBe(true);
    expect(readiness.action).toBe("retire");
    expect(readiness.missingContracts).toEqual([]);
  });

  it("keeps GitHub adapter state out of Beads and Specialists bridge cleanup", () => {
    const manifest = createBridgeRetirementManifest();

    expect(manifest.bridgeSurfaces.flatMap((surface) => surface.tables)).toContain("specialist_jobs");
    expect(manifest.bridgeSurfaces.flatMap((surface) => surface.tables)).not.toContain("github_repo_poll_state");
    expect(manifest.durableSurfaces).toContainEqual(expect.objectContaining({
      id: "github-adapter-state",
      action: "retain",
      status: "durable-external-adapter",
    }));
  });
});
