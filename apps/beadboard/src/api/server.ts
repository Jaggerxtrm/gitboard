/**
 * Hono API server for beadboard
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { beadsRoutes } from "./routes/beads.ts";

export function createApp() {
  const app = new Hono();

  // CORS for development
  app.use("*", cors());

  // Health check
  app.get("/health", (c) => c.json({ status: "ok" }));

  // API routes
  app.route("/api/beads", beadsRoutes);

  // Serve dashboard static files in production
  if (process.env.NODE_ENV === "production") {
    const distPath = "./apps/beadboard/dist/dashboard";
    
    // Serve assets folder
    app.use("/assets/*", serveStatic({ root: distPath }));
    
    // Catch-all for SPA - serve index.html for non-API routes
    app.get("/*", async (c, next) => {
      const path = c.req.path;
      
      // Skip API routes
      if (path.startsWith("/api/") || path === "/health") {
        return next();
      }
      
      // Try to serve static file first
      const file = Bun.file(`./apps/beadboard/dist/dashboard${path}`);
      if (await file.exists()) {
        return new Response(file);
      }
      
      // Fallback to index.html for SPA
      const indexFile = Bun.file(`./apps/beadboard/dist/dashboard/index.html`);
      return new Response(indexFile, {
        headers: { "Content-Type": "text/html" }
      });
    });
  }

  return app;
}

export function startServer(port: number = 3001) {
  const app = createApp();
  
  console.log(`[beadboard] Server running at http://localhost:${port}`);
  
  Bun.serve({
    port,
    fetch: app.fetch,
  });

  return app;
}