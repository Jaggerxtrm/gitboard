import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { createAttachPool } from "../../../src/server/observability/attach-pool.ts";
import { createMetricsDao } from "../../../src/server/observability/metrics-dao.ts";
import { createObservabilityRouter } from "../../../src/api/routes/observability.ts";

let dir: string;
let db: Database;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gitboard-observability-"));
  db = new Database(join(dir, "repo.db"), { create: true });
  db.exec(`
    CREATE TABLE specialist_jobs (job_id TEXT, bead_id TEXT, status TEXT, specialist TEXT, updated_at_ms INTEGER);
    CREATE TABLE specialist_job_metrics (job_id TEXT, started_at_ms INTEGER, completed_at_ms INTEGER, active_runtime_ms INTEGER, token_trajectory_json TEXT, updated_at_ms INTEGER);
  `);
  db.prepare("INSERT INTO specialist_jobs VALUES (?, ?, ?, ?, ?)").run("job-1", "bead-1", "waiting", "reviewer", Date.now());
  db.prepare("INSERT INTO specialist_job_metrics VALUES (?, ?, ?, ?, ?, ?)").run("job-1", 10, 30, 20, "[{\"token_usage\":{\"total_tokens\":42},\"cost_usd\":0.1}]", Date.now());
});

afterEach(async () => { db.close(); await rm(dir, { recursive: true, force: true }); });

describe("GET /api/console/observability/summary", () => {
  it("returns empty-safe summary shape", async () => {
    const pool = createAttachPool([{ repoSlug: "repo", repoPath: dir, dbPath: join(dir, "repo.db"), mtimeMs: 0 }]);
    const dao = createMetricsDao(pool);
    const app = new Hono();
    app.route("/api/console/observability", createObservabilityRouter(dao));

    const res = await app.fetch(new Request("http://localhost/api/console/observability/summary?range=7d"));
    expect(res.status).toBe(200);
    const json = await res.json() as { jobs: unknown[]; roles: unknown[]; spend: unknown[]; waiting: unknown[] };
    expect(Array.isArray(json.jobs)).toBe(true);
    expect(Array.isArray(json.roles)).toBe(true);
    expect(Array.isArray(json.spend)).toBe(true);
    expect(Array.isArray(json.waiting)).toBe(true);
  });
});
