import type { AttachPoolLike } from "./types.js";

export type TimeRange = "7d" | "30d" | "all";

export interface ObservabilitySummary {
  range: TimeRange;
  jobs: Array<{ id: string; role: string; bead: string; status: string; durationMs: number; tokens: number }>;
  roles: Array<{ role: string; count: number; avgDurationMs: number; avgTokens: number; p50DurationMs: number; p95DurationMs: number }>;
  spend: Array<{ day: string; tokens: number; costUsd: number }>;
  waiting: Array<{ id: string; role: string; bead: string; status: string; durationMs: number; tokens: number }>;
}

export function createMetricsDao(pool: AttachPoolLike) {
  return {
    summary(range: TimeRange): ObservabilitySummary {
      const cutoff = rangeCutoff(range);
      return pool.withAttached((db, attached) => {
        const jobs: ObservabilitySummary["jobs"] = [];
        const roles: Array<Record<string, unknown>> = [];
        const spend: Array<Record<string, unknown>> = [];
        const waiting: ObservabilitySummary["waiting"] = [];

        for (const { alias } of attached) {
          jobs.push(...readJobs(db, alias, cutoff));
          waiting.push(...readWaiting(db, alias));
          roles.push(...readRoles(db, alias, cutoff));
          spend.push(...readSpend(db, alias, cutoff));
        }

        jobs.sort((a, b) => b.durationMs - a.durationMs);
        waiting.sort((a, b) => b.durationMs - a.durationMs);
        return { range, jobs: jobs.slice(0, 25), roles: mergeRoles(roles), spend: mergeSpend(spend), waiting: waiting.slice(0, 25) };
      });
    },
  };
}

function rangeCutoff(range: TimeRange): number {
  if (range === "all") return 0;
  const days = range === "7d" ? 7 : 30;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function readJobs(db: { prepare(sql: string): { all(...params: unknown[]): unknown[] } }, alias: string, cutoff: number) {
  const rows = db.prepare(`
    SELECT j.job_id AS id, j.specialist AS role, j.bead_id AS bead, j.status,
      COALESCE(m.completed_at_ms, m.started_at_ms, 0) - COALESCE(m.started_at_ms, 0) AS durationMs,
      COALESCE((SELECT SUM(COALESCE(json_extract(x.value, '$.token_usage.total_tokens'), 0)) FROM json_each(m.token_trajectory_json) AS x), 0) AS tokens
    FROM ${alias}.specialist_jobs AS j
    LEFT JOIN ${alias}.specialist_job_metrics AS m ON m.job_id = j.job_id
    WHERE COALESCE(m.updated_at_ms, j.updated_at_ms) >= ?
    ORDER BY durationMs DESC
    LIMIT 50
  `).all(cutoff) as Array<Record<string, unknown>>;
  return rows.map(mapJob);
}

function readWaiting(db: { prepare(sql: string): { all(...params: unknown[]): unknown[] } }, alias: string) {
  const rows = db.prepare(`
    SELECT j.job_id AS id, j.specialist AS role, j.bead_id AS bead, j.status,
      COALESCE(m.active_runtime_ms, 0) AS durationMs,
      COALESCE((SELECT SUM(COALESCE(json_extract(x.value, '$.token_usage.total_tokens'), 0)) FROM json_each(m.token_trajectory_json) AS x), 0) AS tokens
    FROM ${alias}.specialist_jobs AS j
    LEFT JOIN ${alias}.specialist_job_metrics AS m ON m.job_id = j.job_id
    WHERE j.status = 'waiting'
    LIMIT 50
  `).all() as Array<Record<string, unknown>>;
  return rows.map(mapJob);
}

function readRoles(db: { prepare(sql: string): { all(...params: unknown[]): unknown[] } }, alias: string, cutoff: number) {
  return db.prepare(`
    SELECT COALESCE(j.specialist, 'unknown') AS role,
      COUNT(*) AS count,
      AVG(COALESCE(m.completed_at_ms, m.started_at_ms, 0) - COALESCE(m.started_at_ms, 0)) AS avgDurationMs,
      AVG(COALESCE((SELECT SUM(COALESCE(json_extract(x.value, '$.token_usage.total_tokens'), 0)) FROM json_each(m.token_trajectory_json) AS x), 0)) AS avgTokens,
      MAX(COALESCE(m.completed_at_ms, m.started_at_ms, 0) - COALESCE(m.started_at_ms, 0)) AS p50DurationMs,
      MAX(COALESCE(m.completed_at_ms, m.started_at_ms, 0) - COALESCE(m.started_at_ms, 0)) AS p95DurationMs
    FROM ${alias}.specialist_jobs AS j
    LEFT JOIN ${alias}.specialist_job_metrics AS m ON m.job_id = j.job_id
    WHERE COALESCE(m.updated_at_ms, j.updated_at_ms) >= ?
    GROUP BY role
  `).all(cutoff) as Array<Record<string, unknown>>;
}

function readSpend(db: { prepare(sql: string): { all(...params: unknown[]): unknown[] } }, alias: string, cutoff: number) {
  return db.prepare(`
    SELECT date(datetime(COALESCE(m.started_at_ms, j.updated_at_ms) / 1000, 'unixepoch')) AS day,
      SUM(COALESCE((SELECT SUM(COALESCE(json_extract(x.value, '$.token_usage.total_tokens'), 0)) FROM json_each(m.token_trajectory_json) AS x), 0)) AS tokens,
      SUM(COALESCE((SELECT SUM(COALESCE(json_extract(x.value, '$.cost_usd'), 0)) FROM json_each(m.token_trajectory_json) AS x), 0)) AS costUsd
    FROM ${alias}.specialist_jobs AS j
    LEFT JOIN ${alias}.specialist_job_metrics AS m ON m.job_id = j.job_id
    WHERE COALESCE(m.updated_at_ms, j.updated_at_ms) >= ?
    GROUP BY day
    ORDER BY day DESC
  `).all(cutoff) as Array<Record<string, unknown>>;
}

function mapJob(row: Record<string, unknown>) {
  return { id: String(row.id ?? ""), role: String(row.role ?? "unknown"), bead: String(row.bead ?? ""), status: String(row.status ?? ""), durationMs: Number(row.durationMs ?? 0), tokens: Number(row.tokens ?? 0) };
}

function mergeRoles(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, ObservabilitySummary["roles"][number]>();
  for (const row of rows) {
    const role = String(row.role ?? "unknown");
    const current = map.get(role) ?? { role, count: 0, avgDurationMs: 0, avgTokens: 0, p50DurationMs: 0, p95DurationMs: 0 };
    current.count += Number(row.count ?? 0);
    current.avgDurationMs = Number(row.avgDurationMs ?? 0);
    current.avgTokens = Number(row.avgTokens ?? 0);
    current.p50DurationMs = Number(row.p50DurationMs ?? 0);
    current.p95DurationMs = Number(row.p95DurationMs ?? 0);
    map.set(role, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function mergeSpend(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, { day: string; tokens: number; costUsd: number }>();
  for (const row of rows) {
    const day = String(row.day ?? "");
    const current = map.get(day) ?? { day, tokens: 0, costUsd: 0 };
    current.tokens += Number(row.tokens ?? 0);
    current.costUsd += Number(row.costUsd ?? 0);
    map.set(day, current);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}
