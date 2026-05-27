import { describe, expect, it } from "vitest";
import { canRefreshSources, createSourceRefreshState, formatSourceDisplayPath } from "../../../src/api/routes/sources-policy.ts";

describe("sources route safety", () => {
  it("redacts fallback display paths", () => {
    expect(formatSourceDisplayPath("/very/private/workspace/demo/.beads")).toBe("…/demo/.beads");
  });

  it("rate-limits repeated refresh attempts", () => {
    const state = createSourceRefreshState();
    state.lastCompletedAt = Date.now();
    const gate = canRefreshSources(Date.now(), state);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.status).toBe(429);
  });
});
