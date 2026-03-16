import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm, mkdirSync } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { ProjectScanner } from "../../src/core/project-scanner.ts";

describe("ProjectScanner", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `beadboard-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("scanDirectory", () => {
    it("finds .beads/ directories", async () => {
      // Create a mock beads project
      const projectDir = join(tempDir, "test-project");
      const beadsDir = join(projectDir, ".beads");
      await mkdir(beadsDir, { recursive: true });

      // Create metadata.json
      await writeFile(
        join(beadsDir, "metadata.json"),
        JSON.stringify({ project_id: "test-123" })
      );

      const scanner = new ProjectScanner({ scanPaths: [tempDir] });
      const projects = await scanner.scanAll();

      expect(projects.length).toBeGreaterThan(0);
      expect(projects.find(p => p.id === "test-123")).toBeDefined();
    });

    it("reads metadata.json for project ID", async () => {
      const projectDir = join(tempDir, "my-project");
      const beadsDir = join(projectDir, ".beads");
      await mkdir(beadsDir, { recursive: true });

      await writeFile(
        join(beadsDir, "metadata.json"),
        JSON.stringify({ project_id: "custom-id-456", database: "dolt" })
      );

      const scanner = new ProjectScanner({ scanPaths: [tempDir] });
      const projects = await scanner.scanAll();

      const project = projects.find(p => p.path === projectDir);
      expect(project?.id).toBe("custom-id-456");
    });

    it("detects dolt server port from config.yaml", async () => {
      const projectDir = join(tempDir, "dolt-project");
      const beadsDir = join(projectDir, ".beads");
      await mkdir(beadsDir, { recursive: true });

      await writeFile(
        join(beadsDir, "metadata.json"),
        JSON.stringify({ project_id: "dolt-123" })
      );

      await writeFile(
        join(beadsDir, "config.yaml"),
        "dolt:\n  port: 13839\n  auto-start: true"
      );

      const scanner = new ProjectScanner({ scanPaths: [tempDir] });
      const projects = await scanner.scanAll();

      const project = projects.find(p => p.id === "dolt-123");
      expect(project?.doltPort).toBe(13839);
      expect(project?.status).toBe("active");
    });

    it("excludes configured patterns", async () => {
      // Create project in node_modules (should be excluded)
      const excludedDir = join(tempDir, "node_modules", "excluded-project");
      const beadsDir = join(excludedDir, ".beads");
      await mkdir(beadsDir, { recursive: true });
      await writeFile(
        join(beadsDir, "metadata.json"),
        JSON.stringify({ project_id: "excluded" })
      );

      // Create valid project
      const validDir = join(tempDir, "valid-project");
      const validBeadsDir = join(validDir, ".beads");
      await mkdir(validBeadsDir, { recursive: true });
      await writeFile(
        join(validBeadsDir, "metadata.json"),
        JSON.stringify({ project_id: "valid" })
      );

      const scanner = new ProjectScanner({ scanPaths: [tempDir] });
      const projects = await scanner.scanAll();

      expect(projects.find(p => p.id === "excluded")).toBeUndefined();
      expect(projects.find(p => p.id === "valid")).toBeDefined();
    });

    it("respects maxDepth configuration", async () => {
      // Create nested structure deeper than maxDepth
      const deepDir = join(tempDir, "a", "b", "c", "d", "deep-project");
      const beadsDir = join(deepDir, ".beads");
      await mkdir(beadsDir, { recursive: true });
      await writeFile(
        join(beadsDir, "metadata.json"),
        JSON.stringify({ project_id: "deep" })
      );

      const scanner = new ProjectScanner({ scanPaths: [tempDir], maxDepth: 2 });
      const projects = await scanner.scanAll();

      expect(projects.find(p => p.id === "deep")).toBeUndefined();
    });
  });

  describe("getProject", () => {
    it("returns cached project by ID", async () => {
      const projectDir = join(tempDir, "cached-project");
      const beadsDir = join(projectDir, ".beads");
      await mkdir(beadsDir, { recursive: true });
      await writeFile(
        join(beadsDir, "metadata.json"),
        JSON.stringify({ project_id: "cached-123" })
      );

      const scanner = new ProjectScanner({ scanPaths: [tempDir] });
      await scanner.scanAll();

      const cached = scanner.getProject("cached-123");
      expect(cached).toBeDefined();
      expect(cached?.name).toBe("cached-project");
    });
  });
});
