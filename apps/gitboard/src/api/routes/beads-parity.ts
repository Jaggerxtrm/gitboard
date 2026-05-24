import { clearInterval, setInterval } from "node:timers";
import type { Database } from "bun:sqlite";
import { ProjectScanner } from "../../../../beadboard/src/core/project-scanner.ts";
import { BeadsReader } from "../../../../beadboard/src/core/beads-reader.ts";
import { DoltClient, doltPoolKey } from "../../../../beadboard/src/core/dolt-client.ts";
import type { BeadIssue } from "../../../../beadboard/src/types/beads.ts";

export type BeadsParitySummary = {
  started_at: string;
  finished_at: string;
  diff_count: number;
  parity_ok_count: number;
  diffs: Array<{ path: string; live: unknown; shadow: unknown }>;
};

export function createBeadsParityHarness(xtrmDb: Database | null, options: { intervalMs?: number; enabled?: boolean } = {}): {
  start(): void;
  stop(): void;
  runOnce(): Promise<BeadsParitySummary>;
  getLatestSummary(): BeadsParitySummary | null;
  getParityOkCount(): number;
} {
  const intervalMs = options.intervalMs ?? 30_000;
  const enabled = options.enabled ?? Boolean(xtrmDb);
  const scanner = new ProjectScanner({
    searchPath: process.env.XDG_PROJECTS_DIR || (process.env.HOME ? `${process.env.HOME}/projects` : "/home"),
    maxDepth: 3,
    excludePatterns: ["node_modules", ".git", ".worktrees", "worktrees", "Library", "Applications", ".cargo", ".npm", ".rustup"],
  });

  let timer: ReturnType<typeof setInterval> | null = null;
  let latestSummary: BeadsParitySummary | null = null;
  let parityOkCount = 0;

  async function runOnce(): Promise<BeadsParitySummary> {
    const started_at = new Date().toISOString();
    const diffs: BeadsParitySummary["diffs"] = [];
    const projects = await scanner.scanDirectory();
    for (const project of projects) {
      const live = await readLiveIssues(project.id, project.beadsPath, project.doltPort, project.doltDatabase);
      const shadow = readShadowIssues(xtrmDb, project.id);
      compareIssues(project.id, live, shadow, diffs);
    }
    const summary: BeadsParitySummary = { started_at, finished_at: new Date().toISOString(), diff_count: diffs.length, parity_ok_count: parityOkCount + (diffs.length === 0 ? 1 : 0), diffs: diffs.slice(0, 50) };
    if (diffs.length === 0) parityOkCount += 1;
    latestSummary = summary;
    return summary;
  }

  function start(): void { if (!enabled || timer) return; void runOnce(); timer = setInterval(() => { void runOnce(); }, intervalMs); timer.unref?.(); }
  function stop(): void { if (timer) clearInterval(timer); timer = null; }

  return { start, stop, runOnce, getLatestSummary: () => latestSummary, getParityOkCount: () => parityOkCount };
}

async function readLiveIssues(projectId: string, beadsPath: string, doltPort?: number, doltDatabase?: string): Promise<BeadIssue[]> {
  if (doltPort) {
    try {
      const client = new DoltClient({ host: process.env.DOLT_HOST ?? "127.0.0.1", port: doltPort, database: doltDatabase ?? "dolt" });
      return await client.getIssues({ limit: 1000 });
    } catch {
      // fall through
    }
  }
  try {
    const content = await Bun.file(`${beadsPath}/issues.jsonl`).text();
    return content.split("\n").flatMap((line) => BeadsReader.parseIssueLine(line)).map((issue) => ({ ...issue, project_id: projectId }));
  } catch {
    return [];
  }
}

function readShadowIssues(db: Database | null, projectId: string): BeadIssue[] {
  if (!db) return [];
  let rows: Array<Record<string, unknown>>;
  try {
    rows = db.query("SELECT issue_id, title, body, state, deleted_at, created_at, updated_at FROM substrate_issues WHERE repo_slug = ? ORDER BY issue_id ASC").all(projectId) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
  return rows.map((row) => ({
    id: String(row.issue_id),
    title: String(row.title ?? ""),
    description: row.body == null ? null : String(row.body),
    notes: null,
    status: String(row.state ?? "open"),
    priority: 2,
    issue_type: "task",
    owner: null,
    created_at: String(row.created_at ?? new Date(0).toISOString()),
    created_by: null,
    updated_at: String(row.updated_at ?? new Date(0).toISOString()),
    closed_at: row.deleted_at == null ? undefined : String(row.deleted_at),
    project_id: projectId,
    dependencies: [],
    related_ids: [],
    labels: [],
  }));
}

function compareIssues(projectId: string, live: readonly BeadIssue[], shadow: readonly BeadIssue[], diffs: BeadsParitySummary["diffs"]): void {
  const liveMap = new Map(live.map((issue) => [issue.id, issue]));
  const shadowMap = new Map(shadow.map((issue) => [issue.id, issue]));
  for (const [id, issue] of liveMap) {
    const other = shadowMap.get(id);
    if (!other) { diffs.push({ path: `${projectId}:${id}`, live: issue, shadow: null }); continue; }
    if (JSON.stringify(issue) !== JSON.stringify(other)) diffs.push({ path: `${projectId}:${id}`, live: issue, shadow: other });
  }
  for (const [id, issue] of shadowMap) if (!liveMap.has(id)) diffs.push({ path: `${projectId}:${id}`, live: null, shadow: issue });
}

