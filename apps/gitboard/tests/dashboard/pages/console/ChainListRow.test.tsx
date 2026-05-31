import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("apps/gitboard/src/dashboard/pages/console/specialists/ChainListRow.tsx", "utf8");
const palette = readFileSync("apps/gitboard/src/dashboard/lib/type-palette.ts", "utf8");

describe("ChainListRow", () => {
  it("keeps two-line row contract in source", () => {
    expect(source).toContain("console-specialists-chain-row-identity");
    expect(source).toContain("console-specialists-chain-row-meta");
    expect(source).toContain("chain.rootBeadId");
    expect(source).toContain("chain.title");
    expect(source).toContain("chain.roles[0]?.role ?? \"unknown\"");
    expect(source).toContain("chain.jobs[chain.jobs.length - 1]?.jobId ?? chain.chainId");
  });

  it("keeps shared type palette colors", () => {
    expect(palette).toContain('bug: { label: "Bug", color: "#ff4d5e" }');
    expect(palette).toContain('feature: { label: "Feature", color: "#4169e1" }');
    expect(palette).toContain('task: { label: "Task", color: "var(--text-muted)" }');
    expect(palette).toContain('epic: { label: "Epic", color: "rgba(163,113,247,0.95)" }');
  });
});
