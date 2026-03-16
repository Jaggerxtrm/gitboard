/**
 * API routes for beads data
 */

import { Hono } from "hono";
import { ProjectScanner } from "../../core/project-scanner.ts";
import { BeadsReader } from "../../core/beads-reader.ts";
import { DoltClient } from "../../core/dolt-client.ts";
import type { BeadIssue, Memory, Interaction } from "../types/beads.ts";

// Cache for project scanner
let scanner: ProjectScanner | null = null;

// Cache for dolt clients by port
const doltClients: Map<number, DoltClient> = new Map();

function getScanner(): ProjectScanner {
  if (!scanner) {
    scanner = new ProjectScanner({
      searchPath: process.env.HOME || "/home",
      maxDepth: 5,
      excludePatterns: ["node_modules", ".git", "Library", "Applications", ".cargo", ".npm", ".rustup"],
    });
  }
  return scanner;
}

function getDoltClient(port: number): DoltClient {
  if (!doltClients.has(port)) {
    doltClients.set(port, new DoltClient({
      host: "127.0.0.1",
      port,
    }));
  }
  return doltClients.get(port)!;
}

export const beadsRoutes = new Hono();

// Get all discovered projects
beadsRoutes.get("/projects", async (c) => {
  try {
    const scn = getScanner();
    const projects = await scn.scanDirectory();
    return c.json({ projects });
  } catch (error) {
    console.error("[api] Error scanning projects:", error);
    return c.json({ error: "Failed to scan projects" }, 500);
  }
});

// Get issues for a project
beadsRoutes.get("/projects/:id/issues", async (c) => {
  try {
    const projectId = c.req.param("id");
    const status = c.req.query("status")?.split(",") as BeadIssue["status"][] | undefined;
    const priority = c.req.query("priority")?.split(",").map(Number) as BeadIssue["priority"][] | undefined;
    const search = c.req.query("search");
    const limit = parseInt(c.req.query("limit") || "100");

    // Try to get real data from dolt
    const issues = await getIssuesFromDolt(projectId, {
      status,
      priority,
      search,
      limit,
    });

    // Add project_id to each issue
    const issuesWithProject = issues.map(i => ({ ...i, project_id: projectId }));

    return c.json({ issues: issuesWithProject });
  } catch (error) {
    console.error("[api] Error getting issues:", error);
    return c.json({ error: "Failed to get issues" }, 500);
  }
});

// Get closed issues for a project
beadsRoutes.get("/projects/:id/issues/closed", async (c) => {
  try {
    const projectId = c.req.param("id");
    const limit = parseInt(c.req.query("limit") || "50");

    const issues = await getClosedIssuesFromDolt(projectId, limit);
    const issuesWithProject = issues.map(i => ({ ...i, project_id: projectId }));

    return c.json({ issues: issuesWithProject });
  } catch (error) {
    console.error("[api] Error getting closed issues:", error);
    return c.json({ error: "Failed to get closed issues" }, 500);
  }
});

// Get memories for a project
beadsRoutes.get("/projects/:id/memories", async (c) => {
  try {
    const projectId = c.req.param("id");

    const scn = getScanner();
    const project = scn.getProject(projectId);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Read memories from knowledge.jsonl
    const reader = new BeadsReader({} as any);
    const knowledgePath = `${project.beadsPath}/knowledge.jsonl`;
    const memories = await reader.getMemories(knowledgePath);

    return c.json({ memories: memories.map(m => ({ ...m, project_id: projectId })) });
  } catch (error) {
    console.error("[api] Error getting memories:", error);
    return c.json({ memories: [] });
  }
});

// Get interactions (agent sessions) for a project
beadsRoutes.get("/projects/:id/interactions", async (c) => {
  try {
    const projectId = c.req.param("id");
    const issueId = c.req.query("issue_id");

    const scn = getScanner();
    const project = scn.getProject(projectId);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const reader = new BeadsReader({} as any);
    const interactionsPath = `${project.beadsPath}/interactions.jsonl`;
    let interactions = await reader.getInteractions(interactionsPath);

    interactions = interactions.map(i => ({ ...i, project_id: projectId }));

    if (issueId) {
      interactions = interactions.filter(i => i.issue_id === issueId);
    }

    return c.json({ interactions });
  } catch (error) {
    console.error("[api] Error getting interactions:", error);
    return c.json({ interactions: [] });
  }
});

// Get aggregated stats
beadsRoutes.get("/projects/:id/stats", async (c) => {
  try {
    const projectId = c.req.param("id");
    const stats = await getStatsFromDolt(projectId);
    return c.json({ stats });
  } catch (error) {
    console.error("[api] Error getting stats:", error);
    return c.json({ error: "Failed to get stats" }, 500);
  }
});

// Health check for dolt connection
beadsRoutes.get("/projects/:id/connection", async (c) => {
  try {
    const projectId = c.req.param("id");
    const scn = getScanner();
    const project = scn.getProject(projectId);

    if (!project) {
      return c.json({ status: "not_found", error: "Project not found" });
    }

    if (!project.doltPort) {
      return c.json({ status: "no_dolt", error: "No dolt server configured" });
    }

    const client = getDoltClient(project.doltPort);
    await client.connect();

    return c.json({
      status: "connected",
      port: project.doltPort,
      database: project.doltDatabase || "dolt",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ status: "error", error: message });
  }
});

/**
 * Get issues from dolt database
 */
async function getIssuesFromDolt(
  projectId: string,
  filters: {
    status?: BeadIssue["status"][];
    priority?: BeadIssue["priority"][];
    search?: string;
    limit?: number;
  }
): Promise<BeadIssue[]> {
  const scn = getScanner();
  const project = scn.getProject(projectId);

  if (!project || !project.doltPort) {
    console.log(`[api] No dolt connection for project ${projectId}, returning empty`);
    return [];
  }

  const client = getDoltClient(project.doltPort);

  try {
    return await client.getIssues({
      status: filters.status,
      priority: filters.priority,
      search: filters.search,
      limit: filters.limit ?? 100,
    });
  } catch (error) {
    console.error(`[api] Dolt query failed for ${projectId}:`, error);
    return [];
  }
}

/**
 * Get closed issues from dolt database
 */
async function getClosedIssuesFromDolt(
  projectId: string,
  limit: number
): Promise<BeadIssue[]> {
  const scn = getScanner();
  const project = scn.getProject(projectId);

  if (!project || !project.doltPort) {
    return [];
  }

  const client = getDoltClient(project.doltPort);

  try {
    return await client.getClosedIssues(limit);
  } catch (error) {
    console.error(`[api] Dolt query failed for ${projectId}:`, error);
    return [];
  }
}

/**
 * Get stats from dolt database
 */
async function getStatsFromDolt(projectId: string): Promise<{
  total: number;
  open: number;
  in_progress: number;
  blocked: number;
  closed: number;
  by_priority: Record<string, number>;
  by_type: Record<string, number>;
}> {
  const scn = getScanner();
  const project = scn.getProject(projectId);

  if (!project || !project.doltPort) {
    return {
      total: 0,
      open: 0,
      in_progress: 0,
      blocked: 0,
      closed: 0,
      by_priority: { p0: 0, p1: 0, p2: 0, p3: 0, p4: 0 },
      by_type: { bug: 0, feature: 0, task: 0, epic: 0, chore: 0 },
    };
  }

  const client = getDoltClient(project.doltPort);

  try {
    const stats = await client.getStats();

    // Get priority and type breakdown
    const issues = await client.getIssues({ limit: 1000 });

    const by_priority = {
      p0: issues.filter(i => i.priority === 0).length,
      p1: issues.filter(i => i.priority === 1).length,
      p2: issues.filter(i => i.priority === 2).length,
      p3: issues.filter(i => i.priority === 3).length,
      p4: issues.filter(i => i.priority === 4).length,
    };

    const by_type = {
      bug: issues.filter(i => i.issue_type === "bug").length,
      feature: issues.filter(i => i.issue_type === "feature").length,
      task: issues.filter(i => i.issue_type === "task").length,
      epic: issues.filter(i => i.issue_type === "epic").length,
      chore: issues.filter(i => i.issue_type === "chore").length,
    };

    return { ...stats, by_priority, by_type };
  } catch (error) {
    console.error(`[api] Dolt stats query failed for ${projectId}:`, error);
    return {
      total: 0,
      open: 0,
      in_progress: 0,
      blocked: 0,
      closed: 0,
      by_priority: { p0: 0, p1: 0, p2: 0, p3: 0, p4: 0 },
      by_type: { bug: 0, feature: 0, task: 0, epic: 0, chore: 0 },
    };
  }
}