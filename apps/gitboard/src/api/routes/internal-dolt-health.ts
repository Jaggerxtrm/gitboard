import { Hono } from "hono";
import { getDoltHealthSnapshot } from "../../../../beadboard/src/core/dolt-client.ts";

export function createInternalDoltHealthRouter(): Hono {
  const app = new Hono();

  app.get("/dolt-health", (c) => {
    const host = c.req.header("host") ?? "";
    if (!host.startsWith("localhost") && !host.startsWith("127.0.0.1") && !host.startsWith("[::1]")) {
      return c.json({ error: "forbidden" }, 403);
    }

    const snapshot = getDoltHealthSnapshot();
    return c.json({
      pool_size: 4,
      idle_timeout_ms: 60_000,
      probe_interval_ms: 5_000,
      breaker_threshold: 5,
      backoff_min_ms: 250,
      backoff_max_ms: 30_000,
      query_timeout_ms: 3_000,
      ...snapshot,
    });
  });

  return app;
}
