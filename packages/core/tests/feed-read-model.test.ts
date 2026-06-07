import { describe, expect, it } from "vitest";
import { readFeedPage } from "../src/state/index.ts";

describe("feed read model", () => {
  it("rolls up feed rows and preserves opaque cursor ordering", () => {
    const db = createFakeFeedDb();

    const first = readFeedPage(db as never, { limit: 2 });
    expect(first.rows.map((row) => row.source)).toEqual(["specialists", "beads"]);
    expect(first.cursor.next).toEqual(expect.any(String));
    expect(first.rows[0]).toEqual(expect.objectContaining({
      kind: "job_completed",
      redaction_status: "clean",
      drilldown: expect.objectContaining({ job_id: "job-1", forensic_event_ids: [1], evidence_ids: ["commit-1"] }),
    }));

    const second = readFeedPage(db as never, { limit: 10, cursor: first.cursor.next });
    expect(second.rows.map((row) => row.source)).toEqual(["github", "materializer"]);
    expect(second.rows[1]).toEqual(expect.objectContaining({ source: "materializer", kind: "malformed_source_row", status: "degraded", redaction_status: "redacted" }));
    expect(second.cursor.next).toBeNull();
  });
});

function createFakeFeedDb() {
  const tables = new Set(["xtrm_forensic_events", "xtrm_evidence_refs", "substrate_issues", "github_events"]);
  const forensicRows = [
    {
      id: 1,
      repo_slug: "repo-a",
      job_id: "job-1",
      seq: 2,
      t_unix_ms: 1700000000020,
      severity: "info",
      event_family: "job",
      event_name: "job.completed",
      redaction_json: JSON.stringify({ status: "clean" }),
      body_json: JSON.stringify({ evidence_refs: [{ kind: "commit", id: "commit-1" }] }),
      resource_json: JSON.stringify({ participant_role: "executor" }),
    },
    {
      id: 2,
      repo_slug: "repo-a",
      job_id: null,
      seq: 1,
      t_unix_ms: 1700000003000,
      severity: "warn",
      event_family: "materializer",
      event_name: "malformed_source_row",
      redaction_json: JSON.stringify({ status: "redacted" }),
      body_json: JSON.stringify({}),
      resource_json: JSON.stringify({}),
    },
  ];
  const evidenceRows = [{ job_id: "job-1", evidence_id: "commit-1" }];
  const issueRows = [{
    repo_slug: "repo-a",
    issue_id: "forge-q5ki",
    title: "Telemetry bridge",
    state: "in_progress",
    updated_at: "2023-11-14T22:13:21.000Z",
    created_at: "2023-11-14T22:13:21.000Z",
  }];
  const githubRows = [{
    id: "gh-1",
    type: "pull_request",
    repo: "owner/repo",
    action: "merged",
    title: "PR #4 merged",
    created_at: "2023-11-14T22:13:22.000Z",
  }];

  return {
    query(sql: string) {
      return {
        get(table?: string) {
          if (sql.includes("sqlite_master")) return table && tables.has(table) ? { 1: 1 } : undefined;
          return undefined;
        },
        all() {
          if (sql.includes("FROM xtrm_forensic_events")) return forensicRows;
          if (sql.includes("FROM xtrm_evidence_refs")) return evidenceRows;
          if (sql.includes("FROM substrate_issues")) return issueRows;
          if (sql.includes("FROM github_events")) return githubRows;
          return [];
        },
      };
    },
  };
}
