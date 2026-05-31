import type { ChainStatus, ChainSummary } from "../../../hooks/useChains.ts";

export type CockpitFilters = Set<ChainStatus | "all">;

export interface CockpitSelection {
  visibleChains: ChainSummary[];
  selectedChainId: string | null;
  selectedChain: ChainSummary | null;
}

export function deriveSelection(
  chains: ChainSummary[],
  filters: CockpitFilters,
  selectedChainId: string | null,
): CockpitSelection {
  const visibleChains = chains.filter((chain) => matchesFilters(chain, filters));
  if (visibleChains.length === 0) {
    return { visibleChains, selectedChainId: null, selectedChain: null };
  }

  const resolvedSelectedChainId = visibleChains.some((chain) => chain.chainId === selectedChainId)
    ? selectedChainId
    : visibleChains[0]!.chainId;
  const selectedChain = visibleChains.find((chain) => chain.chainId === resolvedSelectedChainId) ?? null;

  return { visibleChains, selectedChainId: resolvedSelectedChainId, selectedChain };
}

export function toggleFilter(current: CockpitFilters, status: ChainStatus | "all"): CockpitFilters {
  if (status === "all") return new Set(["all"]);
  const next = new Set(current);
  next.delete("all");
  if (next.has(status)) next.delete(status);
  else next.add(status);
  return next.size === 0 ? new Set(["all"]) : next;
}

export function buildListRenderedTelemetry(visibleChains: ChainSummary[], typesByCount: Record<string, number>): Record<string, unknown> {
  return { rowCount: visibleChains.length, paletteVersion: "type-palette@1", typesByCount };
}

export function buildFirstPaintTelemetry(visibleChains: ChainSummary[]): Record<string, unknown> {
  return { rowCount: visibleChains.length, paletteVersion: "type-palette@1" };
}

export function buildChainSelectedTelemetry(chainId: string): Record<string, unknown> {
  return { chainId };
}

export function buildBeadActivitySwappedTelemetry(selectedChain: ChainSummary): Record<string, unknown> {
  return { chainId: selectedChain.chainId, beadId: selectedChain.rootBeadId };
}

function matchesFilters(chain: ChainSummary, filters: CockpitFilters): boolean {
  if (filters.has("all")) return true;
  return filters.has(chain.status);
}
