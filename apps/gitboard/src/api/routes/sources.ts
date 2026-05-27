import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { UnifiedScanner } from "../../core/unified-scanner.ts";
import { canRefreshSources, createSourceRefreshState, formatSourceDisplayPath, isLocalhost } from "./sources-policy.ts";

type SourceRow = { source_key: string; kind: string; path: string; origin: string; status: string; discovered_at: string | null; last_seen_at: string | null };

const sourceRefreshState = createSourceRefreshState();

export function createSourcesRouter(xtrmDb: Database | null, scanner: UnifiedScanner | null = null): Hono {
  const routes = new Hono();

  routes.get("/", async (c) => {
    if (!xtrmDb) return c.json({ sources: [] });
    if (scanner) return c.json({ sources: await scanner.getSources() });
    const sources = xtrmDb.query<SourceRow, []>("SELECT source_key, kind, path, origin, status, discovered_at, last_seen_at FROM sources ORDER BY kind ASC, source_key ASC").all();
    return c.json({ sources: sources.map((row) => ({ source_key: row.source_key, kind: row.kind, display_path: formatSourceDisplayPath(row.path), origin: row.origin, status: row.status, discovered_at: row.discovered_at, last_seen_at: row.last_seen_at })) });
  });

  routes.post("/refresh", async (c) => {
    if (!isLocalhost(c.req.header("host") ?? "")) return c.json({ error: "forbidden" }, 403);
    if (!scanner) return c.json({ error: "sources refresh unavailable" }, 503);
    const gate = canRefreshSources(Date.now(), sourceRefreshState);
    if (!gate.ok) return c.json(gate.body, gate.status);
    sourceRefreshState.inFlight = scanner.refresh();
    try {
      const sources = await sourceRefreshState.inFlight;
      sourceRefreshState.lastCompletedAt = Date.now();
      return c.json({ refreshed: sources.length, sources: sources.map((source) => ({ source_key: source.sourceKey, kind: source.kind, display_path: formatSourceDisplayPath(source.path), status: source.status })) });
    } finally {
      sourceRefreshState.inFlight = null;
    }
  });

  return routes;
}

