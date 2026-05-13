/**
 * API routes for beads data
 */

import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { ProjectScanner } from "../../core/project-scanner.ts";
import { BeadsReader } from "../../core/beads-reader.ts";
import { DoltClient } from "../../core/dolt-client.ts";
import type { BeadIssue, BeadIssueDetail, Memory, Interaction, ProjectSourceKind } from "../types/beads.ts";

let scanner: ProjectScanner | null = null;
const doltClients: Map<number, DoltClient> = new Map();
const sqliteReaders: Map<string, BeadsReader> = new Map();

function getScanner(): ProjectScanner {
  if (!scanner) {
    const searchPath = process.env.XDG_PROJECTS_DIR || (process.env.HOME ? `${process.env.HOME}/projects` : "/home");
    scanner = new ProjectScanner({
      searchPath,
      maxDepth: 5,
      excludePatterns: ["node_modules", ".git", "Library", "Applications", ".cargo", ".npm", ".rustup"],
    });
  }
  return scanner;
}

function getDoltClient(port: number): DoltClient {
  if (!doltClients.has(port)) {
    const host = process.env.XDG_PROJECTS_DIR ? "host.docker.internal" : "127.0.0.1";
    doltClients.set(port, new DoltClient({ host, port }));
  }
  return doltClients.get(port)!;
}

function getSqliteReader(dbPath: string): BeadsReader {
  if (!sqliteReaders.has(dbPath)) {
    sqliteReaders.set(dbPath, new BeadsReader(new Database(dbPath)));
  }
  return sqliteReaders.get(dbPath)!;
}

function sourceOrder(projectSource: ProjectSourceKind): ProjectSourceKind[] {
  const order: ProjectSourceKind[] = ["dolt", "sqlite", "jsonl", "unknown"];
  return projectSource === "unknown" ? order : [projectSource, ...order.filter((source) => source !== projectSource)];
}

export const beadsRoutes = new Hono();

beadsRoutes.get("/projects", async (c) => {
  try {
    const projects = await getScanner().scanDirectory();
    return c.json({ projects });
  } catch (error) {
    console.error("[api] Error scanning projects:", error);
    return c.json({ error: "Failed to scan projects" }, 500);
  }
});

beadsRoutes.get("/projects/:id/issues", async (c) => {
  try {
    const projectId = c.req.param("id");
    const status = c.req.query("status")?.split(",") as BeadIssue["status"][] | undefined;
    const priority = c.req.query("priority")?.split(",").map(Number) as BeadIssue["priority"][] | undefined;
    const search = c.req.query("search");
    const limit = Number.parseInt(c.req.query("limit") || "100", 10);

    const issues = await getIssuesFromProject(projectId, { status, priority, search, limit });
    return c.json({ issues: issues.map((issue) => ({ ...issue, project_id: projectId })) });
  } catch (error) {
    console.error("[api] Error getting issues:", error);
    return c.json({ error: "Failed to get issues" }, 500);
  }
});

beadsRoutes.get("/projects/:id/issues/:issueId", async (c) => {
  try {
    const projectId = c.req.param("id");
    const issueId = c.req.param("issueId");
    const detail = await getIssueDetailFromProject(projectId, issueId);

    if (!detail) return c.json({ error: "Issue not found" }, 404);
    return c.json({ issue: detail });
  } catch (error) {
    console.error("[api] Error getting issue detail:", error);
    return c.json({ error: "Failed to get issue detail" }, 500);
  }
});

beadsRoutes.get("/projects/:id/issues/closed", async (c) => {
  try {
    const projectId = c.req.param("id");
    const limit = Number.parseInt(c.req.query("limit") || "50", 10);
    const issues = await getClosedIssuesFromProject(projectId, limit);
    return c.json({ issues: issues.map((issue) => ({ ...issue, project_id: projectId })) });
  } catch (error) {
    console.error("[api] Error getting closed issues:", error);
    return c.json({ error: "Failed to get closed issues" }, 500);
  }
});

beadsRoutes.get("/projects/:id/memories", async (c) => {
  try {
    const projectId = c.req.param("id");
    const project = getScanner().getProject(projectId);
    if (!project) return c.json({ error: "Project not found" }, 404);

    const reader = new BeadsReader({} as any);
    const memories = await reader.getMemories(`${project.beadsPath}/knowledge.jsonl`);
    return c.json({ memories: memories.map((memory) => ({ ...memory, project_id: projectId })) });
  } catch (error) {
    console.error("[api] Error getting memories:", error);
    return c.json({ memories: [] });
  }
});

beadsRoutes.get("/projects/:id/interactions", async (c) => {
  try {
    const projectId = c.req.param("id");
    const issueId = c.req.query("issue_id");
    const project = getScanner().getProject(projectId);
    if (!project) return c.json({ error: "Project not found" }, 404);

    const reader = new BeadsReader({} as any);
    let interactions = await reader.getInteractions(`${project.beadsPath}/interactions.jsonl`);
    interactions = interactions.map((interaction) => ({ ...interaction, project_id: projectId }));
    if (issueId) interactions = interactions.filter((interaction) => interaction.issue_id === issueId);
    return c.json({ interactions });
  } catch (error) {
    console.error("[api] Error getting interactions:", error);
    return c.json({ interactions: [] });
  }
});

beadsRoutes.get("/projects/:id/stats", async (c) => {
  try {
    const projectId = c.req.param("id");
    const stats = await getStatsFromProject(projectId);
    return c.json({ stats });
  } catch (error) {
    console.error("[api] Error getting stats:", error);
    return c.json({ error: "Failed to get stats" }, 500);
  }
});

beadsRoutes.get("/projects/:id/connection", async (c) => {
  try {
    const projectId = c.req.param("id");
    const project = getScanner().getProject(projectId);
    if (!project) return c.json({ status: "not_found", error: "Project not found" });
    if (!project.doltPort) return c.json({ status: "no_dolt", error: "No dolt server configured" });

    await getDoltClient(project.doltPort).connect();
    return c.json({ status: "connected", port: project.doltPort, database: project.doltDatabase || "dolt" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ status: "error", error: message });
  }
});

async function getIssuesFromProject(
  projectId: string,
  filters: { status?: BeadIssue["status"][]; priority?: BeadIssue["priority"][]; search?: string; limit?: number },
): Promise<BeadIssue[]> {
  const project = getScanner().getProject(projectId);
  if (!project) return [];

  for (const source of sourceOrder(project.source ?? "unknown")) {
    if (source === "dolt" && project.doltPort) {
      try {
        return await getDoltClient(project.doltPort).getIssues(filters);
      } catch {
        continue;
      }
    }

    if (source === "sqlite") {
      const dbPath = (project.sourceHealth ?? []).find((entry) => entry.kind === "sqlite" && entry.path)?.path;
      if (!dbPath) continue;
      try {
        return await getSqliteReader(dbPath).getIssues(filters);
      } catch {
        continue;
      }
    }
  }

  return [];
}

async function getIssueDetailFromProject(projectId: string, issueId: string): Promise<BeadIssueDetail | null> {
  const project = getScanner().getProject(projectId);
  if (!project) return null;

  for (const source of sourceOrder(project.source ?? "unknown")) {
    if (source === "dolt" && project.doltPort) {
      try {
        const detail = await getDoltClient(project.doltPort).getIssue(issueId);
        if (detail) return detail;
      } catch {
        continue;
      }
    }

    if (source === "sqlite") {
      const dbPath = (project.sourceHealth ?? []).find((entry) => entry.kind === "sqlite" && entry.path)?.path;
      if (!dbPath) continue;
      try {
        const detail = await getSqliteReader(dbPath).getIssue(issueId);
        if (detail) return detail;
      } catch {
        continue;
      }
    }
  }

  return null;
}

async function getClosedIssuesFromProject(projectId: string, limit: number): Promise<BeadIssue[]> {
  const project = getScanner().getProject(projectId);
  if (!project) return [];

  for (const source of sourceOrder(project.source ?? "unknown")) {
    if (source === "dolt" && project.doltPort) {
      try {
        return await getDoltClient(project.doltPort).getClosedIssues(limit);
      } catch {
        continue;
      }
    }

    if (source === "sqlite") {
      const dbPath = (project.sourceHealth ?? []).find((entry) => entry.kind === "sqlite" && entry.path)?.path;
      if (!dbPath) continue;
      try {
        return await getSqliteReader(dbPath).getClosedIssues(limit);
      } catch {
        continue;
      }
    }
  }

  return [];
}

async function getStatsFromProject(projectId: string): Promise<{
  total: number;
  open: number;
  in_progress: number;
  blocked: number;
  closed: number;
  by_priority: Record<string, number>;
  by_type: Record<string, number>;
}> {
  const project = getScanner().getProject(projectId);
  if (!project) {
    return { total: 0, open: 0, in_progress: 0, blocked: 0, closed: 0, by_priority: { p0: 0, p1: 0, p2: 0, p3: 0, p4: 0 }, by_type: { bug: 0, feature: 0, task: 0, epic: 0, chore: 0 } };
  }

  const issues = await getIssuesFromProject(projectId, { limit: 1000 });
  const stats = issues.reduce((acc, issue) => {
    acc.total += 1;
    if (issue.status in acc) acc[issue.status as keyof typeof acc] += 1;
    const priorityKey = `p${issue.priority}`;
    if (priorityKey in acc.by_priority) acc.by_priority[priorityKey] += 1;
    const typeKey = issue.issue_type;
    if (typeKey in acc.by_type) acc.by_type[typeKey] += 1;
    return acc;
  }, { total: 0, open: 0, in_progress: 0, blocked: 0, closed: 0, by_priority: { p0: 0, p1: 0, p2: 0, p3: 0, p4: 0 }, by_type: { bug: 0, feature: 0, task: 0, epic: 0, chore: 0 } });

  return stats;
}
