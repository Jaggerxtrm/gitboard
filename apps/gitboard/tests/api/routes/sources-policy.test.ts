import { describe, expect, it } from "vitest";
import { canRefreshSources, createSourceRefreshState, formatSourceDisplayPath } from "../../../src/api/routes/sources-policy.ts";

describe("sources policy helpers", () => {
  it("redacts display paths", () => {
    expect(formatSourceDisplayPath("/very/private/workspace/demo/.beads")).toBe("…/demo/.beads");
  });

  it("rate-limits repeat refresh calls", () => {
    const state = createSourceRefreshState();
    state.lastCompletedAt = Date.now();
    const gate = canRefreshSources(Date.now(), state);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.status).toBe(429);
  });

  it("reports in-flight refresh as 202", () => {
    const state = createSourceRefreshState();
    state.inFlight = Promise.resolve();
    const gate = canRefreshSources(Date.now(), state);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.status).toBe(202);
  });
});
