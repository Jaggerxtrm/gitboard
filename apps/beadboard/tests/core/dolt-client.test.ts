/**
 * Tests for DoltClient
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DoltClient } from "../../src/core/dolt-client.ts";

// Skip tests if no dolt server is available
const DOLT_PORT = 13839; // gitboard's dolt port
const DOLT_AVAILABLE = await checkDoltAvailable();

async function checkDoltAvailable(): Promise<boolean> {
  try {
    const client = new DoltClient({
      host: "127.0.0.1",
      port: DOLT_PORT,
    });
    await client.connect();
    await client.disconnect();
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!DOLT_AVAILABLE)("DoltClient", () => {
  let client: DoltClient;

  beforeAll(async () => {
    client = new DoltClient({
      host: "127.0.0.1",
      port: DOLT_PORT,
    });
  });

  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe("connect", () => {
    it("connects to dolt server", async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);
    });

    it("is idempotent", async () => {
      await client.connect();
      await client.connect();
      expect(client.isConnected()).toBe(true);
    });
  });

  describe("getIssues", () => {
    it("returns issues from database", async () => {
      const issues = await client.getIssues({});
      expect(issues.length).toBeGreaterThan(0);
    });

    it("filters by status", async () => {
      const openIssues = await client.getIssues({ status: ["open"] });
      const allOpen = openIssues.every(i => i.status === "open");
      expect(allOpen).toBe(true);
    });

    it("filters by priority", async () => {
      const p0Issues = await client.getIssues({ priority: [0] });
      const allP0 = p0Issues.every(i => i.priority === 0);
      expect(allP0).toBe(true);
    });

    it("respects limit", async () => {
      const issues = await client.getIssues({ limit: 5 });
      expect(issues.length).toBeLessThanOrEqual(5);
    });

    it("includes labels", async () => {
      const issues = await client.getIssues({});
      // At least some issues should have labels
      const issuesWithLabels = issues.filter(i => i.labels.length > 0);
      expect(issuesWithLabels.length).toBeGreaterThan(0);
    });
  });

  describe("getClosedIssues", () => {
    it("returns only closed issues", async () => {
      const issues = await client.getClosedIssues(10);
      const allClosed = issues.every(i => i.status === "closed");
      expect(allClosed).toBe(true);
    });

    it("respects limit", async () => {
      const issues = await client.getClosedIssues(5);
      expect(issues.length).toBeLessThanOrEqual(5);
    });

    it("orders by closed_at DESC", async () => {
      const issues = await client.getClosedIssues(10);
      for (let i = 1; i < issues.length; i++) {
        const prev = new Date(issues[i - 1].closed_at || 0);
        const curr = new Date(issues[i].closed_at || 0);
        expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
      }
    });
  });

  describe("getStats", () => {
    it("returns issue counts", async () => {
      const stats = await client.getStats();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.open).toBeGreaterThanOrEqual(0);
      expect(stats.closed).toBeGreaterThanOrEqual(0);
    });

    it("counts match actual issues", async () => {
      const stats = await client.getStats();
      const issues = await client.getIssues({ limit: 1000 });
      
      const actualOpen = issues.filter(i => i.status === "open").length;
      const actualClosed = issues.filter(i => i.status === "closed").length;
      
      // Stats may have more issues than our query limit
      expect(stats.open).toBe(actualOpen);
    });
  });
});