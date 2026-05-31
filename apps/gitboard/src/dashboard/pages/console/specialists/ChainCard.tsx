import type { ChainSummary } from "../../../hooks/useChains.ts";
import { ChainListRow } from "./ChainListRow.tsx";

export function ChainCard({ chain, selected, onSelect }: { chain: ChainSummary; selected: boolean; onSelect: () => void }) {
  const classes = [
    "console-specialists-card",
    selected ? "is-selected" : "",
    chain.status === "running" ? "is-live" : "",
  ].filter(Boolean).join(" ");

  return (
    <button type="button" className={classes} onClick={onSelect}>
      <ChainListRow chain={chain} />
    </button>
  );
}
