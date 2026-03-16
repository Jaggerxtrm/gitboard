/**
 * Hono API server for beadboard
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";

export function createApp() {
  const app = new Hono();

  // CORS for development
  app.use("*", cors());

  // Health check
  app.get("/health", (c) => c.json({ status: "ok" }));

  // API routes will be added here
  // app.route("/api/beads", beadsRoutes);

  // Serve dashboard static files in production
  if (process.env.NODE_ENV === "production") {
    app.use("*", serveStatic({ root: "./dist/dashboard" }));
    app.get("*", serveStatic({ path: "./dist/dashboard/index.html" }));
  }

  return app;
}

export function startServer(port: number = 3001) {
  const app = createApp();
  
  console.log(`[api] Server running at http://localhost:${port}`);
  
  Bun.serve({
    port,
    fetch: app.fetch,
  });

  return app;
}
