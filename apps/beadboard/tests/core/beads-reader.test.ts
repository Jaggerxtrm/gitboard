import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { Database } from "bun:sqlite";
import { BeadsReader } from "../../src/core/beads-reader.ts";

describe("BeadsReader", () => {
  let tempDir: string;
  let db: Database;
  let reader: BeadsReader;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `beadboard-reader-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    // Create in-memory SQLite database for testing
    db = new Database(":memory:");

    // Create beads schema
    db.run(`
      CREATE TABLE issues (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        priority INTEGER NOT NULL DEFAULT 2,
        issue_type TEXT NOT NULL DEFAULT 'task',
        owner TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT,
        updated_at TEXT,
        closed_at TEXT,
        close_reason TEXT
      )
    `);

    db.run(`
      CREATE TABLE dependencies (
        from_issue TEXT NOT NULL,
        to_issue TEXT NOT NULL,
        dependency_type TEXT NOT NULL DEFAULT 'blocks',
        PRIMARY KEY (from_issue, to_issue, dependency_type)
      )
    `);

    db.run(`
      CREATE TABLE issue_labels (
        issue_id TEXT NOT NULL,
        label TEXT NOT NULL,
        PRIMARY KEY (issue_id, label)
      )
    `);

    // Insert test data - use separate INSERT statements for different column counts
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    db.run(`INSERT INTO issues (id, title, status, priority, issue_type, created_at, updated_at) VALUES ('forge-001', 'Test issue 1', 'open', 1, 'feature', ?, ?)`, [now, now]);
    db.run(`INSERT INTO issues (id, title, status, priority, issue_type, created_at, updated_at) VALUES ('forge-002', 'Test issue 2', 'in_progress', 2, 'task', ?, ?)`, [now, now]);
    db.run(`INSERT INTO issues (id, title, status, priority, issue_type, created_at, updated_at, closed_at) VALUES ('forge-003', 'Test issue 3', 'closed', 3, 'bug', ?, ?, ?)`, [now, now, yesterday]);

    db.run(`INSERT INTO dependencies (from_issue, to_issue, dependency_type) VALUES ('forge-002', 'forge-001', 'blocks')`);

    db.run(`INSERT INTO issue_labels (issue_id, label) VALUES ('forge-001', 'frontend')`);
    db.run(`INSERT INTO issue_labels (issue_id, label) VALUES ('forge-001', 'urgent')`);

    reader = new BeadsReader(db);
  });

  afterEach(async () => {
    db.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("getIssues", () => {
    it("returns all issues when no filters", async () => {
      const issues = await reader.getIssues({});
      expect(issues.length).toBe(3);
    });

    it("filters by status", async () => {
      const openIssues = await reader.getIssues({ status: ["open"] });
      expect(openIssues.length).toBe(1);
      expect(openIssues[0].id).toBe("forge-001");
    });

    it("filters by priority", async () => {
      const highPriority = await reader.getIssues({ priority: [1] });
      expect(highPriority.length).toBe(1);
      expect(highPriority[0].priority).toBe(1);
    });

    it("includes dependencies in results", async () => {
      const issues = await reader.getIssues({});
      const issue2 = issues.find(i => i.id === "forge-002");
      expect(issue2?.dependencies.length).toBe(1);
      expect(issue2?.dependencies[0].id).toBe("forge-001");
    });

    it("includes labels in results", async () => {
      const issues = await reader.getIssues({});
      const issue1 = issues.find(i => i.id === "forge-001");
      expect(issue1?.labels).toContain("frontend");
      expect(issue1?.labels).toContain("urgent");
    });
  });

  describe("getClosedIssues", () => {
    it("returns only closed issues", async () => {
      const closed = await reader.getClosedIssues(10);
      expect(closed.length).toBe(1);
      expect(closed[0].status).toBe("closed");
    });

    it("orders by closed_at DESC", async () => {
      // Add another closed issue with more recent closed_at
      const now = new Date().toISOString();
      db.run(`INSERT INTO issues (id, title, status, priority, issue_type, created_at, updated_at, closed_at) VALUES ('forge-004', 'Recently closed', 'closed', 2, 'task', ?, ?, ?)`, [now, now, now]);

      const closed = await reader.getClosedIssues(10);
      expect(closed[0].id).toBe("forge-004"); // Most recently closed
    });

    it("respects limit parameter", async () => {
      const now = new Date().toISOString();
      // Add more closed issues
      for (let i = 5; i <= 10; i++) {
        db.run(`INSERT INTO issues (id, title, status, priority, issue_type, created_at, updated_at, closed_at) VALUES ('forge-0${i}', 'Closed ${i}', 'closed', 2, 'task', ?, ?, ?)`, [now, now, now]);
      }

      const closed = await reader.getClosedIssues(3);
      expect(closed.length).toBe(3);
    });
  });

  describe("getMemories", () => {
    it("reads memories from knowledge.jsonl", async () => {
      const knowledgePath = join(tempDir, "knowledge.jsonl");
      await writeFile(
        knowledgePath,
        JSON.stringify({
          id: "mem-001",
          content: "Learned something important",
          type: "learned",
          tags: ["architecture"],
          created_at: new Date().toISOString(),
        }) + "\n" +
        JSON.stringify({
          id: "mem-002",
          content: "Investigation result",
          type: "investigation",
          tags: ["bug"],
          created_at: new Date().toISOString(),
        }) + "\n"
      );

      const memories = await reader.getMemories(knowledgePath);
      expect(memories.length).toBe(2);
      expect(memories[0].type).toBe("learned");
    });
  });

  describe("getInteractions", () => {
    it("parses interactions.jsonl for agent sessions", async () => {
      const interactionsPath = join(tempDir, "interactions.jsonl");
      await writeFile(
        interactionsPath,
        JSON.stringify({
          id: "int-001",
          kind: "tool_call",
          created_at: new Date().toISOString(),
          actor: "user@example.com",
          issue_id: "forge-001",
          model: "anthropic/claude-3-opus",
          tool_name: "edit_file",
          exit_code: 0,
        }) + "\n"
      );

      const interactions = await reader.getInteractions(interactionsPath);
      expect(interactions.length).toBe(1);
      expect(interactions[0].model).toContain("claude");
    });
  });

  describe("inferAgent", () => {
    it("detects claude from model string", () => {
      expect(BeadsReader.inferAgent("anthropic/claude-3-opus")).toBe("claude");
      expect(BeadsReader.inferAgent("claude-haiku-4")).toBe("claude");
    });

    it("detects qwen from model string", () => {
      expect(BeadsReader.inferAgent("qwen-2.5-coder")).toBe("qwen");
    });

    it("detects gemini from model string", () => {
      expect(BeadsReader.inferAgent("gemini-2.0-flash")).toBe("gemini");
    });

    it("returns other for unknown models", () => {
      expect(BeadsReader.inferAgent("gpt-4")).toBe("other");
      expect(BeadsReader.inferAgent(undefined)).toBe("other");
    });
  });
});
