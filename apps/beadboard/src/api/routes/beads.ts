import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { createSubstrateRouter } from "../../../../gitboard/src/api/routes/substrate.ts";

export function createBeadsRouter(xtrmDb?: Database | null): Hono {
  return createSubstrateRouter(xtrmDb);
}

export const beadsRoutes = createBeadsRouter();
