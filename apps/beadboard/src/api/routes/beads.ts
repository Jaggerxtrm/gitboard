/**
 * API routes for beads data
 */

import { Hono } from "hono";
import { ProjectScanner } from "../../core/project-scanner.ts";
import { BeadsReader } from "../../core/beads-reader.ts";
import type { BeadIssue, Memory, Interaction } from "../types/beads.ts";

// Cache for project scanner
let scanner: ProjectScanner | null = null;

function getScanner(): ProjectScanner {
  if (!scanner) {
    scanner = new ProjectScanner({
      searchPath: process.env.HOME || "/home",
      maxDepth: 4,
      excludePatterns: ["node_modules", ".git", "Library", "Applications"],
    });
  }
  return scanner;
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

    // For now, return mock data for any project ID during development
    // In production, this would validate against scanned projects
    const issues = await getMockIssues(projectId);

    // Apply filters
    let filtered = issues;
    if (status) {
      filtered = filtered.filter(i => status.includes(i.status));
    }
    if (priority) {
      filtered = filtered.filter(i => priority.includes(i.priority));
    }
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(i => 
        i.title.toLowerCase().includes(s) || 
        i.description?.toLowerCase().includes(s)
      );
    }

    return c.json({ issues: filtered.slice(0, limit) });
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

    const issues = await getMockIssues(projectId);
    const closed = issues
      .filter(i => i.status === "closed")
      .sort((a, b) => 
        new Date(b.closed_at || b.updated_at).getTime() - 
        new Date(a.closed_at || a.updated_at).getTime()
      )
      .slice(0, limit);

    return c.json({ issues: closed });
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
    const issues = await getMockIssues(projectId);
    
    // Also filter out closed for total count
    const activeIssues = issues.filter(i => i.status !== 'closed');

    const stats = {
      total: activeIssues.length,
      open: activeIssues.filter(i => i.status === "open").length,
      in_progress: activeIssues.filter(i => i.status === "in_progress").length,
      blocked: activeIssues.filter(i => i.status === "blocked").length,
      closed: issues.filter(i => i.status === "closed").length,
      by_priority: {
        p0: issues.filter(i => i.priority === 0).length,
        p1: issues.filter(i => i.priority === 1).length,
        p2: issues.filter(i => i.priority === 2).length,
        p3: issues.filter(i => i.priority === 3).length,
        p4: issues.filter(i => i.priority === 4).length,
      },
      by_type: {
        bug: issues.filter(i => i.issue_type === "bug").length,
        feature: issues.filter(i => i.issue_type === "feature").length,
        task: issues.filter(i => i.issue_type === "task").length,
        epic: issues.filter(i => i.issue_type === "epic").length,
        chore: issues.filter(i => i.issue_type === "chore").length,
      },
    };

    return c.json({ stats });
  } catch (error) {
    console.error("[api] Error getting stats:", error);
    return c.json({ error: "Failed to get stats" }, 500);
  }
});

// Mock data for development
async function getMockIssues(projectId: string): Promise<BeadIssue[]> {
  return [
    {
      id: "forge-001",
      title: "Implement project scanner",
      description: "Scan for .beads directories",
      status: "closed",
      priority: 1,
      issue_type: "feature",
      owner: "user@example.com",
      created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
      created_by: "user@example.com",
      updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      closed_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      close_reason: "Done",
      project_id: projectId,
      dependencies: [],
      labels: ["core"],
      related_ids: [],
    },
    {
      id: "forge-002",
      title: "Build Kanban board UI",
      description: "Create the 4-column layout for issue tracking",
      status: "closed",
      priority: 1,
      issue_type: "task",
      owner: "user@example.com",
      created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      created_by: "user@example.com",
      updated_at: new Date(Date.now() - 86400000).toISOString(),
      closed_at: new Date(Date.now() - 86400000).toISOString(),
      close_reason: "Complete",
      project_id: projectId,
      dependencies: [],
      labels: ["ui"],
      related_ids: ["forge-001"],
    },
    {
      id: "forge-003",
      title: "Add WebSocket support",
      description: "Real-time updates for live issue changes",
      status: "in_progress",
      priority: 2,
      issue_type: "feature",
      owner: "user@example.com",
      created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      created_by: "user@example.com",
      updated_at: new Date().toISOString(),
      project_id: projectId,
      dependencies: [],
      labels: ["realtime"],
      related_ids: [],
    },
    {
      id: "forge-004",
      title: "Fix memory panel scroll issue",
      description: "Panel not scrolling properly with long content",
      status: "blocked",
      priority: 0,
      issue_type: "bug",
      owner: "user@example.com",
      created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
      created_by: "user@example.com",
      updated_at: new Date().toISOString(),
      project_id: projectId,
      dependencies: [
        { id: "forge-003", title: "Add WebSocket support", status: "in_progress", dependency_type: "blocked_by" },
      ],
      labels: ["bug", "ui"],
      related_ids: [],
    },
    {
      id: "forge-005",
      title: "Implement agent badges",
      description: "Show which AI agent worked on each issue",
      status: "open",
      priority: 2,
      issue_type: "task",
      owner: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      created_by: "user@example.com",
      updated_at: new Date().toISOString(),
      project_id: projectId,
      dependencies: [],
      labels: ["ui", "agents"],
      related_ids: [],
    },
    {
      id: "forge-006",
      title: "PR auto-linking from worktrees",
      description: "Detect open PRs from worktrees and commits",
      status: "open",
      priority: 3,
      issue_type: "feature",
      owner: null,
      created_at: new Date().toISOString(),
      created_by: "user@example.com",
      updated_at: new Date().toISOString(),
      project_id: projectId,
      dependencies: [],
      labels: ["github", "automation"],
      related_ids: [],
    },
    {
      id: "forge-007",
      title: "[EPIC] Memory panel integration",
      description: "Full bd memories integration with search and filtering",
      status: "open",
      priority: 1,
      issue_type: "epic",
      owner: "user@example.com",
      created_at: new Date().toISOString(),
      created_by: "user@example.com",
      updated_at: new Date().toISOString(),
      project_id: projectId,
      dependencies: [
        { id: "forge-005", title: "Implement agent badges", status: "open", dependency_type: "related" },
      ],
      labels: ["epic"],
      related_ids: [],
    },
    {
      id: "forge-008",
      title: "Dolt database connection",
      description: "Connect to actual dolt database for real issue data",
      status: "open",
      priority: 0,
      issue_type: "task",
      owner: null,
      created_at: new Date().toISOString(),
      created_by: "user@example.com",
      updated_at: new Date().toISOString(),
      project_id: projectId,
      dependencies: [],
      labels: ["backend", "dolt"],
      related_ids: [],
    },
  ];
}