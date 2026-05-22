import { describe, expect, it } from "vitest";

describe("getObservabilityConfig", () => {
  it("defaults to dev and projects roots", async () => {
    const { DEFAULT_ROOTS } = await import("../../../src/server/observability/config.ts");

    expect(DEFAULT_ROOTS).toEqual(["~/dev/*", "~/projects/*"]);
  });
});
