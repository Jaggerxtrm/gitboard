import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Database } from "bun:sqlite";
import { createGithubRouter } from "./routes/github.ts";
import { beadsRoutes } from "./routes/beads.ts";
import { ChannelRegistry } from "./ws/channels.ts";
import { WsHandler } from "./ws/handler.ts";

export interface ServerOptions {
  port?: number;
  hostname?: string;
}

export function createApp(db: Database): {
  app: Hono;
  registry: ChannelRegistry;
  wsHandler: WsHandler;
} {
  const app = new Hono();
  const registry = new ChannelRegistry();
  const wsHandler = new WsHandler(registry);

  app.use("*", cors());

  // Health check
  app.get("/health", (c) => c.json({ status: "ok" }));

  // API routes
  app.route("/api/github", createGithubRouter(db, registry));
  app.route("/api/beads", beadsRoutes);

  // Serve built dashboards in production
  if (process.env.NODE_ENV === "production") {
    // Gitboard - serve assets and SPA
    app.use("/gitboard/assets/*", async (c) => {
      const path = c.req.path.replace("/gitboard", "/gitboard");
      const file = Bun.file(`./apps/gitboard/dist/dashboard${path}`);
      if (await file.exists()) return new Response(file);
      return c.notFound();
    });

    app.get("/gitboard", async (c) => {
      const file = Bun.file("./apps/gitboard/dist/dashboard/gitboard/index.html");
      return new Response(file, { headers: { "Content-Type": "text/html" } });
    });

    app.get("/gitboard/*", async (c) => {
      const file = Bun.file("./apps/gitboard/dist/dashboard/gitboard/index.html");
      return new Response(file, { headers: { "Content-Type": "text/html" } });
    });

    // Beadboard - serve assets and SPA
    app.use("/beadboard/assets/*", async (c) => {
      const path = c.req.path.replace("/beadboard", "/beadboard");
      const file = Bun.file(`./apps/beadboard/dist/dashboard${path}`);
      if (await file.exists()) return new Response(file);
      return c.notFound();
    });

    app.get("/beadboard", async (c) => {
      const file = Bun.file("./apps/beadboard/dist/dashboard/beadboard/index.html");
      return new Response(file, { headers: { "Content-Type": "text/html" } });
    });

    app.get("/beadboard/*", async (c) => {
      const file = Bun.file("./apps/beadboard/dist/dashboard/beadboard/index.html");
      return new Response(file, { headers: { "Content-Type": "text/html" } });
    });

    // Root redirects to gitboard
    app.get("/", (c) => c.redirect("/gitboard"));
  }

  return { app, registry, wsHandler };
}

export function startServer(db: Database, options: ServerOptions = {}): void {
  const port = options.port ?? 3000;
  const hostname = options.hostname ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost");

  const { app, wsHandler } = createApp(db);

  Bun.serve({
    port,
    hostname,
    fetch(req, server) {
      if (req.headers.get("upgrade") === "websocket") {
        const upgraded = server.upgrade(req);
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 });
        }
        return undefined;
      }
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        const id = wsHandler.connect({
          send: (data) => ws.send(data),
          close: () => ws.close(),
        });
        (ws as typeof ws & { connId: string }).connId = id;
        ws.send(JSON.stringify({ type: "connected", id }));
      },
      message(ws, msg) {
        const id = (ws as typeof ws & { connId: string }).connId;
        if (id) wsHandler.handleMessage(id, msg.toString());
      },
      close(ws) {
        const id = (ws as typeof ws & { connId: string }).connId;
        if (id) wsHandler.disconnect(id);
      },
    },
  });

  console.log(`[xtrm] Server running at http://${hostname}:${port}`);
  console.log(`[xtrm] - Gitboard: http://${hostname}:${port}/gitboard`);
  console.log(`[xtrm] - Beadboard: http://${hostname}:${port}/beadboard`);
}