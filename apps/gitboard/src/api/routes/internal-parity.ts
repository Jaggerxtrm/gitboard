import { Hono } from "hono";
import type { ParityHarness } from "../../server/observability/parity.ts";

export function createInternalParityRouter(getParityHarness: () => ParityHarness | null): Hono {
  const app = new Hono();

  app.get("/parity/observability", (c) => {
    if (!isLocalhost(c.req.header("host") ?? "")) return c.json({ error: "forbidden" }, 403);
    const harness = getParityHarness();
    const summary = harness?.getLatestSummary() ?? null;
    return c.json({
      parity_ok_count: harness?.getParityOkCount() ?? 0,
      latest_summary: summary,
    });
  });

  return app;
}

function isLocalhost(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
}
