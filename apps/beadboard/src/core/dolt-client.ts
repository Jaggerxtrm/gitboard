/**
 * DoltClient - MySQL client for dolt database connections
 */

import mysql from "mysql2/promise";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { BeadIssue, BeadDependency, IssueFilters, BeadIssueDetail } from "../types/beads.ts";

const POOL_SIZE = 4;
const IDLE_TIMEOUT_MS = 60_000;
const PROBE_INTERVAL_MS = 5_000;
const BREAKER_THRESHOLD = 5;
const BACKOFF_MIN_MS = 250;
const BACKOFF_MAX_MS = 30_000;
const QUERY_TIMEOUT_MS = 3_000;
const LATENCY_RING_SIZE = 100;

export interface DoltConfig {
  host: string;
  port: number;
  user?: string;
  database?: string;
}

type QueryMetric = { latencyMs: number; ok: boolean; at: string };

type DoltRuntimeState = {
  pool: Pool | null;
  poolKey: string | null;
  connected: boolean;
  probing: boolean;
  lastProbeAt: number;
  consecutiveFailures: number;
  breakerOpenUntil: number;
  reconnectAttempts: number;
  metrics: QueryMetric[];
  probeTimer: ReturnType<typeof setInterval> | null;
};

const runtime: DoltRuntimeState = {
  pool: null,
  poolKey: null,
  connected: false,
  probing: false,
  lastProbeAt: 0,
  consecutiveFailures: 0,
  breakerOpenUntil: 0,
  reconnectAttempts: 0,
  metrics: [],
  probeTimer: null,
};

export function getDoltHealthSnapshot(): { consecutiveFailures: number; breakerOpenUntil: number; latencies: number[] } {
  return {
    consecutiveFailures: runtime.consecutiveFailures,
    breakerOpenUntil: runtime.breakerOpenUntil,
    latencies: runtime.metrics.map((metric) => metric.latencyMs),
  };
}

function poolKey(config: DoltConfig): string {
  return `${config.host}:${config.port}/${config.database ?? "dolt"}/${config.user ?? "root"}`;
}

function jitter(ms: number): number {
  return Math.floor(ms * (0.8 + Math.random() * 0.4));
}

function backoffDelay(attempt: number): number {
  const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempt - 1));
  return jitter(delay);
}

function rememberMetric(latencyMs: number, ok: boolean): void {
  runtime.metrics.push({ latencyMs, ok, at: new Date().toISOString() });
  if (runtime.metrics.length > LATENCY_RING_SIZE) runtime.metrics.splice(0, runtime.metrics.length - LATENCY_RING_SIZE);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return await new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Dolt query timeout after ${timeoutMs}ms`)), timeoutMs);
    promise.then(resolve, reject).finally(() => {
      if (timer) clearTimeout(timer);
    });
  });
}

export class DoltClient {
  private config: DoltConfig;

  constructor(config: DoltConfig) {
    this.config = {
      database: "dolt",
      ...config,
      user: config.user ?? "root",
    };
  }

  private get connected(): boolean {
    return runtime.connected && runtime.poolKey === poolKey(this.config) && runtime.pool !== null;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.ensurePool();
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !runtime.pool) return;
    await runtime.pool.end();
    runtime.pool = null;
    runtime.poolKey = null;
    runtime.connected = false;
    runtime.probeTimer && clearInterval(runtime.probeTimer);
    runtime.probeTimer = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isBreakerOpen(): boolean {
    return Date.now() < runtime.breakerOpenUntil;
  }

  async getIssues(filters: IssueFilters = {}): Promise<BeadIssue[]> {
    const rows = await this.selectIssues(filters);
    const issues: BeadIssue[] = [];
    for (const row of rows) issues.push(await this.toIssue(row));
    return issues;
  }

  async getCommitHash(): Promise<string> {
    const [rows] = await this.execute<RowDataPacket[]>("SELECT current_commit() AS commit_hash");
    const row = rows[0] as RowDataPacket | undefined;
    return String(row?.commit_hash ?? row?.hash ?? row?.commit ?? "");
  }

  async getIssuesSince(updatedSince: string): Promise<BeadIssue[]> {
    const issues = await this.getIssues({ limit: 1000, offset: 0, search: undefined });
    return issues.filter((issue) => issue.updated_at > updatedSince);
  }

  async getIssue(issueId: string): Promise<BeadIssueDetail | null> {
    const [row] = await this.selectIssues({ limit: 1, offset: 0 }, issueId);
    if (!row) return null;

    const issue = await this.toIssue(row);
    const dependents = await this.getDependents(issueId);
    return {
      ...issue,
      dependents,
      children: dependents.filter((dependency) => dependency.dependency_type === "parent-child"),
      source: "dolt",
      sourceHealth: [{ kind: "dolt", state: "available" }],
    };
  }

  async fetchIssuesSince(updatedSince: string): Promise<BeadIssue[]> {
    return await this.getIssuesSince(updatedSince);
  }

  async getClosedIssues(limit: number = 50): Promise<BeadIssue[]> {
    const [rows] = await this.execute<RowDataPacket[]>(
      `SELECT * FROM issues WHERE status = 'closed' AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT ?`,
      [limit],
    );
    const issues: BeadIssue[] = [];
    for (const row of rows) issues.push(await this.toIssue(row));
    return issues;
  }

  async getStats(): Promise<{ total: number; open: number; in_progress: number; blocked: number; closed: number }> {
    const [rows] = await this.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
       FROM issues`,
    );
    const row = rows[0] ?? {};
    return {
      total: Number(row.total ?? 0),
      open: Number(row.open ?? 0),
      in_progress: Number(row.in_progress ?? 0),
      blocked: Number(row.blocked ?? 0),
      closed: Number(row.closed ?? 0),
    };
  }

  async probeHealth(): Promise<boolean> {
    try {
      await this.execute<RowDataPacket[]>("SELECT 1 AS ok");
      runtime.consecutiveFailures = 0;
      runtime.breakerOpenUntil = 0;
      return true;
    } catch {
      this.recordFailure();
      return false;
    }
  }

  private async ensurePool(): Promise<Pool> {
    if (runtime.pool && runtime.poolKey === poolKey(this.config)) return runtime.pool;

    if (runtime.pool) {
      await runtime.pool.end();
      runtime.pool = null;
    }

    runtime.poolKey = poolKey(this.config);
    runtime.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      database: this.config.database,
      connectionLimit: POOL_SIZE,
      maxIdle: POOL_SIZE,
      idleTimeout: IDLE_TIMEOUT_MS,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
    runtime.connected = true;
    this.ensureProbeLoop();
    return runtime.pool;
  }

  private ensureProbeLoop(): void {
    if (runtime.probeTimer) return;
    runtime.probeTimer = setInterval(() => {
      void this.runProbe();
    }, PROBE_INTERVAL_MS);
    if (typeof runtime.probeTimer.unref === "function") runtime.probeTimer.unref();
  }

  private async runProbe(): Promise<void> {
    if (runtime.probing || !runtime.pool) return;
    if (Date.now() < runtime.breakerOpenUntil) return;
    runtime.probing = true;
    try {
      await this.execute<RowDataPacket[]>("SELECT 1 AS ok");
      runtime.consecutiveFailures = 0;
      runtime.breakerOpenUntil = 0;
      runtime.reconnectAttempts = 0;
    } catch {
      this.recordFailure();
    } finally {
      runtime.probing = false;
    }
  }

  private recordFailure(): void {
    runtime.consecutiveFailures += 1;
    rememberMetric(QUERY_TIMEOUT_MS, false);
    if (runtime.consecutiveFailures >= BREAKER_THRESHOLD) {
      runtime.breakerOpenUntil = Date.now() + backoffDelay(runtime.consecutiveFailures);
      runtime.reconnectAttempts = Math.max(runtime.reconnectAttempts, runtime.consecutiveFailures - BREAKER_THRESHOLD + 1);
    }
  }

  private async execute<T extends RowDataPacket[]>(sql: string, params: unknown[] = []): Promise<[T, unknown]> {
    if (Date.now() < runtime.breakerOpenUntil) {
      throw new Error("Dolt circuit breaker open");
    }

    const pool = await this.ensurePool();
    const startedAt = performance.now();
    try {
      const result = await withTimeout(pool.execute<T>(sql, params), QUERY_TIMEOUT_MS);
      rememberMetric(performance.now() - startedAt, true);
      runtime.consecutiveFailures = 0;
      return result;
    } catch (error) {
      this.recordFailure();
      if ((error as { fatal?: boolean }).fatal) {
        runtime.connected = false;
      }
      throw error;
    }
  }

  private async selectIssues(filters: IssueFilters, issueId?: string): Promise<RowDataPacket[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (issueId) {
      conditions.push("id = ?");
      params.push(issueId);
    }
    if (filters.status?.length) {
      conditions.push(`status IN (${filters.status.map(() => "?").join(", ")})`);
      params.push(...filters.status);
    }
    if (filters.priority?.length) {
      conditions.push(`priority IN (${filters.priority.map(() => "?").join(", ")})`);
      params.push(...filters.priority);
    }
    if (filters.issue_type?.length) {
      conditions.push(`issue_type IN (${filters.issue_type.map(() => "?").join(", ")})`);
      params.push(...filters.issue_type);
    }
    if (filters.search) {
      conditions.push("(title LIKE ? OR description LIKE ?)");
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;

    const [rows] = await this.execute<RowDataPacket[]>(
      `SELECT * FROM issues ${where} ORDER BY priority ASC, created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return rows;
  }

  private async toIssue(row: RowDataPacket): Promise<BeadIssue> {
    return {
      id: String(row.id),
      title: String(row.title ?? ""),
      description: row.description ?? null,
      notes: row.notes ?? null,
      status: String(row.status ?? "open") as BeadIssue["status"],
      priority: Number(row.priority ?? 2) as BeadIssue["priority"],
      issue_type: String(row.issue_type ?? "task") as BeadIssue["issue_type"],
      owner: row.owner ?? null,
      created_at: String(row.created_at ?? ""),
      created_by: row.created_by ?? null,
      updated_at: String(row.updated_at ?? row.created_at ?? ""),
      closed_at: row.closed_at ?? undefined,
      close_reason: row.close_reason ?? undefined,
      project_id: "",
      dependencies: await this.getDependencies(String(row.id)),
      parent_id: row.parent_id ?? undefined,
      related_ids: await this.getRelatedIds(String(row.id)),
      labels: await this.getLabels(String(row.id)),
    };
  }

  private async getDependencies(issueId: string): Promise<BeadDependency[]> {
    const [rows] = await this.execute<RowDataPacket[]>(
      `SELECT d.depends_on_id as id, d.type as dependency_type, i.title, i.status FROM dependencies d JOIN issues i ON d.depends_on_id = i.id WHERE d.issue_id = ?`,
      [issueId],
    );
    return (rows as RowDataPacket[]).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      status: String(row.status ?? "open") as BeadDependency["status"],
      dependency_type: String(row.dependency_type ?? "blocks") as BeadDependency["dependency_type"],
    }));
  }

  private async getDependents(issueId: string): Promise<BeadDependency[]> {
    const [rows] = await this.execute<RowDataPacket[]>(
      `SELECT d.issue_id as id, d.type as dependency_type, i.title, i.status FROM dependencies d JOIN issues i ON d.issue_id = i.id WHERE d.depends_on_id = ?`,
      [issueId],
    );
    return (rows as RowDataPacket[]).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      status: String(row.status ?? "open") as BeadDependency["status"],
      dependency_type: String(row.dependency_type ?? "blocked_by") as BeadDependency["dependency_type"],
    }));
  }

  private async getRelatedIds(issueId: string): Promise<string[]> {
    try {
      const [rows] = await this.execute<RowDataPacket[]>("SELECT related_issue_id FROM issue_related WHERE issue_id = ?", [issueId]);
      return (rows as RowDataPacket[]).map((row) => String(row.related_issue_id)).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async getLabels(issueId: string): Promise<string[]> {
    try {
      const [rows] = await this.execute<RowDataPacket[]>("SELECT label FROM labels WHERE issue_id = ?", [issueId]);
      return (rows as RowDataPacket[]).map((row) => String(row.label)).filter(Boolean);
    } catch {
      return [];
    }
  }
}
