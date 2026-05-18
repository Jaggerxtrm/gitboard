import type { Database } from "bun:sqlite";
import type { AttachPoolLike, EpicRun, SpecialistChain, SpecialistJob } from "./types.js";

const IN_FLIGHT_STATUSES = ["starting", "running"] as const;
const JOB_COLUMNS = "bead_id, chain_id, epic_id, chain_kind, status, updated_at_ms";

export function createObservabilityDao(pool: AttachPoolLike) {
  return {
    jobsByBead: (beadId: string) => readJobs(pool, `WHERE bead_id = ?`, `ORDER BY updated_at_ms DESC`, [beadId]),
    inFlightJobs: () => readJobs(pool, `WHERE status IN (${IN_FLIGHT_STATUSES.map(() => "?").join(",")})`, `ORDER BY updated_at_ms DESC`, [...IN_FLIGHT_STATUSES]),
    chainById: (chainId: string) => readJobs(pool, `WHERE chain_id = ?`, `ORDER BY CASE chain_kind WHEN 'executor' THEN 0 WHEN 'reviewer' THEN 1 ELSE 2 END, updated_at_ms ASC`, [chainId]) as SpecialistChain[],
    epicById: (epicId: string) => readJobs(pool, `WHERE epic_id = ?`, `ORDER BY updated_at_ms ASC`, [epicId]) as EpicRun[],
  };
}

function readJobs(pool: AttachPoolLike, whereSql: string, orderSql: string, params: readonly string[]): SpecialistJob[] {
  return pool.withAttached((db) => {
    const attached = listAttachedRepos(db);
    if (attached.length === 0) return [];

    const rows = attached.flatMap(({ name, slug }) => {
      // chain_kind precedence preserves executor before reviewer, then updated_at_ms ASC.
      const query = `SELECT '${escapeSql(slug)}' AS repoSlug, ${JOB_COLUMNS} FROM "${escapeSql(name)}".specialist_jobs ${whereSql} ${orderSql}`;
      return db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    });

    return rows.map(mapRow);
  });
}

function listAttachedRepos(db: Database): Array<{ name: string; slug: string }> {
  const rows = db.prepare("PRAGMA database_list").all() as Array<{ name?: string }>;
  return rows
    .map((row) => row.name)
    .filter((name): name is string => Boolean(name?.startsWith("repo_")))
    .map((name) => ({ name, slug: name.slice("repo_".length).replace(/_[0-9]+$/, "") }));
}

function mapRow(row: Record<string, unknown>): SpecialistJob {
  return {
    repoSlug: String(row.repoSlug),
    beadId: String(row.bead_id),
    chainId: row.chain_id == null ? null : String(row.chain_id),
    epicId: row.epic_id == null ? null : String(row.epic_id),
    chainKind: row.chain_kind == null ? null : String(row.chain_kind),
    status: String(row.status),
    updatedAt: new Date(Number(row.updated_at_ms)).toISOString(),
  };
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}
