import { describe, expect, it } from "vitest";
import { createGitboardRuntimeOwnershipMap, evaluateGitboardDeprecationReadiness, getReadyRuntimeMigrationSurfaceIds } from "../src/runtime/index.ts";

describe("gitboard runtime ownership map", () => {
  it("keeps apps/console out of runtime ownership", () => {
    const ownership = createGitboardRuntimeOwnershipMap();
    const owners = [ownership.appShellTarget, ...ownership.surfaces].map((surface) => surface.currentOwner);

    expect(owners).not.toContain("apps/console");
  });

  it("classifies the high-risk app runtime surfaces before extraction", () => {
    const ownership = createGitboardRuntimeOwnershipMap();
    const surfacesById = new Map(ownership.surfaces.map((surface) => [surface.id, surface]));

    expect(surfacesById.get("xtrm-state-schema")?.knownHighRiskSymbols).toContain("createXtrmDatabase");
    expect(surfacesById.get("runtime-host")?.knownHighRiskSymbols).toContain("createApp");
    expect(surfacesById.get("materializer-runtime")?.knownHighRiskSymbols).toContain("Materializer");
    expect(surfacesById.get("github-adapter")?.preserves).toContain("durable GitHub tables");
  });

  it("exposes the safe ready front for sequential migration", () => {
    expect(getReadyRuntimeMigrationSurfaceIds()).toEqual(["xtrm-state-schema", "runtime-host"]);
    expect(getReadyRuntimeMigrationSurfaceIds(["xtrm-state-schema", "runtime-host"])).toEqual([
      "materializer-runtime",
      "console-read-models",
      "source-lifecycle",
      "github-adapter",
    ]);
  });

  it("blocks gitboard deprecation until every core-owned surface has moved", () => {
    const ownership = createGitboardRuntimeOwnershipMap();
    const partial = evaluateGitboardDeprecationReadiness(["xtrm-state-schema", "runtime-host"]);

    expect(partial.ready).toBe(false);
    expect(partial.missingSurfaceIds).toContain("materializer-runtime");
    expect(partial.appShellTarget.id).toBe("gitboard-compatibility-shell");

    const complete = evaluateGitboardDeprecationReadiness(ownership.surfaces.map((surface) => surface.id));
    expect(complete.ready).toBe(true);
    expect(complete.missingSurfaceIds).toEqual([]);
  });
});
