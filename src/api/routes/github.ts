import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  getEvents,
  getEvent,
  getCommits,
  getCommit,
  getRepos,
  upsertRepo,
  updateRepo,
  getContributions,
  getSummary,
  getRepoStats,
  enrichCommitMessages,
} from "../../core/github-store.ts";
import type { ChannelRegistry } from "../ws/channels.ts";

function resolveToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const r = Bun.spawnSync(['gh', 'auth', 'token']);
  if (r.exitCode === 0) return r.stdout.toString().trim();
  throw new Error('No GitHub token');
}

export function createGithubRouter(db: Database, registry: ChannelRegistry): Hono {
  const app = new Hono();

  // GET /api/github/events
  app.get("/events", (c) => {
    const q = c.req.query();
    const repos = q.repos ? q.repos.split(",").map((r) => r.trim()) : undefined;
    const types = q.types ? q.types.split(",").map((t) => t.trim()) : undefined;
    const limit = q.limit ? parseInt(q.limit, 10) : 50;
    const offset = q.offset ? parseInt(q.offset, 10) : 0;

    const events = getEvents(db, {
      repos,
      types,
      branch: q.branch,
      from: q.from,
      to: q.to,
      search: q.search,
      group: q.group,
      limit,
      offset,
    });

    return c.json({ data: events, limit, offset });
  });

  // GET /api/github/events/:id
  app.get("/events/:id", (c) => {
    const id = c.req.param("id");
    const event = getEvent(db, id);
    if (!event) return c.json({ error: "not found" }, 404);
    return c.json(event);
  });

  // GET /api/github/commits
  app.get("/commits", async (c) => {
    const q = c.req.query();
    const limit = q.limit ? parseInt(q.limit, 10) : 50;
    const offset = q.offset ? parseInt(q.offset, 10) : 0;

    const commits = getCommits(db, {
      repo: q.repo,
      event_id: q.event_id,
      from: q.from,
      limit,
      offset,
    });

    // Lazy-enrich truncated commit messages from GitHub API
    try {
      const token = resolveToken();
      await enrichCommitMessages(db, commits, token);
    } catch {
      // No token or network error — return commits as-is with truncated messages
    }

    return c.json({ data: commits, limit, offset });
  });

  // GET /api/github/repos/stats
  app.get("/repos/stats", (c) => {
    const stats = getRepoStats(db);
    return c.json({ data: stats });
  });

  // GET /api/github/commits/:sha
  app.get("/commits/:sha", (c) => {
    const sha = c.req.param("sha");
    const commit = getCommit(db, sha);
    if (!commit) return c.json({ error: "not found" }, 404);
    return c.json(commit);
  });

  // GET /api/github/repos
  app.get("/repos", (c) => {
    const repos = getRepos(db);
    return c.json({ data: repos });
  });

  // POST /api/github/repos
  app.post("/repos", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.full_name !== "string") {
      return c.json({ error: "full_name is required" }, 400);
    }

    upsertRepo(db, {
      full_name: body.full_name,
      display_name: body.display_name ?? null,
      tracked: body.tracked ?? true,
      group_name: body.group_name ?? null,
      last_polled_at: null,
      color: body.color ?? null,
    });

    const repos = getRepos(db);
    const repo = repos.find((r) => r.full_name === body.full_name);
    return c.json(repo, 201);
  });

  // PUT /api/github/repos/:name
  app.put("/repos/:name", async (c) => {
    const name = decodeURIComponent(c.req.param("name"));
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "invalid body" }, 400);

    const repos = getRepos(db);
    const existing = repos.find((r) => r.full_name === name);
    if (!existing) return c.json({ error: "not found" }, 404);

    updateRepo(db, name, {
      display_name: body.display_name,
      tracked: body.tracked,
      group_name: body.group_name,
      color: body.color,
    });

    const updated = getRepos(db).find((r) => r.full_name === name);
    return c.json(updated);
  });

  // DELETE /api/github/repos/:name
  app.delete("/repos/:name", (c) => {
    const name = decodeURIComponent(c.req.param("name"));
    const repos = getRepos(db);
    const existing = repos.find((r) => r.full_name === name);
    if (!existing) return c.json({ error: "not found" }, 404);

    updateRepo(db, name, { tracked: false });
    return c.json({ deleted: name });
  });

  // GET /api/github/contributions
  app.get("/contributions", (c) => {
    const q = c.req.query();
    const weeks = q.weeks ? parseInt(q.weeks, 10) : 12;
    const contributions = getContributions(db, weeks);
    return c.json({ data: contributions });
  });

  // GET /api/github/summary
  app.get("/summary", (c) => {
    const q = c.req.query();
    const validPeriods = ["today", "week", "month"] as const;
    type Period = typeof validPeriods[number];
    const period: Period = validPeriods.includes(q.period as Period)
      ? (q.period as Period)
      : "today";
    const summary = getSummary(db, period);
    return c.json(summary);
  });

  return app;
}
