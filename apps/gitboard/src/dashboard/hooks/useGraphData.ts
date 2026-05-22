import { useMemo } from "react";
import type { GraphResponse } from "../../types/graph.ts";
import type { WsMessage } from "../lib/ws.ts";
import { invalidateDashboardResource, useDashboardResource } from "../lib/resource.ts";
import { useWebSocket } from "./useWebSocket.ts";

const CACHE_TTL_MS = 10_000;
const STALE_RETRY_DELAY_MS = 750;

export function useGraphData(projectId: string | null) {
  const key = useMemo(() => projectId ?? null, [projectId]);
  const resource = useDashboardResource<GraphResponse>({
    key,
    cacheTtlMs: CACHE_TTL_MS,
    staleEmptyRetryMs: STALE_RETRY_DELAY_MS,
    isEmpty: (data) => data.nodes.length === 0 && (data.freshness ?? "stale") === "stale",
    fetcher: async (resourceKey, options) => {
      const refresh = options.refresh ? "&refresh=true" : "";
      const response = await fetch(`/api/console/graph?project_id=${encodeURIComponent(resourceKey)}${refresh}`);
      if (!response.ok) throw new Error(`Graph fetch failed (${response.status})`);
      return response.json() as Promise<GraphResponse>;
    },
  });

  useWebSocket("beads:changes", (msg: WsMessage) => {
    const data = msg.data as { projectId?: string; project_id?: string } | undefined;
    const eventProject = data?.projectId ?? data?.project_id;
    if (eventProject && eventProject !== key) return;
    if (key) invalidateDashboardResource(key);
  });

  useWebSocket("specialists:activity", () => {
    if (key) invalidateDashboardResource(key);
  });

  return { ...resource, reload: resource.refresh };
}
