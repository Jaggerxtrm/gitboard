import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../src/server/observability/config.ts", () => ({
  getObservabilityConfig: vi.fn(),
}));

import { getObservabilityConfig } from "../../src/server/observability/config.ts";
const mockedConfig = getObservabilityConfig as unknown as { mockReturnValue: (value: { roots: string[] }) => void };

async function importRegistry() {
  const registry = await import("../../src/server/observability/registry.ts");
  registry.__resetObservabilityRegistryForTests();
  return registry;
}

describe("listRepos", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scans tmp tree and returns stable slugs", async () => {
    const root = mkdtempSync(join(tmpdir(), "gitboard-observability-"));
    const dupRoot = mkdtempSync(join(tmpdir(), "gitboard-observability-"));
    const alpha = join(root, "alpha-repo");
    const beta = join(root, "beta-repo");
    const alphaDup = join(dupRoot, "alpha-repo");

    mkdirSync(alpha, { recursive: true });
    mkdirSync(beta, { recursive: true });
    mkdirSync(alphaDup, { recursive: true });

    const alphaDb = join(alpha, "observability.db");
    const betaDb = join(beta, "observability.db");
    const alphaDupDb = join(alphaDup, "observability.db");

    writeFileSync(alphaDb, "a");
    writeFileSync(betaDb, "b");
    writeFileSync(alphaDupDb, "c");

    mockedConfig.mockReturnValue({ roots: [root, dupRoot] });

    const { listRepos } = await importRegistry();

    const first = listRepos();
    const second = listRepos();

    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
    expect(first.map((entry) => entry.repoSlug)).toContain("alpha-repo");
    expect(first.map((entry) => entry.repoSlug)).toContain("beta-repo");
    expect(first.map((entry) => entry.repoSlug).filter((slug) => slug.startsWith("alpha-repo-") )).toHaveLength(1);

    rmSync(root, { recursive: true, force: true });
    rmSync(dupRoot, { recursive: true, force: true });
  });

  it("returns empty list for empty roots", async () => {
    mockedConfig.mockReturnValue({ roots: [] });
    const { listRepos } = await importRegistry();
    expect(listRepos()).toEqual([]);
  });

  it("skips unreadable directory without throw", async () => {
    const root = mkdtempSync(join(tmpdir(), "gitboard-observability-"));
    const unreadable = join(root, "blocked");
    mkdirSync(unreadable, { recursive: true });
    writeFileSync(join(unreadable, "observability.db"), "x");

    const actualReaddirSync = fs.readdirSync;
    const readdirSpy = vi.spyOn(fs, "readdirSync").mockImplementation((path, options) => {
      if (path === unreadable) throw new Error("denied");
      return actualReaddirSync(path, options as Parameters<typeof fs.readdirSync>[1]);
    });

    mockedConfig.mockReturnValue({ roots: [root] });

    const { listRepos } = await importRegistry();
    expect(() => listRepos()).not.toThrow();

    rmSync(root, { recursive: true, force: true });
    readdirSpy.mockRestore();
  });
});
