import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Database } from "bun:sqlite";
import { createGithubRouter } from "./routes/github.ts";
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

  app.route("/api/github", createGithubRouter(db, registry));

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Serve built dashboard in production (dist/dashboard/ present)
  const distRoot = `${import.meta.dir}/../../dist/dashboard`;
  app.get("*", async (c) => {
    const pathname = new URL(c.req.url).pathname;
    let file = Bun.file(`${distRoot}${pathname}`);
    if (!(await file.exists())) file = Bun.file(`${distRoot}/index.html`);
    if (!(await file.exists())) return c.text("Not found", 404);
    return new Response(file);
  });

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

  console.log(`[api] Server running at http://${hostname}:${port}`);
}
