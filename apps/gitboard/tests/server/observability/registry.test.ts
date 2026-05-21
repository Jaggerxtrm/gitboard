import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../../src/server/observability/config.ts", () => ({
  getObservabilityConfig: vi.fn(),
}));

import { getObservabilityConfig } from "../../../src/server/observability/config.ts";

const mockedConfig = getObservabilityConfig as unknown as { mockReturnValue: (value: { roots: string[] }) => void };

async function importRegistry() {
  return await import("../../../src/server/observability/registry.ts");
}

describe("listRepos cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("scans filesystem once across repeated calls", async () => {
    const root = mkdtempSync(join(tmpdir(), "gitboard-observability-"));
    const repo = join(root, "alpha-repo");
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, "observability.db"), "a");

    mockedConfig.mockReturnValue({ roots: [root] });

    const actualReaddirSync = fs.readdirSync;
    const readdirSpy = vi.spyOn(fs, "readdirSync").mockImplementation((path, options) => {
      return actualReaddirSync(path, options as Parameters<typeof fs.readdirSync>[1]);
    });

    const { listRepos } = await importRegistry();

    const first = listRepos();
    const second = listRepos();
    const third = listRepos();

    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(readdirSpy).toHaveBeenCalledTimes(1);

    rmSync(root, { recursive: true, force: true });
  });

  it("rescans after refresh window", async () => {
    const root = mkdtempSync(join(tmpdir(), "gitboard-observability-"));
    const repo = join(root, "alpha-repo");
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, "observability.db"), "a");

    mockedConfig.mockReturnValue({ roots: [root] });

    const actualReaddirSync = fs.readdirSync;
    const readdirSpy = vi.spyOn(fs, "readdirSync").mockImplementation((path, options) => {
      return actualReaddirSync(path, options as Parameters<typeof fs.readdirSync>[1]);
    });

    const { listRepos } = await importRegistry();

    listRepos();
    vi.advanceTimersByTime(10_001);
    listRepos();

    expect(readdirSpy).toHaveBeenCalledTimes(2);

    rmSync(root, { recursive: true, force: true });
  });
});
