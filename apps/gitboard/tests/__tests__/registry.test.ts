import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../src/server/observability/config.ts", () => ({
  getObservabilityConfig: vi.fn(),
}));

import { getObservabilityConfig } from "../../src/server/observability/config.ts";
import { listRepos } from "../../src/server/observability/registry.ts";

const mockedConfig = vi.mocked(getObservabilityConfig);

describe("listRepos", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scans tmp tree and returns stable slugs", () => {
    const root = mkdtempSync(join(tmpdir(), "gitboard-observability-"));
    const alpha = join(root, "alpha-repo");
    const beta = join(root, "beta-repo");
    const alphaDup = join(root, "nested", "alpha-repo");

    mkdirSync(alpha, { recursive: true });
    mkdirSync(beta, { recursive: true });
    mkdirSync(alphaDup, { recursive: true });

    const alphaDb = join(alpha, "observability.db");
    const betaDb = join(beta, "observability.db");
    const alphaDupDb = join(alphaDup, "observability.db");

    writeFileSync(alphaDb, "a");
    writeFileSync(betaDb, "b");
    writeFileSync(alphaDupDb, "c");

    mockedConfig.mockReturnValue({ roots: [root] });

    const first = listRepos();
    const second = listRepos();

    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
    expect(first.map((entry) => entry.repoSlug)).toEqual(["alpha-repo", first[1].repoSlug, "beta-repo"]);
    expect(first[1].repoSlug).toMatch(/^alpha-repo-[a-f0-9]{8}$/);

    rmSync(root, { recursive: true, force: true });
  });

  it("returns empty list for empty roots", () => {
    mockedConfig.mockReturnValue({ roots: [] });
    expect(listRepos()).toEqual([]);
  });

  it("skips unreadable directory without throw", () => {
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

    expect(() => listRepos()).not.toThrow();

    rmSync(root, { recursive: true, force: true });
    readdirSpy.mockRestore();
  });
});
