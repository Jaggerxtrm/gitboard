import { Hono } from "hono";
import { createXtrmDatabase } from "../../src/core/xtrm-store.ts";
import { createGraphDao } from "../../src/core/graph-dao.ts";
import { createGraphRouter } from "../../src/api/routes/graph.ts";

async function main(): Promise<void> {
  const db = createXtrmDatabase(":memory:");
  try {
    db.query("INSERT INTO sources (source_key, kind, path, origin, status) VALUES ('beads:repo-a', 'beads', '/tmp/repo-a/.beads', 'discovered', 'active')").run();
    for (let index = 0; index < 12; index += 1) {
      db.query("INSERT INTO substrate_issues (repo_slug, issue_id, title, state, priority, issue_type, created_at, updated_at) VALUES ('repo-a', ?, ?, 'open', ?, 'task', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
        .run(`A${index}`, `Issue ${index}`, index % 5);
      if (index > 0) {
        db.query("INSERT INTO substrate_dependencies (repo_slug, issue_id, dep_issue_id, relation, created_at) VALUES ('repo-a', ?, ?, 'blocks', CURRENT_TIMESTAMP)")
          .run(`A${index}`, `A${index - 1}`);
      }
    }
    db.query("INSERT INTO materialization_state (source_key, last_success_at, last_status, last_error) VALUES ('beads:repo-a', CURRENT_TIMESTAMP, 'error', 'internal path /tmp/secret')").run();

    const app = new Hono();
    app.route("/api/console/graph", createGraphRouter(createGraphDao({ xtrmDb: db })));

    const response = await app.fetch(new Request("http://localhost/api/console/graph?project=repo-a"));
    const json = await response.json() as {
      freshness: string;
      source_health: { status: string; message?: string; metadata?: Record<string, unknown> };
      nodes: Array<{ id: string }>;
      edges: unknown[];
    };

    if (json.nodes.length !== 12) throw new Error(`expected uninterrupted node set, got ${json.nodes.length}`);
    if (json.edges.length !== 11) throw new Error(`expected 11 edges, got ${json.edges.length}`);
    if (json.freshness !== "fresh") throw new Error(`expected fresh freshness, got ${json.freshness}`);
    if (json.source_health.status !== "degraded") throw new Error(`expected degraded source_health, got ${json.source_health.status}`);
    if (JSON.stringify(json.source_health).includes("/tmp/secret") || JSON.stringify(json.source_health).includes("beads:repo-a")) throw new Error("source_health leaked internal details");
    console.log("p4 graph degraded smoke ok");
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
